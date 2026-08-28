export type InvoiceType = "BOLETA" | "FACTURA";
export type InvoiceStatus = "ISSUED" | "FAILED" | "VOID";

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
  issuedAt: Date | null;
  createdAt: Date;
}
