import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import { ChargeStatus, IPaymentGateway } from "../../domain/services/IPaymentGateway";
import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { IEventBus } from "../../domain/services/IEventBus";
import { Order } from "../../domain/entities/Order";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export interface ProcessPaymentInput {
  orderId: string;
  sourceId: string;
}

export interface ProcessPaymentResult {
  order: Order;
  status: ChargeStatus;
}

// Synchronous fast-path for gateways that confirm immediately (cards). For async methods
// (Yape/Plin can return "pending"), the webhook remains the authoritative source of truth.
export class ProcessPaymentUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly stockHoldScheduler: IStockHoldScheduler,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(input: ProcessPaymentInput): Promise<ProcessPaymentResult> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`La orden ya no admite pago (estado actual: ${order.status})`);
    }

    const chargeResult = await this.paymentGateway.createCharge({
      amount: order.totalAmount,
      currency: "PEN",
      orderId: order.id,
      email: order.customerEmail,
      sourceId: input.sourceId,
    });

    await this.paymentRepository.create({
      orderId: order.id,
      provider: "culqi",
      providerChargeId: chargeResult.providerChargeId,
      status: chargeResult.status,
      amount: order.totalAmount,
      rawResponse: chargeResult.raw,
    });

    if (chargeResult.status === "succeeded") {
      const paidOrder = await this.orderRepository.markPaid(order.id);
      await this.stockHoldScheduler.cancel(order.id);
      if (paidOrder) {
        this.eventBus.publish({ type: "order.paid", order: paidOrder });
      }
      return { order: paidOrder ?? order, status: chargeResult.status };
    }

    if (chargeResult.status === "failed") {
      const cancelledOrder = await this.orderRepository.releaseHold(order.id, "PAYMENT_DECLINED");
      return { order: cancelledOrder ?? order, status: chargeResult.status };
    }

    return { order, status: chargeResult.status };
  }
}
