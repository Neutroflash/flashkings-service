import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IRefundRepository, RefundItemInput } from "../../domain/repositories/IRefundRepository";
import { IPaymentGateway } from "../../domain/services/IPaymentGateway";
import { IEventBus } from "../../domain/services/IEventBus";
import {
  Order,
  isRefundable,
  refundAmountForItems,
  allUnitsRefundedAfter,
  refundableAmount,
  refundableShipping,
  round2,
} from "../../domain/entities/Order";
import { suggestsShippingRefund } from "../../domain/entities/Shipping";
import { Refund } from "../../domain/entities/Refund";
import { findNoteReason } from "../../infrastructure/invoicing/sunat/note-catalogs";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";
import { logger } from "../../infrastructure/logging/logger";

export interface RefundOrderInput {
  orderId: string;
  /** Monto a devolver. Si se omite, se devuelve todo lo que quede pendiente (reembolso total). */
  amount?: number;
  /** Ítems devueltos. Vacío = reembolso por monto, sin desglose de líneas. */
  items?: RefundItemInput[];
  /** Catálogo 09 de SUNAT — el motivo que después viaja a la nota de crédito. */
  reasonCode: string;
  reasonText?: string;
  /** El dinero se devuelve por fuera de la pasarela (transferencia, Yape). */
  isManual?: boolean;
  /** Reponer las unidades al stock físico. Default true: lo normal es que el producto vuelva. */
  restock?: boolean;
  /**
   * Devolver también el flete. Si se omite, se sugiere según el motivo (ver suggestsShippingRefund):
   * sí cuando la falla es del negocio, no cuando el cliente se arrepiente. Un reembolso del saldo
   * completo lo incluye siempre, porque ese saldo ya contiene el flete.
   */
  refundShipping?: boolean;
  adminUserId?: string | null;
}

export interface RefundOrderResult {
  refund: Refund;
  order: Order;
}

/**
 * ADMIN-only. Devuelve dinero de una orden ya pagada, total o parcialmente.
 *
 * El orden de las operaciones es deliberado y es lo único que hace esto seguro: PRIMERO se
 * registra el reembolso en nuestra base (dentro de la transacción que además repone stock y, si
 * es total, pasa la orden a REFUNDED), y RECIÉN DESPUÉS se le pide el dinero a la pasarela. Al
 * revés — pasarela primero — un fallo entre las dos operaciones dejaría dinero devuelto sin
 * ningún registro nuestro, que es la única mitad de este flujo que no se puede reconstruir
 * mirando la base. Con este orden, el peor caso deja un Refund en FAILED: visible, auditable y
 * reintentable a mano.
 *
 * La nota de crédito NO se emite acá. Es un paso aparte (IssueCreditNoteUseCase) porque solo
 * aplica si la orden llegó a tener comprobante emitido, y porque SUNAT puede estar caído sin que
 * eso deba impedir devolverle la plata al cliente.
 */
