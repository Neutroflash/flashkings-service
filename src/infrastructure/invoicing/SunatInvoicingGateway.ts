import { env } from "../../config/env";
import { Invoice } from "../../domain/entities/Invoice";
import { Order } from "../../domain/entities/Order";
import {
  IInvoicingGateway,
  IssueCreditNoteInput,
  IssueInvoiceInput,
  IssueInvoiceResult,
} from "../../domain/services/IInvoicingGateway";
import { resolveSunatCredentials } from "./sunat/sunat-credentials";
import { generateInvoiceXML } from "./sunat/xml-builder";
import { generateCreditNoteXML } from "./sunat/note-xml-builder";
import { signSunatXML } from "./sunat/sign";
import { sendToSunat } from "./sunat/soap-client";
import {
  DOCUMENT_TYPE_CODE,
  SUNAT_CREDIT_NOTE_TYPE_CODE,
  SUNAT_DOCUMENT_TYPE_CODE,
  SunatDocumentTypeCode,
  SunatInvoiceLine,
  SunatInvoicePayload,
  SunatNotePayload,
} from "./sunat/types";

const BUSINESS_DOCUMENT_TYPE_TO_SUNAT: Record<string, SunatDocumentTypeCode> = {
  DNI: DOCUMENT_TYPE_CODE.DNI,
  RUC: DOCUMENT_TYPE_CODE.RUC,
  CE: DOCUMENT_TYPE_CODE.CE,
  PASAPORTE: DOCUMENT_TYPE_CODE.PASAPORTE,
};

/**
 * Las líneas del comprobante: los productos, más el flete como una línea de servicio propia.
 *
 * El flete TIENE que aparecer como línea. `Order.totalAmount` lo incluye, y SUNAT valida que la
 * suma de las líneas cuadre con los totales del documento: si se factura solo los productos, el
 * XML declara un total que sus propias líneas no sustentan y el comprobante se rechaza.
 *
 * Va como una línea gravada más porque el servicio de entrega está afecto a IGV igual que los
 * productos — el desglose sale del mismo `calculateTaxBreakdown` sin ningún caso especial.
 */
function buildInvoiceLines(order: Order): SunatInvoiceLine[] {
  const lines: SunatInvoiceLine[] = order.items.map((item) => ({
    description: `${item.productVariant?.name ?? "Producto"} (${item.productVariant?.sku ?? "-"})`,
    quantity: item.quantity,
    unitPriceWithTax: item.price,
  }));

  if (order.shippingCost > 0) {
    lines.push({
      description: "Servicio de entrega a domicilio",
      quantity: 1,
      unitPriceWithTax: order.shippingCost,
    });
  }

  return lines;
}

/**
 * Implementación real (sin PSE/OSE) del puerto `IInvoicingGateway`, portada de saas-erp-pe —
 * mismo módulo `infrastructure/invoicing/sunat/*` (firma XAdES-BES, generación de XML UBL 2.1,
 * envío SOAP), adaptado acá a un negocio único con credenciales por variables de entorno en vez
 * de por tenant cifradas en la base de datos.
 *
 * ✅ La firma XAdES-BES y el envío SOAP están confirmados en vivo contra `e-beta.sunat.gob.pe`
 * real en el proyecto de origen (saas-erp-pe) — mismo código, no reinventado acá. Pendiente de
 * confirmar en ESTE proyecto específicamente: correr el mismo comprobante de prueba una vez
 * configuradas las credenciales de homologación (ver docs/IMPLEMENTATION_STATUS.md).
 */
export class SunatInvoicingGateway implements IInvoicingGateway {
  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const credentials = resolveSunatCredentials();
    if (!credentials) {
      throw new Error("SunatInvoicingGateway usado sin SUNAT_PROVIDER=sunat configurado");
    }

    const documentTypeCode = BUSINESS_DOCUMENT_TYPE_TO_SUNAT[input.documentType] ?? DOCUMENT_TYPE_CODE.SIN_DOCUMENTO;

    const payload: SunatInvoicePayload = {
      tipoDocumento: input.type === "FACTURA" ? "01" : "03",
      serie: input.series,
      numero: input.number,
      fechaEmision: new Date(),
      emisor: { ruc: credentials.ruc, businessName: env.sunat.businessName, address: env.sunat.address || undefined },
      cliente: {
        documentTypeCode,
        documentNumber: input.documentNumber,
        name: input.businessName ?? input.documentNumber,
      },
      lineas: buildInvoiceLines(input.order),
    };

