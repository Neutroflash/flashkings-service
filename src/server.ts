import { createApp } from "./app";
import { env } from "./config/env";
import { registerEventListeners } from "./infrastructure/events/registerEventListeners";
import { logger } from "./infrastructure/logging/logger";
import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";

registerEventListeners();

const app = createApp();

app.listen(env.port, () => {
  logger.info(`Flashkings API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
});

// Free-tier deploys (no separate always-on worker service) run the stock-hold expiry worker
// inside this same process via RUN_WORKER_IN_PROCESS=true, instead of as its own service (see
// worker.ts, which stays the standalone entrypoint for a real production deploy). Tradeoff: if
// the host puts this process to sleep on inactivity, a hold's expiry is delayed until the next
// request wakes it up, instead of firing exactly on time — acceptable for a low-traffic launch,
// not for real scale, at which point switch back to running worker.ts as its own service.
if (env.runWorkerInProcess) {
  const worker = createStockHoldWorker();
  logger.info("Stock-hold worker corriendo en el mismo proceso que la API (RUN_WORKER_IN_PROCESS=true)");
  process.on("SIGTERM", async () => {
    await worker.close();
  });
}
