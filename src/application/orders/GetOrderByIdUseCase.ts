import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { Order, PublicOrder, toPublicOrder } from "../../domain/entities/Order";
import { Role } from "../../domain/entities/User";
import { NotFoundError } from "../../shared/errors/AppError";

export class GetOrderByIdUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(orderId: string, requesterRole?: Role): Promise<Order | PublicOrder> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    return requesterRole === "ADMIN" ? order : toPublicOrder(order);
  }
}
