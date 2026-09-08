import { describe, expect, test } from "bun:test";
import {
  ALLOWED_MANUAL_TRANSITIONS,
  allUnitsRefundedAfter,
  isRefundable,
  refundAmountForItems,
  refundableAmount,
  refundableQuantity,
  refundableShipping,
  round2,
  shippingAlreadyRefunded,
  type Order,
  type OrderStatus,
} from "../../src/domain/entities/Order";
import type { Refund } from "../../src/domain/entities/Refund";
import {
  PERU_DEPARTMENTS,
  quoteShipping,
  resolveShippingZone,
  SHIPPING_RATES,
  suggestsShippingRefund,
} from "../../src/domain/entities/Shipping";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    userId: null,
    status: "PAID",
    totalAmount: 364.9,
    customerName: "Cliente",
    customerEmail: "c@flashkings.pe",
    customerPhone: "999888777",
    shippingAddress: "Av. Test 123",
    shippingDepartment: "Lima",
    shippingProvince: "Lima",
    shippingDistrict: "Miraflores",
    shippingZone: "LIMA_METROPOLITANA",
    shippingCost: 15,
    cancelReason: null,
    paidAt: new Date(),
    cancelledAt: null,
    refundedAt: null,
    trackingNumber: null,
    courier: null,
    refunds: [],
    items: [
      { id: "oi1", orderId: "o1", productVariantId: "v1", quantity: 2, price: 174.95, refundedQuantity: 0 },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRefund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: "r1",
    orderId: "o1",
    paymentId: null,
    amount: 100,
    isFull: false,
    status: "COMPLETED",
    reasonCode: "06",
    reasonText: "Devolución",
    isManual: false,
    providerRefundId: null,
    rawResponse: null,
    restocked: true,
    includesShipping: false,
    createdById: null,
    createdAt: new Date(),
    items: [],
    ...overrides,
  };
}

describe("transiciones manuales de fulfillment", () => {
  test("son una cadena estricta de un solo sentido", () => {
    expect(ALLOWED_MANUAL_TRANSITIONS.PAID).toEqual(["IN_PREPARATION"]);
    expect(ALLOWED_MANUAL_TRANSITIONS.IN_PREPARATION).toEqual(["SHIPPED"]);
    expect(ALLOWED_MANUAL_TRANSITIONS.SHIPPED).toEqual(["DELIVERED"]);
  });

  /** Pedirlos por la ruta manual devuelve 409 — los gestiona el sistema (pago, hold, reembolso). */
  test("no hay camino manual hacia los estados gestionados por el sistema", () => {
    const manualTargets = Object.values(ALLOWED_MANUAL_TRANSITIONS).flat();
    for (const systemManaged of ["PENDING_PAYMENT", "PAID", "CANCELLED", "REFUNDED"] as OrderStatus[]) {
      expect(manualTargets).not.toContain(systemManaged);
    }
  });

  test("ningún estado terminal admite transición manual de salida", () => {
    expect(ALLOWED_MANUAL_TRANSITIONS.DELIVERED).toBeUndefined();
    expect(ALLOWED_MANUAL_TRANSITIONS.CANCELLED).toBeUndefined();
    expect(ALLOWED_MANUAL_TRANSITIONS.REFUNDED).toBeUndefined();
  });

  /** Cada destino manual tiene exactamente un estado previo válido — lo que permite que
   * updateStatus sea un único UPDATE condicional atómico en vez de leer-y-luego-escribir. */
  test("cada destino manual tiene un único origen posible", () => {
    const origins = new Map<OrderStatus, OrderStatus[]>();
    for (const [prior, nexts] of Object.entries(ALLOWED_MANUAL_TRANSITIONS) as [OrderStatus, OrderStatus[]][]) {
      for (const next of nexts) {
        origins.set(next, [...(origins.get(next) ?? []), prior]);
      }
    }
    for (const [, priors] of origins) {
      expect(priors.length).toBe(1);
    }
  });
});

describe("qué órdenes admiten reembolso", () => {
  test("todo el tramo post-pago, incluido DELIVERED", () => {
    expect(isRefundable("PAID")).toBe(true);
    expect(isRefundable("IN_PREPARATION")).toBe(true);
    expect(isRefundable("SHIPPED")).toBe(true);
    // Una devolución llega casi siempre después de entregada: es cuando el cliente vio el producto.
    expect(isRefundable("DELIVERED")).toBe(true);
  });

  test("no las que nunca movieron dinero, ni las ya devueltas", () => {
    expect(isRefundable("PENDING_PAYMENT")).toBe(false);
    expect(isRefundable("CANCELLED")).toBe(false);
    expect(isRefundable("REFUNDED")).toBe(false);
  });
});

describe("saldo reembolsable", () => {
  test("descuenta los reembolsos vigentes del total", () => {
    const order = makeOrder({ refunds: [makeRefund({ amount: 100 })] });
    expect(refundableAmount(order)).toBe(264.9);
  });

  test("un reembolso FAILED no consume saldo: ese dinero nunca salió", () => {
    const order = makeOrder({ refunds: [makeRefund({ amount: 100, status: "FAILED" })] });
    expect(refundableAmount(order)).toBe(364.9);
  });

  test("nunca es negativo", () => {
    const order = makeOrder({ refunds: [makeRefund({ amount: 400 })] });
    expect(refundableAmount(order)).toBe(0);
  });
});

