import { Order } from "../entities/Order";
import { Invoice, InvoiceType } from "../entities/Invoice";

export interface IssueInvoiceInput {
  order: Order;
  type: InvoiceType;
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
export interface IInvoicingGateway {
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
  /** Reintenta un envío PENDING_SUNAT — reenvía `invoice.signedXml` tal cual está, nunca lo
   * regenera ni lo vuelve a firmar (el documento ya es válido; lo que falló fue la disponibilidad
   * de SUNAT, no el contenido). */
  retryPending(invoice: Invoice): Promise<IssueInvoiceResult>;
}
