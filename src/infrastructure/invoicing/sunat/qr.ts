import QRCode from "qrcode";
import { calculateTaxBreakdown } from "./tax";
import type { SunatInvoicePayload } from "./types";

/**
 * Contenido del QR exigido por SUNAT en la representación impresa (Anexo N°7): campos separados
 * por "|", en este orden exacto. No es negociable el orden ni el formato de cada campo.
 */
export function buildQrContent(payload: SunatInvoicePayload): string {
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
  ].join("|");
}

export async function generateQrDataUrl(payload: SunatInvoicePayload): Promise<string> {
  return QRCode.toDataURL(buildQrContent(payload), { errorCorrectionLevel: "M", margin: 1, width: 200 });
}
