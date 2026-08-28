import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { Order, OrderStatus } from "../../domain/entities/Order";
import { IEventBus } from "../../domain/services/IEventBus";
import { NotFoundError } from "../../shared/errors/AppError";

export interface UpdateOrderStatusInput {
  trackingNumber?: string;
  courier?: string;
}

// ADMIN-only. PAID/PENDING_PAYMENT/CANCELLED are system-managed and rejected by the
// repository's transition table (see ALLOWED_MANUAL_TRANSITIONS in domain/entities/Order.ts).
export class UpdateOrderStatusUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(orderId: string, nextStatus: OrderStatus, input: UpdateOrderStatusInput = {}): Promise<Order> {
    const updated = await this.orderRepository.updateStatus(orderId, nextStatus, input);
    if (!updated) {
      throw new NotFoundError("Orden no encontrada");
    }

    if (nextStatus === "SHIPPED") {
      this.eventBus.publish({
        type: "order.shipped",
        order: updated,
        trackingNumber: updated.trackingNumber,
        courier: updated.courier,
      });
    }

    return updated;
  }
}
