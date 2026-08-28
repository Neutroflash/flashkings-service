import { Order } from "../entities/Order";
import { Complaint } from "../entities/Complaint";

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

export interface ComplaintCreatedEvent {
  type: "complaint.created";
  complaint: Complaint;
}

export type DomainEvent = OrderPaidEvent | OrderShippedEvent | ComplaintCreatedEvent;