    const unsignedXml = generateInvoiceXML(payload);
    const signedXml = signSunatXML(unsignedXml, credentials.certificate.pfxBuffer, credentials.certificate.password);

    const fileName = `${credentials.ruc}-${SUNAT_DOCUMENT_TYPE_CODE[input.type]}-${input.series}-${input.number}`;
    const result = await sendToSunat(signedXml, credentials, fileName);

    if (result.transient) {
      // No es un rechazo — el documento ya está firmado y listo para reintentar tal cual.
      return { status: "PENDING_SUNAT", pdfUrl: null, xmlUrl: null, raw: result, signedXml };
    }

    return {
      status: result.accepted ? "ISSUED" : "FAILED",
      pdfUrl: null, // el PDF se genera bajo demanda — ver InvoicePdfController
      xmlUrl: null,
      raw: { responseCode: result.responseCode, description: result.description },
      signedXml,
    };
  }

  async issueCreditNote(input: IssueCreditNoteInput): Promise<IssueInvoiceResult> {
    const credentials = resolveSunatCredentials();
    if (!credentials) {
      throw new Error("SunatInvoicingGateway usado sin SUNAT_PROVIDER=sunat configurado");
    }

    const related = input.relatedInvoice;
    // El cliente de la nota es el MISMO del comprobante corregido, no el de la orden: si la
    // factura salió a nombre de una empresa, la nota tiene que salir a nombre de esa empresa.
    const documentTypeCode = BUSINESS_DOCUMENT_TYPE_TO_SUNAT[related.documentType] ?? DOCUMENT_TYPE_CODE.SIN_DOCUMENTO;

    const payload: SunatNotePayload = {
      serie: input.series,
      numero: input.number,
      fechaEmision: new Date(),
      emisor: { ruc: credentials.ruc, businessName: env.sunat.businessName, address: env.sunat.address || undefined },
      cliente: {
        documentTypeCode,
        documentNumber: related.documentNumber,
        name: related.businessName ?? related.documentNumber,
      },
      // Sin desglose, la nota corrige la orden completa — flete incluido, igual que el
      // comprobante original. Con desglose, las líneas ya vienen calculadas por el caso de uso
      // (que decide si el flete entra según includesShipping).
      lineas: input.items.length ? input.items : buildInvoiceLines(input.order),
      documentoRelacionado: {
        serie: related.series,
        numero: related.number,
        tipoDocumento: related.type === "FACTURA" ? "01" : "03",
      },
      motivoCodigo: input.reasonCode,
      motivoDescripcion: input.reasonText,
    };

    const unsignedXml = generateCreditNoteXML(payload);
    const signedXml = signSunatXML(unsignedXml, credentials.certificate.pfxBuffer, credentials.certificate.password);

    const fileName = `${credentials.ruc}-${SUNAT_CREDIT_NOTE_TYPE_CODE}-${input.series}-${input.number}`;
    const result = await sendToSunat(signedXml, credentials, fileName);

    if (result.transient) {
      return { status: "PENDING_SUNAT", pdfUrl: null, xmlUrl: null, raw: result, signedXml };
    }

    return {
      status: result.accepted ? "ISSUED" : "FAILED",
      pdfUrl: null,
      xmlUrl: null,
      raw: { responseCode: result.responseCode, description: result.description },
      signedXml,
    };
  }

  async retryPending(invoice: Invoice): Promise<IssueInvoiceResult> {
    const credentials = resolveSunatCredentials();
    if (!credentials) {
      throw new Error("SunatInvoicingGateway usado sin SUNAT_PROVIDER=sunat configurado");
    }
    if (!invoice.signedXml) {
      throw new Error(`Invoice ${invoice.id} está PENDING_SUNAT sin signedXml — no se puede reintentar`);
    }

    const fileName = `${credentials.ruc}-${SUNAT_DOCUMENT_TYPE_CODE[invoice.type]}-${invoice.series}-${invoice.number}`;
    const result = await sendToSunat(invoice.signedXml, credentials, fileName);

    if (result.transient) {
      return { status: "PENDING_SUNAT", pdfUrl: null, xmlUrl: null, raw: result, signedXml: invoice.signedXml };
    }
    return {
      status: result.accepted ? "ISSUED" : "FAILED",
      pdfUrl: null,
      xmlUrl: null,
      raw: { responseCode: result.responseCode, description: result.description },
      signedXml: invoice.signedXml,
    };
  }
}
