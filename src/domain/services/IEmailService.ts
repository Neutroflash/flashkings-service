import { Order } from "../entities/Order";
import { Complaint } from "../entities/Complaint";

export interface IEmailService {
  sendOrderConfirmedEmail(order: Order): Promise<void>;
  sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void>;
  /** The legally-required "constancia" for a Libro de Reclamaciones submission — see CreateComplaintUseCase. */
  sendComplaintReceivedEmail(complaint: Complaint): Promise<void>;
}
