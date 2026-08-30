import { Worker } from "bullmq";
import { redisConnection } from "./redisConnection";
import { LOW_STOCK_QUEUE_NAME } from "./lowStockQueue";
import { prisma } from "../database/prisma";
import { PrismaProductRepository } from "../database/PrismaProductRepository";
import { PrismaUserRepository } from "../database/PrismaUserRepository";
import { emailService } from "../email/emailService";
import { RunLowStockDigestUseCase } from "../../application/inventory/RunLowStockDigestUseCase";
import { env } from "../../config/env";
import { logger } from "../logging/logger";

export function createLowStockWorker(): Worker {
  const runLowStockDigestUseCase = new RunLowStockDigestUseCase(
    new PrismaProductRepository(prisma),
    new PrismaUserRepository(prisma),
    emailService,
  );

  const worker = new Worker(
    LOW_STOCK_QUEUE_NAME,
    async () => {
      const notified = await runLowStockDigestUseCase.execute(env.lowStock.threshold);
      logger.info({ notified, threshold: env.lowStock.threshold }, "[low-stock] digest procesado");
    },
    { connection: redisConnection },
  );

  worker.on("failed", (_job, err) => {
    logger.error({ err }, "[low-stock] fallo al procesar el digest");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "[low-stock] error de conexión/infraestructura del worker");
  });

  return worker;
}