describe("el flete en una devolución", () => {
  test("se sugiere devolverlo cuando la falla es del negocio", () => {
    expect(suggestsShippingRefund("01")).toBe(true); // anulación de la operación
    expect(suggestsShippingRefund("02")).toBe(true); // error en el RUC
    expect(suggestsShippingRefund("03")).toBe(true); // error en la descripción
  });

  test("no se sugiere en una devolución: el envío ya se prestó", () => {
    expect(suggestsShippingRefund("06")).toBe(false); // devolución total
    expect(suggestsShippingRefund("07")).toBe(false); // devolución por ítem
  });

  test("no se devuelve dos veces", () => {
    const order = makeOrder({ refunds: [makeRefund({ includesShipping: true })] });
    expect(shippingAlreadyRefunded(order)).toBe(true);
    expect(refundableShipping(order)).toBe(0);
  });

  test("un reembolso fallido no consume el flete", () => {
    const order = makeOrder({ refunds: [makeRefund({ includesShipping: true, status: "FAILED" })] });
    expect(refundableShipping(order)).toBe(15);
  });

  test("el monto por ítems suma el flete solo si se decidió devolverlo", () => {
    const order = makeOrder();
    const items = [{ orderItemId: "oi1", quantity: 1 }];
    expect(refundAmountForItems(order, items, false)).toBe(174.95);
    expect(refundAmountForItems(order, items, true)).toBe(189.95);
  });
});

describe("cierre de la orden por unidades devueltas", () => {
  /**
   * Regresión del bug del Sprint 6: con el flete retenido, devolver todo el producto nunca agotaba
   * el saldo, así que la orden se quedaba para siempre en PAID con un residuo del tamaño del envío.
   */
  test("devolver todas las unidades cierra la orden aunque quede saldo de flete", () => {
    const order = makeOrder();
    const items = [{ orderItemId: "oi1", quantity: 2 }];

    expect(allUnitsRefundedAfter(order, items)).toBe(true);
    // Y efectivamente queda dinero sin devolver: exactamente el flete.
    const montoSinFlete = refundAmountForItems(order, items, false);
    expect(round2(refundableAmount(order) - montoSinFlete)).toBe(15);
  });

  test("una devolución parcial no cierra la orden", () => {
    expect(allUnitsRefundedAfter(makeOrder(), [{ orderItemId: "oi1", quantity: 1 }])).toBe(false);
  });

  test("cuenta lo ya devuelto en reembolsos anteriores", () => {
    const order = makeOrder({
      items: [{ id: "oi1", orderId: "o1", productVariantId: "v1", quantity: 2, price: 174.95, refundedQuantity: 1 }],
    });
    expect(refundableQuantity(order.items[0])).toBe(1);
    expect(allUnitsRefundedAfter(order, [{ orderItemId: "oi1", quantity: 1 }])).toBe(true);
  });
});

describe("zonas y tarifa de envío", () => {
  test("Lima Metropolitana es la provincia de Lima, no el departamento entero", () => {
    expect(resolveShippingZone("Lima", "Lima")).toBe("LIMA_METROPOLITANA");
    // Huaura, Cañete, Barranca… están a horas de la ciudad: son provincia.
    expect(resolveShippingZone("Lima", "Huaura")).toBe("PROVINCIA");
    expect(resolveShippingZone("Lima", "Cañete")).toBe("PROVINCIA");
  });

  test("el Callao entra en la zona urbana", () => {
    expect(resolveShippingZone("Callao", "Callao")).toBe("LIMA_METROPOLITANA");
  });

  test("cualquier otro departamento es provincia", () => {
    expect(resolveShippingZone("Arequipa", "Arequipa")).toBe("PROVINCIA");
    expect(resolveShippingZone("Cusco", "Cusco")).toBe("PROVINCIA");
  });

  test("las tildes y mayúsculas no cambian la zona", () => {
    expect(resolveShippingZone("LIMA", "lima")).toBe("LIMA_METROPOLITANA");
    expect(resolveShippingZone("  Lima  ", " Lima ")).toBe("LIMA_METROPOLITANA");
    expect(resolveShippingZone("Áncash", "Santa")).toBe(resolveShippingZone("Ancash", "Santa"));
  });

  test("la tarifa es S/ 15 Lima y S/ 25 provincia", () => {
    expect(SHIPPING_RATES.LIMA_METROPOLITANA).toBe(15);
    expect(SHIPPING_RATES.PROVINCIA).toBe(25);
    expect(quoteShipping("Lima", "Lima")).toEqual({ zone: "LIMA_METROPOLITANA", cost: 15 });
    expect(quoteShipping("Piura", "Piura")).toEqual({ zone: "PROVINCIA", cost: 25 });
  });

  test("la lista de departamentos cubre el país y trae al Callao", () => {
    expect(PERU_DEPARTMENTS.length).toBe(25);
    expect(PERU_DEPARTMENTS).toContain("Callao");
    expect(PERU_DEPARTMENTS).toContain("Lima");
  });
});
