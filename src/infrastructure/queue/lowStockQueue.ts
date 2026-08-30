import { Queue } from "bullmq";
import { redisConnection } from "./redisConnection";

export const LOW_STOCK_QUEUE_NAME = "low-stock";

export const lowStockQueue = new Queue(LOW_STOCK_QUEUE_NAME, { connection: redisConnection });

/**
 * Job recurrente (no puntual como stock-hold/sunat-retry) — corre una vez al día a las 8am hora
 * Perú (UTC-5 fijo, sin horario de verano; `13 UTC` = `08:00 PE`). BullMQ 6.x reemplazó el
 * `repeat` de `queue.add()` por `upsertJobScheduler` — "upsert" ya lo hace idempotente: llamarlo
 * dos veces (en cada arranque del worker) actualiza el mismo scheduler, no crea uno duplicado.
 */
export async function ensureLowStockRepeatingJob(): Promise<void> {
  await lowStockQueue.upsertJobScheduler("low-stock-daily", { pattern: "0 13 * * *" }, { name: "run-digest" });
}
