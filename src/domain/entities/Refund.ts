export type RefundStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface RefundItem {
  id: string;
  refundId: string;
  orderItemId: string;
  quantity: number;
}

export interface Refund {
  id: string;
  orderId: string;
  paymentId: string | null;
  amount: number;
  /** true = devolvió el total y dejó la orden en REFUNDED; false = parcial, la orden conserva su estado. */
  isFull: boolean;
  status: RefundStatus;
  /** Catálogo 09 de SUNAT — el mismo motivo que viaja a la nota de crédito. */
  reasonCode: string;
  reasonText: string;
  /** El dinero se devolvió por fuera de la pasarela (transferencia, Yape del admin). */
  isManual: boolean;
  providerRefundId: string | null;
  rawResponse: unknown;
  restocked: boolean;
  /** Si este reembolso incluyó el flete además de los productos. */
  includesShipping: boolean;
  createdById: string | null;
  createdAt: Date;
  items: RefundItem[];
}

/**
 * Lo que el cliente puede ver de un reembolso en su página de pedido. Sin `rawResponse` (payload
 * crudo de la pasarela, uso interno) ni `createdById` — mismo criterio de frontera que
 * toPublicOrder para el resto de la orden.
 */
export interface PublicRefund {
  id: string;
  amount: number;
  isFull: boolean;
  status: RefundStatus;
  reasonText: string;
  createdAt: Date;
}

export function toPublicRefund(refund: Refund): PublicRefund {
  return {
    id: refund.id,
    amount: refund.amount,
    isFull: refund.isFull,
    status: refund.status,
    reasonText: refund.reasonText,
    createdAt: refund.createdAt,
  };
}
