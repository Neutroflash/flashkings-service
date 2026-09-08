import { Order } from "../entities/Order";
import { Complaint } from "../entities/Complaint";
import { Refund } from "../entities/Refund";

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

export interface OrderRefundedEvent {
  type: "order.refunded";
  order: Order;
  refund: Refund;
}

export interface ComplaintCreatedEvent {
  type: "complaint.created";
  complaint: Complaint;
}

export type DomainEvent = OrderPaidEvent | OrderShippedEvent | OrderRefundedEvent | ComplaintCreatedEvent;
