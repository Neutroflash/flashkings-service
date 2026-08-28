import { ProductVariant } from "./ProductVariant";
import { Payment } from "./Payment";
import { Invoice } from "./Invoice";

export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "IN_PREPARATION" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type CancelReason = "EXPIRED_HOLD" | "PAYMENT_DECLINED" | "ADMIN_CANCELLED";

export interface OrderItem {
  id: string;
  orderId: string;
  productVariantId: string;
  quantity: number;
  price: number; // frozen unit price at purchase time
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
  cancelReason: CancelReason | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  trackingNumber: string | null;
  courier: string | null;
  payment?: Payment | null;
  invoice?: Invoice | null;
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

export interface PublicOrderItem {
  id: string;
  quantity: number;
  price: number;
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
  cancelReason: CancelReason | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  trackingNumber: string | null;
  courier: string | null;
  payment?: PublicPayment | null;
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
    cancelReason: order.cancelReason,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    payment: order.payment
      ? { provider: order.payment.provider, providerChargeId: order.payment.providerChargeId, status: order.payment.status }
      : null,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      price: item.price,
      productVariant: item.productVariant
        ? { id: item.productVariant.id, sku: item.productVariant.sku, name: item.productVariant.name }
        : undefined,
    })),
  };
}
