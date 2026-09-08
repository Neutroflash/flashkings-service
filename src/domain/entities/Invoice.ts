/** Tipos del catálogo 01 de SUNAT que este negocio emite. NOTA_CREDITO corrige a una de las otras dos. */
export type InvoiceType = "BOLETA" | "FACTURA" | "NOTA_CREDITO";

/** Los dos tipos que una nota de crédito puede corregir — nunca otra nota. */
export type CorrectableInvoiceType = Exclude<InvoiceType, "NOTA_CREDITO">;

// PENDING_SUNAT: SUNAT no respondió (no es un rechazo) — el XML ya está firmado y se reintenta el
// mismo envío, ver signedXml y el worker de reintento (sunatRetryWorker).
// VOID: el comprobante fue anulado por una nota de crédito de anulación total que SUNAT aceptó.
export type InvoiceStatus = "PENDING_SUNAT" | "ISSUED" | "FAILED" | "VOID";

export interface Invoice {
  id: string;
  orderId: string;
  type: InvoiceType;
  status: InvoiceStatus;
  series: string;
  number: number;
  documentType: string;
  documentNumber: string;
  businessName: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  providerResponse: unknown;
  signedXml: string | null;
  sunatRetryCount: number;
  issuedAt: Date | null;
  createdAt: Date;
  /** Solo en NOTA_CREDITO: el comprobante que corrige, y el motivo (catálogo 09). */
  relatedInvoiceId: string | null;
  noteReasonCode: string | null;
  refundId: string | null;
}

export function isCreditNote(invoice: Invoice): boolean {
  return invoice.type === "NOTA_CREDITO";
}

/**
 * El comprobante "principal" de una orden: la boleta o factura, nunca una nota. Existe porque
 * `Order.invoices` pasó a ser 1-N cuando aparecieron las notas de crédito, y casi todo el código
 * (el panel admin, el PDF, la emisión) sigue queriendo hablar de "el comprobante de esta orden".
 */
export function findComprobante(invoices: Invoice[]): Invoice | null {
  return invoices.find((i) => i.type !== "NOTA_CREDITO") ?? null;
}

export function findCreditNotes(invoices: Invoice[]): Invoice[] {
  return invoices.filter((i) => i.type === "NOTA_CREDITO");
}