export class RefundOrderUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly refundRepository: IRefundRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(input: RefundOrderInput): Promise<RefundOrderResult> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    if (!order.paidAt) {
      throw new ConflictError("Solo se puede reembolsar una orden que fue pagada");
    }
    if (!isRefundable(order.status)) {
      throw new ConflictError(`Una orden en estado ${order.status} no admite reembolso`);
    }

    const reason = findNoteReason("NOTA_CREDITO", input.reasonCode);
    if (!reason) {
      throw new ConflictError(`Motivo de reembolso inválido: ${input.reasonCode} (ver catálogo 09 de SUNAT)`);
    }

    const pending = refundableAmount(order);
    if (pending <= 0) {
      throw new ConflictError("Esta orden ya fue reembolsada por completo");
    }

    const items = input.items ?? [];
    // Sugerencia por motivo, que el admin puede sobrescribir en cualquier dirección.
    const wantsShipping = input.refundShipping ?? suggestsShippingRefund(reason.code);

    // Tres formas de llegar al monto, en orden de precedencia:
    //   1. El admin dio un monto explícito → se respeta (con el tope validado abajo).
    //   2. Hay ítems → valor de esas líneas, más el flete si corresponde.
    //   3. Ninguno de los dos → todo el saldo pendiente.
    const amount =
      input.amount !== undefined
        ? round2(input.amount)
        : items.length
          ? refundAmountForItems(order, items, wantsShipping)
          : pending;

    // Una orden se cierra por cualquiera de dos caminos: no queda dinero por devolver, o no queda
    // producto por devolver. El segundo importa por el flete — ver allUnitsRefundedAfter.
    const isFull = amount >= pending || (items.length > 0 && allUnitsRefundedAfter(order, items));

    // `includesShipping` describe el MONTO, no el cierre de la orden: es true solo si el flete
    // realmente entró en `amount`. Atarlo a `isFull` sería mentir en el caso más común — una
    // devolución por arrepentimiento cierra la orden (volvió todo el producto) pero justamente NO
    // devuelve el envío, y marcarlo como devuelto rompería tanto el saldo de un reembolso
    // posterior como las líneas de la nota de crédito.
    const shippingPending = refundableShipping(order) > 0;
    const includesShipping = shippingPending && (items.length || input.amount !== undefined ? wantsShipping : true);

    const { refund, order: updatedOrder } = await this.refundRepository.create({
      orderId: order.id,
      paymentId: order.payment?.id ?? null,
      amount,
      isFull,
      reasonCode: reason.code,
      reasonText: input.reasonText?.trim() || reason.label,
      isManual: input.isManual ?? false,
      restock: input.restock ?? true,
      includesShipping,
      createdById: input.adminUserId ?? null,
      items,
    });

    const settled = await this.settleWithGateway(refund, order, input.isManual ?? false);

    this.eventBus.publish({ type: "order.refunded", order: updatedOrder, refund: settled });

    return { refund: settled, order: updatedOrder };
  }

  /**
   * Mueve el dinero. Un reembolso manual no toca la pasarela: se marca COMPLETED porque el admin
   * está declarando que ya transfirió por fuera — el mismo criterio que ConfirmManualPaymentUseCase
   * aplica del lado del cobro.
   */
  private async settleWithGateway(refund: Refund, order: Order, isManual: boolean): Promise<Refund> {
    if (isManual) {
      const updated = await this.refundRepository.markResult(refund.id, {
        status: "COMPLETED",
        providerRefundId: null,
        rawResponse: { manual: true },
      });
      return updated ?? refund;
    }

    const chargeId = order.payment?.providerChargeId;
    if (!chargeId) {
      const updated = await this.refundRepository.markResult(refund.id, {
        status: "FAILED",
        providerRefundId: null,
        rawResponse: { error: "La orden no tiene un cargo de pasarela al que revertir" },
      });
      return updated ?? refund;
    }

    try {
      const result = await this.paymentGateway.refundCharge({
        providerChargeId: chargeId,
        amount: refund.amount,
        reason: refund.reasonText,
      });

      // `pending` en la pasarela se queda en PENDING acá — no se declara COMPLETED hasta que el
      // dinero efectivamente salió.
      const status = result.status === "succeeded" ? "COMPLETED" : result.status === "failed" ? "FAILED" : null;
      if (status === null) {
        return refund;
      }

      const updated = await this.refundRepository.markResult(refund.id, {
        status,
        providerRefundId: result.providerRefundId,
        rawResponse: result.raw,
      });
      return updated ?? refund;
    } catch (err) {
      // La pasarela se cayó a mitad de camino. El Refund ya existe con todo su detalle, así que
      // esto es recuperable a mano; lo que no se hace es propagar y tumbar la request después de
      // haber repuesto stock y movido la orden a REFUNDED.
      logger.error({ err, refundId: refund.id }, "[refund] la pasarela falló al procesar el reembolso");
      const updated = await this.refundRepository.markResult(refund.id, {
        status: "FAILED",
        providerRefundId: null,
        rawResponse: { error: err instanceof Error ? err.message : String(err) },
      });
      return updated ?? refund;
    }
  }
}
