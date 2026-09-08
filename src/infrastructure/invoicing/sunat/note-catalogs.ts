export interface NoteReason {
  code: string;
  label: string;
}

/**
 * Catálogo 09 de SUNAT — tipo de nota de crédito. Lista pública de referencia, tan segura de
 * hardcodear como los catálogos 01/06 que ya viven en types.ts.
 *
 * Portado de saas-erp-pe. Acá solo existen notas de CRÉDITO: una nota de débito aumenta lo que el
 * cliente debe, y este negocio no cobra intereses ni penalidades sobre una venta ya emitida — si
 * algún día lo hiciera, el catálogo 10 y generateDebitNoteXML están en el proyecto de origen.
 */
export const CREDIT_NOTE_REASONS: NoteReason[] = [
  { code: "01", label: "Anulación de la operación" },
  { code: "02", label: "Anulación por error en el RUC" },
  { code: "03", label: "Corrección por error en la descripción" },
  { code: "04", label: "Descuento global" },
  { code: "05", label: "Descuento por ítem" },
  { code: "06", label: "Devolución total" },
  { code: "07", label: "Devolución por ítem" },
  { code: "08", label: "Bonificación" },
  { code: "09", label: "Disminución en el valor" },
  { code: "10", label: "Otros conceptos" },
];

export function findNoteReason(type: "NOTA_CREDITO", code: string): NoteReason | undefined {
  if (type !== "NOTA_CREDITO") return undefined;
  return CREDIT_NOTE_REASONS.find((r) => r.code === code);
}

/**
 * La serie de una nota depende de qué documento corrige — no es fija como B001/F001. Convención
 * SUNAT: "BC01" para una nota sobre una Boleta, "FC01" sobre una Factura. Son dos secuencias
 * correlativas independientes, que es exactamente por qué InvoiceCounter lleva `series` en su
 * clave primaria (ver schema.prisma).
 */
export function resolveNoteSeries(relatedType: "BOLETA" | "FACTURA"): string {
  return relatedType === "FACTURA" ? "FC01" : "BC01";
}

/**
 * Los motivos que anulan la operación completa. Solo estos dejan el comprobante corregido en
 * VOID; el resto (descuentos, devolución por ítem) lo dejan vigente con un monto corregido.
 */
const FULL_VOID_REASONS = new Set(["01", "02", "06"]);

export function voidsRelatedInvoice(reasonCode: string): boolean {
  return FULL_VOID_REASONS.has(reasonCode);
}
