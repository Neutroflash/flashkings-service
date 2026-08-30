const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES = [
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function tresDigitos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) partes.push(dosDigitos(resto));
  return partes.join(" ");
}

function dosDigitos(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES[n - 10];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (u === 0) return DECENAS[d];
  if (d === 2) return `VEINTI${UNIDADES[u]}`;
  return `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function enteroALetras(n: number): string {
  if (n === 0) return "CERO";
  if (n === 1) return "UN";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0) partes.push(millones === 1 ? "UN MILLÓN" : `${enteroALetras(millones)} MILLONES`);
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${tresDigitos(miles)} MIL`);
  if (resto > 0) partes.push(tresDigitos(resto));

  return partes.join(" ");
}

/**
 * SUNAT exige el importe total en letras en `cbc:Note` (ej. "SON CIENTO OCHENTA CON 00/100
 * SOLES"). Soporta hasta 999,999,999.99 — más que suficiente para una venta de una pyme; un
 * comprobante por encima de eso es un caso que no vale la pena cubrir acá.
 */
export function montoEnLetras(amount: number, currency: "SOLES" = "SOLES"): string {
  const entero = Math.floor(amount);
  const centavos = Math.round((amount - entero) * 100);
  const centavosStr = String(centavos).padStart(2, "0");
  return `SON ${enteroALetras(entero)} CON ${centavosStr}/100 ${currency}`;
}
