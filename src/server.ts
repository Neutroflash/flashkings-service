import { createApp } from "./app";
import { env } from "./config/env";
import { registerEventListeners } from "./infrastructure/events/registerEventListeners";
import { logger } from "./infrastructure/logging/logger";
import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";
import { createSunatRetryWorker } from "./infrastructure/queue/sunatRetryWorker";
import { createLowStockWorker } from "./infrastructure/queue/lowStockWorker";
import { ensureLowStockRepeatingJob } from "./infrastructure/queue/lowStockQueue";

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
  const stockHoldWorker = createStockHoldWorker();
  const sunatRetryWorker = createSunatRetryWorker();
  const lowStockWorker = env.lowStock.enabled ? createLowStockWorker() : undefined;
  if (lowStockWorker) void ensureLowStockRepeatingJob();
  logger.info("Workers 'stock-hold', 'sunat-retry' y 'low-stock' corriendo en el mismo proceso que la API (RUN_WORKER_IN_PROCESS=true)");
  process.on("SIGTERM", async () => {
    await Promise.all([stockHoldWorker.close(), sunatRetryWorker.close(), lowStockWorker?.close()]);
  });
}
