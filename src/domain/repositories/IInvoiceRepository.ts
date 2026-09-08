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
  /** Solo en NOTA_CREDITO: el comprobante corregido, el motivo (catálogo 09) y el reembolso que la originó. */
  relatedInvoiceId?: string | null;
  noteReasonCode?: string | null;
  refundId?: string | null;
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
  reserveNumber(type: InvoiceType, series?: string): Promise<ReservedInvoiceNumber>;
  save(data: SaveInvoiceData): Promise<Invoice>;
  /** El comprobante (boleta/factura) de la orden — nunca una nota de crédito. */
  findByOrderId(orderId: string): Promise<Invoice | null>;
  /** Las notas de crédito emitidas contra un comprobante, más reciente primero. */
  findCreditNotesFor(invoiceId: string): Promise<Invoice[]>;
  /** Marca un comprobante como anulado por una nota de crédito de anulación total. */
  markVoid(invoiceId: string): Promise<void>;
  findById(id: string): Promise<Invoice | null>;
  /** Aplica el resultado TERMINAL de un reintento (ISSUED/FAILED) — nunca vuelve a pisar el XML. */
  updateRetryResult(id: string, data: RetryResultData): Promise<void>;
  /** Sigue PENDING_SUNAT tras un reintento sin resultado definitivo — solo avanza el contador. */
  incrementRetryCount(id: string): Promise<void>;
}
