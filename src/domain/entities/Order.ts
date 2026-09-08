import { ProductVariant } from "./ProductVariant";
import { Payment } from "./Payment";
import { Invoice } from "./Invoice";
import { PublicRefund, Refund, toPublicRefund } from "./Refund";
import { ShippingZone } from "./Shipping";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "IN_PREPARATION"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";
export type CancelReason = "EXPIRED_HOLD" | "PAYMENT_DECLINED" | "ADMIN_CANCELLED";

export interface OrderItem {
  id: string;
  orderId: string;
  productVariantId: string;
  quantity: number;
  price: number; // frozen unit price at purchase time
  /** Unidades de esta línea ya devueltas, acumuladas entre reembolsos parciales. Siempre <= quantity. */
  refundedQuantity: number;
  productVariant?: ProductVariant;
}

export interface Order {
  id: string;
  userId: string | null;
  status: OrderStatus;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingDepartment: string | null;
  shippingProvince: string | null;
  shippingDistrict: string | null;
  shippingZone: ShippingZone | null;
  /** Flete cobrado, ya incluido en totalAmount. */
  shippingCost: number;
  cancelReason: CancelReason | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  trackingNumber: string | null;
  courier: string | null;
  refundedAt: Date | null;
  payment?: Payment | null;
  /** La boleta o factura de la orden — nunca una nota de crédito (ver findComprobante). */
  invoice?: Invoice | null;
  /** Las notas de crédito que corrigen ese comprobante, más reciente primero. */
  creditNotes?: Invoice[];
  refunds?: Refund[];
  items: OrderItem[];
  createdAt: Date;
  updatedAt: Date;
}

/** Manual admin transitions allowed via PATCH /api/admin/orders/:id/status. PAID/PENDING_PAYMENT/CANCELLED are system-managed only. */
export const ALLOWED_MANUAL_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PAID: ["IN_PREPARATION"],
  IN_PREPARATION: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
};

/**
 * Estados desde los que una orden YA PAGADA puede reembolsarse. Es deliberadamente todo el tramo
 * post-pago, incluido DELIVERED: una devolución llega casi siempre después de entregado, que es
 * justo cuando el cliente vio el producto. Excluye PENDING_PAYMENT (no hay dinero que devolver —
 * ese caso es releaseHold), CANCELLED (ídem) y REFUNDED (ya se devolvió todo).
 */
export const REFUNDABLE_STATUSES: OrderStatus[] = ["PAID", "IN_PREPARATION", "SHIPPED", "DELIVERED"];

export function isRefundable(status: OrderStatus): boolean {
  return REFUNDABLE_STATUSES.includes(status);
}

/** Cuántas unidades de una línea todavía se pueden devolver. */
export function refundableQuantity(item: OrderItem): number {
  return Math.max(0, item.quantity - item.refundedQuantity);
}

/** El monto máximo que todavía se puede reembolsar de una orden, dados los reembolsos ya hechos. */
export function refundableAmount(order: Order): number {
  const alreadyRefunded = (order.refunds ?? [])
    .filter((r) => r.status !== "FAILED")
    .reduce((sum, r) => sum + r.amount, 0);
  return Math.max(0, round2(order.totalAmount - alreadyRefunded));
}

/** true si algún reembolso vigente ya devolvió el flete — no se devuelve dos veces. */
export function shippingAlreadyRefunded(order: Order): boolean {
  return (order.refunds ?? []).some((r) => r.status !== "FAILED" && r.includesShipping);
}

/** Flete que todavía se puede devolver: el cobrado, o 0 si ya se devolvió. */
export function refundableShipping(order: Order): number {
  return shippingAlreadyRefunded(order) ? 0 : order.shippingCost;
}

/**
 * Monto de un reembolso por ítems: el valor de las líneas devueltas, más el flete si se decidió
 * devolverlo y todavía no se devolvió.
 *
 * Esta suma es la que evita que una orden quede colgada. `totalAmount` incluye el flete, así que
 * devolver línea por línea sin sumarlo nunca agotaría el saldo: `isFull` jamás daría true y la
 * orden se quedaría para siempre en DELIVERED con un residuo del tamaño exacto del envío.
 */
