import { Worker } from "bullmq";
import { redisConnection } from "./redisConnection";
import { STOCK_HOLD_QUEUE_NAME } from "./stockHoldQueue";
import { prisma } from "../database/prisma";
import { PrismaOrderRepository } from "../database/PrismaOrderRepository";
import { ExpireOrderUseCase } from "../../application/orders/ExpireOrderUseCase";
import { logger } from "../logging/logger";

interface StockHoldJobData {
  orderId: string;
}

export function createStockHoldWorker(): Worker<StockHoldJobData> {
  const expireOrderUseCase = new ExpireOrderUseCase(new PrismaOrderRepository(prisma));

  const worker = new Worker<StockHoldJobData>(
    STOCK_HOLD_QUEUE_NAME,
    async (job) => {
      await expireOrderUseCase.execute(job.data.orderId);
    },
    { connection: redisConnection },
  );

  worker.on("completed", (job) => {
    logger.info({ orderId: job.data.orderId }, "[stock-hold] hold liberado (o ya resuelto)");
  });

  worker.on("failed", (job, err) => {
    logger.error({ orderId: job?.data.orderId, err }, "[stock-hold] fallo al liberar la orden");
  });

  // Distinto de "failed" (un job puntual que falló) — esto es la conexión/infraestructura del
  // worker en sí (Redis caído, etc.). Sin este listener, un error acá quedaba sin ningún rastro.
  worker.on("error", (err) => {
    logger.error({ err }, "[stock-hold] error de conexión/infraestructura del worker");
  });

  return worker;
}
