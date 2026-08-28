import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import { IEventBus } from "../../domain/services/IEventBus";
import { Order } from "../../domain/entities/Order";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

// ADMIN-only: called after the admin manually checks their own Yape/Plin app and confirms the
// transfer with the reported operation number actually arrived.
export class ConfirmManualPaymentUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(orderId: string): Promise<Order> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment || payment.status !== "pending_verification") {
      throw new ConflictError("No hay un pago manual pendiente de verificación para esta orden");
    }

    const paidOrder = await this.orderRepository.markPaid(orderId);
    if (!paidOrder) {
      throw new NotFoundError("Orden no encontrada o ya resuelta");
    }

    await this.paymentRepository.updateStatus(orderId, "confirmed");
    this.eventBus.publish({ type: "order.paid", order: paidOrder });

    // markPaid()'s returned snapshot was fetched before the payment status update above —
    // re-fetch so the response's nested `payment.status` isn't stale ("pending_verification").
    const refreshed = await this.orderRepository.findById(orderId);
    return refreshed ?? paidOrder;
  }
}
