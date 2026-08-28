import { CreateOrderInput, IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { Order } from "../../domain/entities/Order";
import { env } from "../../config/env";

export class CreateOrderUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly stockHoldScheduler: IStockHoldScheduler,
  ) {}

  async execute(input: CreateOrderInput): Promise<Order> {
    const order = await this.orderRepository.createWithStockReservation(input);
    await this.stockHoldScheduler.schedule(order.id, env.stockHoldMinutes * 60 * 1000);
    return order;
  }
}
