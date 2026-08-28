import { Order } from "../entities/Order";

export interface OrderPaidEvent {
  type: "order.paid";
  order: Order;
}

export interface OrderShippedEvent {
  type: "order.shipped";
  order: Order;
  trackingNumber: string | null;
  courier: string | null;
}

export type DomainEvent = OrderPaidEvent | OrderShippedEvent;
