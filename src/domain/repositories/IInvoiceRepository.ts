import { Invoice, InvoiceType } from "../entities/Invoice";

export interface ReservedInvoiceNumber {
  series: string;
  number: number;
}

export interface SaveInvoiceData {
  orderId: string;
  type: InvoiceType;
  series: string;
  number: number;
  documentType: string;
  documentNumber: string;
  businessName?: string;
  status: "ISSUED" | "FAILED" | "PENDING_SUNAT";
  pdfUrl: string | null;
  xmlUrl: string | null;
  providerResponse: unknown;
  signedXml: string | null;
}

export interface RetryResultData {
  status: "ISSUED" | "FAILED";
  providerResponse: unknown;
  sunatRetryCount: number;
}

export interface IInvoiceRepository {
  /**
   * Atomically reserves the next series/number for a comprobante type (see InvoiceCounter) —
   * must happen BEFORE calling the gateway, since a real PSE needs its own number to issue the
   * document. Once reserved, a number is never reused, even if the gateway call fails afterward
   * (the same reality any point-of-sale has: a burned number gets voided, not recycled).
   */
  reserveNumber(type: InvoiceType): Promise<ReservedInvoiceNumber>;
  save(data: SaveInvoiceData): Promise<Invoice>;
  findByOrderId(orderId: string): Promise<Invoice | null>;
  findById(id: string): Promise<Invoice | null>;
  /** Aplica el resultado TERMINAL de un reintento (ISSUED/FAILED) — nunca vuelve a pisar el XML. */
  updateRetryResult(id: string, data: RetryResultData): Promise<void>;
  /** Sigue PENDING_SUNAT tras un reintento sin resultado definitivo — solo avanza el contador. */
  incrementRetryCount(id: string): Promise<void>;
}
