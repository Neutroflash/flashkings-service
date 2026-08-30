export const IGV_RATE = 0.18;

export interface TaxBreakdown {
  taxedAmount: number;
  exemptAmount: number;
  unaffectedAmount: number;
  igvAmount: number;
}

/**
 * Perú: los precios de catálogo ya incluyen IGV (práctica estándar en venta al consumidor final),
 * así que el desglose se calcula hacia atrás desde el total, nunca se suma aparte. Todo lo que
 * vende este SaaS hoy es "gravado" (afecto a IGV) — exemptAmount/unaffectedAmount quedan en 0,
 * pero existen como campos porque SUNAT exige reportarlos por separado si algún tenant futuro
 * vende algo exonerado/inafecto.
 */
export function calculateTaxBreakdown(totalAmount: number): TaxBreakdown {
  const taxedAmount = Math.round((totalAmount / (1 + IGV_RATE)) * 100) / 100;
  const igvAmount = Math.round((totalAmount - taxedAmount) * 100) / 100;
  return { taxedAmount, igvAmount, exemptAmount: 0, unaffectedAmount: 0 };
}
