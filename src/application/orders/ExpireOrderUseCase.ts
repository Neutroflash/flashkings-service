import { IOrderRepository } from "../../domain/repositories/IOrderRepository";

/** Invoked by the BullMQ worker when a 15-minute stock hold times out unpaid. */
export class ExpireOrderUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(orderId: string): Promise<void> {
    await this.orderRepository.releaseHold(orderId, "EXPIRED_HOLD");
  }
}
