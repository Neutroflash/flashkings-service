import { IInvoiceRepository } from "../../domain/repositories/IInvoiceRepository";
import { IInvoicingGateway } from "../../domain/services/IInvoicingGateway";
import { ISunatRetryScheduler } from "../../domain/services/ISunatRetryScheduler";

const MAX_ATTEMPTS = Number(process.env.SUNAT_RETRY_MAX_ATTEMPTS ?? 5);

/** Invocado por el worker de BullMQ para un Invoice en PENDING_SUNAT — idempotente: si el
 * comprobante ya salió de PENDING_SUNAT por otra vía, es un no-op. */
export class RetryInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly invoicingGateway: IInvoicingGateway,
    private readonly sunatRetryScheduler: ISunatRetryScheduler,
  ) {}

  async execute(invoiceId: string): Promise<void> {
    const invoice = await this.invoiceRepository.findById(invoiceId);
    if (!invoice || invoice.status !== "PENDING_SUNAT") return;

    const result = await this.invoicingGateway.retryPending(invoice);

    if (result.status === "PENDING_SUNAT") {
      const nextAttempt = invoice.sunatRetryCount + 1;
      await this.invoiceRepository.incrementRetryCount(invoice.id);
      // Se agotaron los reintentos automáticos — queda PENDING_SUNAT visible para revisar a mano
      // en vez de seguir insistiendo indefinidamente.
      if (nextAttempt < MAX_ATTEMPTS) {
        await this.sunatRetryScheduler.schedule(invoice.id, nextAttempt);
      }
      return;
    }

    await this.invoiceRepository.updateRetryResult(invoice.id, {
      status: result.status,
      providerResponse: result.raw,
      sunatRetryCount: invoice.sunatRetryCount,
    });
  }
}