export function refundAmountForItems(
  order: Order,
  items: { orderItemId: string; quantity: number }[],
  includeShipping: boolean,
): number {
  const itemsTotal = items.reduce((sum, refundItem) => {
    const orderItem = order.items.find((i) => i.id === refundItem.orderItemId);
    return sum + (orderItem?.price ?? 0) * refundItem.quantity;
  }, 0);
  const shipping = includeShipping ? refundableShipping(order) : 0;
  return round2(itemsTotal + shipping);
}

/**
 * true si, contando lo que este reembolso devuelve, no queda ninguna unidad sin devolver.
 *
 * Es el segundo criterio para cerrar una orden, junto al de "no queda dinero pendiente", y existe
 * por el flete: en una devolución por arrepentimiento el envío no se devuelve (el servicio ya se
 * prestó), así que el saldo nunca llega a cero aunque el cliente haya devuelto absolutamente todo
 * el producto. Sin esta regla, esas órdenes se quedarían para siempre en PAID con un residuo del
 * tamaño exacto del flete, y "devuelto" dejaría de ser un estado alcanzable en el caso más común.
 */
export function allUnitsRefundedAfter(
  order: Order,
  items: { orderItemId: string; quantity: number }[],
): boolean {
  return order.items.every((orderItem) => {
    const now = items.find((i) => i.orderItemId === orderItem.id)?.quantity ?? 0;
    return orderItem.refundedQuantity + now >= orderItem.quantity;
  });
}

/** Los importes de dinero se comparan y acumulan redondeados al céntimo — nunca en float crudo. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PublicOrderItem {
  id: string;
  quantity: number;
  price: number;
  refundedQuantity: number;
  productVariant?: { id: string; sku: string; name: string };
}

/** No raw provider payload — only what's useful for the customer to see on their own confirmation page. */
export interface PublicPayment {
  provider: string;
  providerChargeId: string | null;
  status: string;
}

export interface PublicOrder {
  id: string;
  status: OrderStatus;
  totalAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  shippingDepartment: string | null;
  shippingProvince: string | null;
  shippingDistrict: string | null;
  shippingZone: ShippingZone | null;
  /** Flete cobrado, ya incluido en totalAmount. */
  shippingCost: number;
  cancelReason: CancelReason | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  trackingNumber: string | null;
  courier: string | null;
  refundedAt: Date | null;
  payment?: PublicPayment | null;
  /** Para que el cliente vea en su propia página que su devolución fue procesada, y por cuánto. */
  refunds: PublicRefund[];
  createdAt: Date;
  items: PublicOrderItem[];
}

/**
 * Boundary mapper for GET /api/orders/:id, which is public (order ids are unguessable UUIDs,
 * used as a confirmation-page link) — strips costPrice/stock/reservedStock, which are ADMIN-only
 * operational internals, not customer-facing data.
 */
export function toPublicOrder(order: Order): PublicOrder {
  return {
    id: order.id,
    status: order.status,
    totalAmount: order.totalAmount,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    shippingDistrict: order.shippingDistrict,
    shippingProvince: order.shippingProvince,
    shippingDepartment: order.shippingDepartment,
    shippingZone: order.shippingZone,
    shippingCost: order.shippingCost,
    cancelReason: order.cancelReason,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    refundedAt: order.refundedAt,
    payment: order.payment
      ? { provider: order.payment.provider, providerChargeId: order.payment.providerChargeId, status: order.payment.status }
      : null,
    refunds: (order.refunds ?? []).map(toPublicRefund),
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      refundedQuantity: item.refundedQuantity,
      productVariant: item.productVariant
        ? { id: item.productVariant.id, sku: item.productVariant.sku, name: item.productVariant.name }
        : undefined,
    })),
  };
}
