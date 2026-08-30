/**
 * Tipos de la integración directa con SUNAT (sin PSE/OSE) — solo BOLETA/FACTURA, que es todo lo
 * que modela `InvoiceType` en este proyecto (a diferencia de saas-erp-pe, de donde se portó este
 * módulo, no hay notas de crédito/débito acá todavía).
 */

/** Catálogo 06 de SUNAT — tipo de documento de identidad del cliente. */
export type SunatDocumentTypeCode = "0" | "1" | "4" | "6" | "7";

export const DOCUMENT_TYPE_CODE: Record<string, SunatDocumentTypeCode> = {
  SIN_DOCUMENTO: "0",
  DNI: "1",
  CE: "4",
  RUC: "6",
  PASAPORTE: "7",
};

export interface SunatPartyInfo {
  ruc: string;
  businessName: string; // razón social registrada ante SUNAT
  address?: string;
}

export interface SunatCustomerInfo {
  documentTypeCode: SunatDocumentTypeCode;
  documentNumber: string;
  name: string; // razón social (RUC) o nombre completo (otros documentos)
}

export interface SunatInvoiceLine {
  description: string;
  quantity: number;
  /** Precio de venta unitario, CON IGV — lo que el cliente efectivamente paga por unidad. */
  unitPriceWithTax: number;
}

export interface SunatInvoicePayload {
  tipoDocumento: "01" | "03"; // 01=Factura, 03=Boleta (catálogo 01)
  serie: string;
  numero: number;
  fechaEmision: Date;
  emisor: SunatPartyInfo;
  cliente: SunatCustomerInfo;
  lineas: SunatInvoiceLine[];
}

/** Catálogo 01 de SUNAT — tipo de documento electrónico. */
export const SUNAT_DOCUMENT_TYPE_CODE: Record<"BOLETA" | "FACTURA", string> = {
  FACTURA: "01",
  BOLETA: "03",
};

export interface SunatCertificateConfig {
  pfxBuffer: Buffer;
  password: string;
}

export interface SunatCredentials {
  ruc: string;
  solUser: string; // usuario secundario SOL — la convención SOAP concatena RUC+usuario
  solPassword: string;
  environment: "BETA" | "PRODUCCION";
  certificate: SunatCertificateConfig;
}

export interface SunatSendResult {
  /** true = SUNAT recibió y aceptó (o aceptó con observaciones) el comprobante. */
  accepted: boolean;
  /** true = el problema fue de disponibilidad/red, no un rechazo de SUNAT — reintentable. */
  transient: boolean;
  responseCode?: string;
  description?: string;
  cdrZip?: Buffer;
}
