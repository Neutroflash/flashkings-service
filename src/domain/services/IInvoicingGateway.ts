import { Order } from "../entities/Order";
import { CorrectableInvoiceType, Invoice } from "../entities/Invoice";

export interface IssueInvoiceInput {
  order: Order;
  /** Boleta o factura — una nota de crédito se emite por issueCreditNote. */
  type: CorrectableInvoiceType;
  series: string;
  number: number;
  documentType: string;
  documentNumber: string;
  /** Required by SUNAT for FACTURA (razón social of the buyer); irrelevant for BOLETA. */
  businessName?: string;
}

export interface IssueInvoiceResult {
  status: "ISSUED" | "FAILED" | "PENDING_SUNAT";
  pdfUrl: string | null;
  xmlUrl: string | null;
  raw: unknown;
  /** XML firmado — presente en ISSUED/FAILED/PENDING_SUNAT (se firma antes de intentar el envío),
   * `null` solo en el gateway fake. Necesario para reintentar un PENDING_SUNAT sin volver a firmar. */
  signedXml: string | null;
}

/**
 * Port a la emisión de comprobantes electrónicos. `SunatInvoicingGateway` (integración directa
 * con SUNAT, sin PSE/OSE — ver src/infrastructure/invoicing/sunat/) es la implementación real;
 * `FakeInvoicingGateway` sigue siendo el default (`SUNAT_PROVIDER=fake`, ver config/env.ts) hasta
 * que se configuren las credenciales SUNAT reales del negocio.
 */
export interface IssueCreditNoteInput {
  order: Order;
  /** El comprobante que esta nota corrige — de él salen serie, número y tipo del documento referido. */
  relatedInvoice: Invoice;
  series: string;
  number: number;
  /** Catálogo 09 de SUNAT. */
  reasonCode: string;
  reasonText: string;
  /** Las líneas devueltas. Si va vacío, la nota cubre la orden completa. */
  items: { description: string; quantity: number; unitPriceWithTax: number }[];
}

export interface IInvoicingGateway {
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  /**
   * Emite una nota de crédito contra un comprobante ya emitido. Devuelve el mismo shape que
   * issueInvoice a propósito: una nota atraviesa exactamente el mismo ciclo (firma, envío,
   * PENDING_SUNAT reintentable sobre el mismo signedXml), así que el worker de reintento y el
   * repositorio la tratan sin ramificar por tipo.
   */
  issueCreditNote(input: IssueCreditNoteInput): Promise<IssueInvoiceResult>;
  /** Reintenta un envío PENDING_SUNAT — reenvía `invoice.signedXml` tal cual está, nunca lo
   * regenera ni lo vuelve a firmar (el documento ya es válido; lo que falló fue la disponibilidad
   * de SUNAT, no el contenido). */
  retryPending(invoice: Invoice): Promise<IssueInvoiceResult>;
}
