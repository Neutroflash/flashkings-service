import { Worker } from "bullmq";
import { redisConnection } from "./redisConnection";
import { SUNAT_RETRY_QUEUE_NAME } from "./sunatRetryQueue";
import { prisma } from "../database/prisma";
import { PrismaInvoiceRepository } from "../database/PrismaInvoiceRepository";
import { invoicingGateway } from "../invoicing/invoicingGateway";
import { sunatRetryScheduler } from "./sunatRetryScheduler";
import { RetryInvoiceUseCase } from "../../application/invoicing/RetryInvoiceUseCase";
import { logger } from "../logging/logger";

interface SunatRetryJobData {
  invoiceId: string;
}

export function createSunatRetryWorker(): Worker<SunatRetryJobData> {
  const retryInvoiceUseCase = new RetryInvoiceUseCase(new PrismaInvoiceRepository(prisma), invoicingGateway, sunatRetryScheduler);

  const worker = new Worker<SunatRetryJobData>(
    SUNAT_RETRY_QUEUE_NAME,
    async (job) => {
      await retryInvoiceUseCase.execute(job.data.invoiceId);
    },
    { connection: redisConnection },
  );

  worker.on("completed", (job) => {
    logger.info({ invoiceId: job.data.invoiceId }, "[sunat-retry] reintento procesado");
  });

  worker.on("failed", (job, err) => {
    logger.error({ invoiceId: job?.data.invoiceId, err }, "[sunat-retry] fallo al reintentar el comprobante");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "[sunat-retry] error de conexión/infraestructura del worker");
  });

  return worker;
}
