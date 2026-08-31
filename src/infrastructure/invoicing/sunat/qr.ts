import QRCode from "qrcode";
import { calculateTaxBreakdown } from "./tax";
import type { SunatInvoicePayload } from "./types";

/**
 * Contenido del QR exigido por SUNAT en la representación impresa (Anexo N°7): 10 campos
 * separados por "|", en este orden exacto — no es negociable el orden ni el formato de cada
 * campo. El décimo campo ("Valor Resumen") es el `<ds:DigestValue>` de la firma XAdES-BES del
 * comprobante — ver `extract-digest.ts`. **Bug real corregido, encontrado en saas-erp-pe y
 * portado acá**: esta función solo tenía 9 campos (faltaba el Valor Resumen).
 */
export function buildQrContent(payload: SunatInvoicePayload, documentDigest: string): string {
  const totalVenta = payload.lineas.reduce((sum, l) => sum + l.unitPriceWithTax * l.quantity, 0);
  const { igvAmount } = calculateTaxBreakdown(totalVenta);

  return [
    payload.emisor.ruc,
    payload.tipoDocumento,
    payload.serie,
    String(payload.numero),
    igvAmount.toFixed(2),
    totalVenta.toFixed(2),
    payload.fechaEmision.toISOString().slice(0, 10),
    payload.cliente.documentTypeCode,
    payload.cliente.documentNumber,
    documentDigest,
  ].join("|");
}

export async function generateQrDataUrl(payload: SunatInvoicePayload, documentDigest: string): Promise<string> {
  return QRCode.toDataURL(buildQrContent(payload, documentDigest), { errorCorrectionLevel: "M", margin: 1, width: 200 });
}
