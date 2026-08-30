import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";
import { createSunatRetryWorker } from "./infrastructure/queue/sunatRetryWorker";
import { logger } from "./infrastructure/logging/logger";

const stockHoldWorker = createStockHoldWorker();
const sunatRetryWorker = createSunatRetryWorker();

logger.info("Flashkings worker escuchando las colas 'stock-hold' y 'sunat-retry'...");

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
  await Promise.all([stockHoldWorker.close(), sunatRetryWorker.close()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
// SIGINT (Ctrl+C en local, y lo que mandan algunos process managers) — antes solo se manejaba
// SIGTERM, así que un Ctrl+C en dev dejaba el proceso colgado sin cerrar las conexiones de Redis.
process.on("SIGINT", () => void shutdown("SIGINT"));
