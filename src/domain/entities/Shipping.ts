export type ShippingZone = "LIMA_METROPOLITANA" | "PROVINCIA";

/**
 * Tarifa plana por zona. Vive en el dominio y no en variables de entorno porque es una regla de
 * negocio con efecto legal (es parte del precio que se le informa al cliente y del monto que va
 * al comprobante), no un parámetro de despliegue: cambiarla debe pasar por un commit y quedar en
 * el historial, igual que un cambio de IGV.
 *
 * Cada orden congela el flete que se le cobró en `Order.shippingCost`, así que subir estos
 * valores nunca altera una orden ya creada.
 */
export const SHIPPING_RATES: Record<ShippingZone, number> = {
  LIMA_METROPOLITANA: 15,
  PROVINCIA: 25,
};

/**
 * Los 25 departamentos del Perú más la Provincia Constitucional del Callao, que no es un
 * departamento pero se elige como tal en cualquier formulario de envío peruano.
 */
export const PERU_DEPARTMENTS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

export type PeruDepartment = (typeof PERU_DEPARTMENTS)[number];

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // Quita los diacríticos combinantes que NFD acaba de separar, para que "Áncash"/"Ancash" y
    // "Junín"/"Junin" comparen igual sin depender de cómo el cliente escribió la tilde.
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Zona tarifaria de un destino.
 *
 * La sutileza que hace falta acertar: el departamento de Lima NO es Lima Metropolitana. Lima tiene
 * diez provincias (Huaura, Cañete, Barranca, Huarochirí…) que están a horas de la ciudad y se
 * despachan como provincia; solo la provincia de Lima es la zona urbana. El Callao sí entra,
 * porque es contiguo a la ciudad y todo courier lo trata como la misma zona de reparto.
 *
 * Cobrar S/ 15 a Barranca por tener "Lima" en el departamento sería regalar el flete en cada
 * pedido de esa zona.
 */
export function resolveShippingZone(department: string, province: string): ShippingZone {
  const dep = normalize(department);
  const prov = normalize(province);

  if (dep === "callao") return "LIMA_METROPOLITANA";
  if (dep === "lima" && prov === "lima") return "LIMA_METROPOLITANA";
  return "PROVINCIA";
}

export function shippingCostFor(zone: ShippingZone): number {
  return SHIPPING_RATES[zone];
}

export interface ShippingQuote {
  zone: ShippingZone;
  cost: number;
}

export function quoteShipping(department: string, province: string): ShippingQuote {
  const zone = resolveShippingZone(department, province);
  return { zone, cost: shippingCostFor(zone) };
}

/**
 * Motivos del catálogo 09 de SUNAT en los que la falla es del negocio y, por práctica estándar de
 * protección al consumidor, el flete se devuelve junto con el producto. El catálogo no modela
 * culpa — "06 Devolución total" cubre tanto un teclado que llegó fallado como un cliente que se
 * arrepintió — así que esto es solo el **valor sugerido** que el panel marca por defecto; la
 * decisión final la toma el admin marcando o desmarcando la casilla.
 *
 *   01 Anulación de la operación   → el pedido no se pudo cumplir: el envío tampoco se prestó.
 *   02 Anulación por error en RUC  → error administrativo nuestro.
 *   03 Corrección en la descripción→ ídem.
 *
 * Quedan fuera 06/07 (devolución total / por ítem), que son el caso típico de arrepentimiento:
 * ahí el envío ya se prestó como servicio y no se devuelve salvo que el admin lo indique.
 */
const BUSINESS_FAULT_REASONS = new Set(["01", "02", "03"]);

export function suggestsShippingRefund(reasonCode: string): boolean {
  return BUSINESS_FAULT_REASONS.has(reasonCode);
}
