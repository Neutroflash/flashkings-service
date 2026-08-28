import { createStockHoldWorker } from "./infrastructure/queue/stockHoldWorker";

const worker = createStockHoldWorker();

console.log("Flashkings stock-hold worker escuchando la cola 'stock-hold'...");

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
