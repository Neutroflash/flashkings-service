import { Refund } from "../entities/Refund";
import { Order } from "../entities/Order";

export interface RefundItemInput {
  orderItemId: string;
  quantity: number;
}

export interface CreateRefundInput {
  orderId: string;
  paymentId: string | null;
  amount: number;
  isFull: boolean;
  reasonCode: string;
  reasonText: string;
  isManual: boolean;
  /** Reponer al stock físico las unidades devueltas. Decisión del admin, no automática. */
  restock: boolean;
  /** Si el monto incluye el flete. Ver suggestsShippingRefund para el criterio sugerido. */
  includesShipping: boolean;
  createdById: string | null;
  /** Vacío en un reembolso total por monto; poblado en uno parcial por ítems. */
  items: RefundItemInput[];
}

export interface RefundOutcome {
  refund: Refund;
  order: Order;
}

export interface IRefundRepository {
  /**
   * Registra el reembolso y aplica TODOS sus efectos en una sola transacción: acumula
   * `refundedQuantity` en las líneas devueltas, repone `stock` si corresponde, y pasa la orden a
   * REFUNDED cuando el reembolso es total. Va junto porque un reembolso a medio aplicar (dinero
   * devuelto sin reponer stock, o stock repuesto sin registrar el reembolso) deja la contabilidad
   * y el inventario mintiendo cada uno por su lado.
   *
   * Valida dentro de la transacción, con las filas bloqueadas, que no se devuelva más dinero ni
   * más unidades de las que quedan — dos reembolsos concurrentes sobre la misma orden no pueden
   * sumar más que el total.
   */
  create(input: CreateRefundInput): Promise<RefundOutcome>;
  /** Marca el resultado final del movimiento de dinero en la pasarela. */
  markResult(
    refundId: string,
    data: { status: "COMPLETED" | "FAILED"; providerRefundId: string | null; rawResponse: unknown },
  ): Promise<Refund | null>;
  findById(id: string): Promise<Refund | null>;
  findByOrderId(orderId: string): Promise<Refund[]>;
}
