import { Order } from "../entities/Order";
import { Complaint } from "../entities/Complaint";
import { User } from "../entities/User";
import { ProductVariant } from "../entities/ProductVariant";

export interface IEmailService {
  sendOrderConfirmedEmail(order: Order): Promise<void>;
  sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void>;
  /** The legally-required "constancia" for a Libro de Reclamaciones submission — see CreateComplaintUseCase. */
  sendComplaintReceivedEmail(complaint: Complaint): Promise<void>;
  sendPasswordResetEmail(user: User, resetUrl: string): Promise<void>;
  sendVerificationEmail(user: User, verifyUrl: string): Promise<void>;
  sendLowStockDigestEmail(admin: User, variants: ProductVariant[], threshold: number): Promise<void>;
}
