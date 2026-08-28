import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import { Order } from "../../domain/entities/Order";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

// ADMIN-only: called when the reported operation number doesn't match any transfer the admin can
// find (mistake, bad-faith claim, etc.) — releases the held stock instead of leaving it locked forever.
export class RejectManualPaymentUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
  ) {}

  async execute(orderId: string): Promise<Order> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment || payment.status !== "pending_verification") {
      throw new ConflictError("No hay un pago manual pendiente de verificación para esta orden");
    }

    const cancelledOrder = await this.orderRepository.releaseHold(orderId, "ADMIN_CANCELLED");
    if (!cancelledOrder) {
      throw new NotFoundError("Orden no encontrada o ya resuelta");
    }

    await this.paymentRepository.updateStatus(orderId, "rejected");

    // Same staleness fix as ConfirmManualPaymentUseCase: releaseHold()'s snapshot predates the
    // payment status update above.
    const refreshed = await this.orderRepository.findById(orderId);
    return refreshed ?? cancelledOrder;
  }
}
