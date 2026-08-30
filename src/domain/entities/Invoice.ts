export type InvoiceType = "BOLETA" | "FACTURA";
// PENDING_SUNAT: SUNAT no respondió (no es un rechazo) — el XML ya está firmado y se reintenta el
// mismo envío, ver signedXml y el worker de reintento (sunatRetryWorker).
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
}
