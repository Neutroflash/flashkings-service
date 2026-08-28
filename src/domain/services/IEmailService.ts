import { Order } from "../entities/Order";

export interface IEmailService {
  sendOrderConfirmedEmail(order: Order): Promise<void>;
  sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void>;
}
