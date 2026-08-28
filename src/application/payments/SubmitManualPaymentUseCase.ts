import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { Order } from "../../domain/entities/Order";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export interface SubmitManualPaymentInput {
  orderId: string;
  method: "yape" | "plin";
  operationNumber: string;
}

// Manual Yape/Plin flow: no gateway involved — the customer transfers directly to the store's
// own number and self-reports the operation number here. This does NOT mark the order PAID;
// an ADMIN must verify the transfer actually arrived and confirm it (ConfirmManualPaymentUseCase)
// or reject it (RejectManualPaymentUseCase).
export class SubmitManualPaymentUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly stockHoldScheduler: IStockHoldScheduler,
  ) {}

  async execute(input: SubmitManualPaymentInput): Promise<Order> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`La orden ya no admite pago (estado actual: ${order.status})`);
    }

    await this.paymentRepository.upsert({
      orderId: order.id,
      provider: input.method,
      providerChargeId: input.operationNumber,
      status: "pending_verification",
      amount: order.totalAmount,
    });

    // Verifying a manual transfer can take longer than the 15-minute hold (it depends on a human
    // checking their own Yape/Plin app) — cancel the auto-expiry so the reservation survives
    // until an admin explicitly confirms or rejects it. The order stays PENDING_PAYMENT either way.
    await this.stockHoldScheduler.cancel(order.id);

    const updated = await this.orderRepository.findById(order.id);
    return updated ?? order;
  }
}
