import { Order } from "../entities/Order";
import { InvoiceType } from "../entities/Invoice";

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
  status: "ISSUED" | "FAILED";
  pdfUrl: string | null;
  xmlUrl: string | null;
  raw: unknown;
}

/**
 * Port to a SUNAT-authorized PSE (Proveedor de Servicios Electrónicos) — e.g. Nubefact. Not
 * connected yet: the business isn't registered as an "emisor electrónico" with SUNAT, so
 * FakeInvoicingGateway is the only implementation for now. Whichever PSE gets chosen later
 * implements this same port — see INVOICING_PROVIDER in config/env.ts.
 */
export interface IInvoicingGateway {
  issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult>;
}
