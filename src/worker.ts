import { Worker } from "bullmq";
import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";
import { createSunatRetryWorker } from "./infrastructure/queue/sunatRetryWorker";
import { createLowStockWorker } from "./infrastructure/queue/lowStockWorker";
import { ensureLowStockRepeatingJob } from "./infrastructure/queue/lowStockQueue";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";

const stockHoldWorker = createStockHoldWorker();
const sunatRetryWorker = createSunatRetryWorker();

let lowStockWorker: Worker | undefined;
if (env.lowStock.enabled) {
  lowStockWorker = createLowStockWorker();
  void ensureLowStockRepeatingJob();
}

logger.info(
  `Flashkings worker escuchando las colas 'stock-hold', 'sunat-retry'${env.lowStock.enabled ? " y 'low-stock'" : ""}...`,
);

// Deja que el proceso termine con una traza en logs en vez de morir en silencio — la política de
// reinicio la impone la plataforma de hosting (Render `restart: always`, systemd, PM2, etc.), acá
// solo se garantiza que cuando reinicie, quede escrito por qué. Sin esto, una excepción no
// atrapada en cualquiera de los dos workers (o en cualquier promesa suelta) mataba el proceso sin
// dejar ningún rastro útil para diagnosticar qué pasó.
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "[worker] unhandledRejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "[worker] uncaughtException");
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info(`[worker] ${signal} recibido, cerrando workers...`);
  await Promise.all([stockHoldWorker.close(), sunatRetryWorker.close(), lowStockWorker?.close()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// SIGINT (Ctrl+C en local, y lo que mandan algunos process managers) — antes solo se manejaba
// SIGTERM, así que un Ctrl+C en dev dejaba el proceso colgado sin cerrar las conexiones de Redis.
process.on("SIGINT", () => void shutdown("SIGINT"));
