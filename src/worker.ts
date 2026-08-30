import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";
import { createSunatRetryWorker } from "./infrastructure/queue/sunatRetryWorker";

const stockHoldWorker = createStockHoldWorker();
const sunatRetryWorker = createSunatRetryWorker();

console.log("Flashkings worker escuchando las colas 'stock-hold' y 'sunat-retry'...");

process.on("SIGTERM", async () => {
  await Promise.all([stockHoldWorker.close(), sunatRetryWorker.close()]);
  process.exit(0);
});
