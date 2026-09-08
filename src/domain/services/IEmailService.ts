import { Order } from "../entities/Order";
import { Complaint } from "../entities/Complaint";
import { Refund } from "../entities/Refund";
import { User } from "../entities/User";
import { ProductVariant } from "../entities/ProductVariant";

export interface IEmailService {
  sendOrderConfirmedEmail(order: Order): Promise<void>;
  sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void>;
  /** Aviso al cliente de que su dinero fue devuelto — total o parcialmente. */
  sendOrderRefundedEmail(order: Order, refund: Refund): Promise<void>;
  /** The legally-required "constancia" for a Libro de Reclamaciones submission — see CreateComplaintUseCase. */
  sendComplaintReceivedEmail(complaint: Complaint): Promise<void>;
  sendPasswordResetEmail(user: User, resetUrl: string): Promise<void>;
  sendVerificationEmail(user: User, verifyUrl: string): Promise<void>;
  sendLowStockDigestEmail(admin: User, variants: ProductVariant[], threshold: number): Promise<void>;
}
