import { IOrderRepository, OrderFilters, PaginatedOrders } from "../../domain/repositories/IOrderRepository";

export class ListOrdersUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  execute(filters: OrderFilters): Promise<PaginatedOrders> {
    return this.orderRepository.findMany(filters);
  }
}
