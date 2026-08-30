export interface ISunatRetryScheduler {
  /** Agenda un reintento de envío para un Invoice en PENDING_SUNAT, con backoff creciente según attempt. */
  schedule(invoiceId: string, attempt: number): Promise<void>;
}
