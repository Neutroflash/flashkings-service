import { Worker } from "bullmq";
import { redisConnection } from "./redisConnection";
import { STOCK_HOLD_QUEUE_NAME } from "./stockHoldQueue";
import { prisma } from "../database/prisma";
import { PrismaOrderRepository } from "../database/PrismaOrderRepository";
import { ExpireOrderUseCase } from "../../application/orders/ExpireOrderUseCase";

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
    console.log(`[stock-hold] hold liberado (o ya resuelto) para la orden ${job.data.orderId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[stock-hold] fallo al liberar la orden ${job?.data.orderId}:`, err);
  });

  return worker;
}
