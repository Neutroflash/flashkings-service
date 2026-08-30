import { env } from "../../config/env";
import { Invoice } from "../../domain/entities/Invoice";
import { IInvoicingGateway, IssueInvoiceInput, IssueInvoiceResult } from "../../domain/services/IInvoicingGateway";
import { resolveSunatCredentials } from "./sunat/sunat-credentials";
import { generateInvoiceXML } from "./sunat/xml-builder";
import { signSunatXML } from "./sunat/sign";
import { sendToSunat } from "./sunat/soap-client";
import { DOCUMENT_TYPE_CODE, SUNAT_DOCUMENT_TYPE_CODE, SunatDocumentTypeCode, SunatInvoicePayload } from "./sunat/types";

const BUSINESS_DOCUMENT_TYPE_TO_SUNAT: Record<string, SunatDocumentTypeCode> = {
  DNI: DOCUMENT_TYPE_CODE.DNI,
  RUC: DOCUMENT_TYPE_CODE.RUC,
  CE: DOCUMENT_TYPE_CODE.CE,
  PASAPORTE: DOCUMENT_TYPE_CODE.PASAPORTE,
};

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
      lineas: input.order.items.map((item) => ({
        description: `${item.productVariant?.name ?? "Producto"} (${item.productVariant?.sku ?? "-"})`,
        quantity: item.quantity,
        unitPriceWithTax: item.price,
      })),
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
