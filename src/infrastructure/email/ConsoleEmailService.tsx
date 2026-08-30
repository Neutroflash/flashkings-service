import { render } from "@react-email/render";
import { IEmailService } from "../../domain/services/IEmailService";
import { Order } from "../../domain/entities/Order";
import { Complaint } from "../../domain/entities/Complaint";
import { User } from "../../domain/entities/User";
import { logger } from "../logging/logger";
import { OrderConfirmedEmail } from "./templates/OrderConfirmedEmail";
import { OrderShippedEmail } from "./templates/OrderShippedEmail";
import { ComplaintReceivedEmail } from "./templates/ComplaintReceivedEmail";
import { PasswordResetEmail } from "./templates/PasswordResetEmail";
import { VerifyEmailEmail } from "./templates/VerifyEmailEmail";
import { LowStockDigestEmail } from "./templates/LowStockDigestEmail";
import { ProductVariant } from "../../domain/entities/ProductVariant";

/** Dev/test fallback when EMAIL_PROVIDER=console (no Resend API key needed) — renders the
 * real template and logs it instead of sending, so the flow is fully exercisable without credentials. */
export class ConsoleEmailService implements IEmailService {
  async sendOrderConfirmedEmail(order: Order): Promise<void> {
    const html = await render(<OrderConfirmedEmail order={order} />, { plainText: true });
    logger.info({ to: order.customerEmail, orderId: order.id }, "[email:console] OrderConfirmedEmail");
    logger.debug({ html });
  }

  async sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void> {
    const text = await render(<OrderShippedEmail order={order} trackingNumber={trackingNumber} courier={courier} />, {
      plainText: true,
    });
    logger.info(
      { to: order.customerEmail, orderId: order.id, trackingNumber, courier },
      "[email:console] OrderShippedEmail",
    );
    logger.debug({ text });
  }

  async sendComplaintReceivedEmail(complaint: Complaint): Promise<void> {
    const text = await render(<ComplaintReceivedEmail complaint={complaint} />, { plainText: true });
    logger.info(
      { to: complaint.email, complaintId: complaint.id, correlativo: complaint.correlativo },
      "[email:console] ComplaintReceivedEmail",
    );
    logger.debug({ text });
  }

  async sendPasswordResetEmail(user: User, resetUrl: string): Promise<void> {
    const text = await render(<PasswordResetEmail user={user} resetUrl={resetUrl} />, { plainText: true });
    // A nivel info (no debug): en modo console es la única forma de probar el flujo sin cuenta de Resend real.
    logger.info({ to: user.email, resetUrl }, "[email:console] PasswordResetEmail");
    logger.debug({ text });
  }

  async sendVerificationEmail(user: User, verifyUrl: string): Promise<void> {
    const text = await render(<VerifyEmailEmail user={user} verifyUrl={verifyUrl} />, { plainText: true });
    logger.info({ to: user.email, verifyUrl }, "[email:console] VerifyEmailEmail");
    logger.debug({ text });
  }

  async sendLowStockDigestEmail(admin: User, variants: ProductVariant[], threshold: number): Promise<void> {
    const text = await render(<LowStockDigestEmail admin={admin} variants={variants} threshold={threshold} />, { plainText: true });
    logger.info(
      { to: admin.email, threshold, skus: variants.map((v) => v.sku) },
      "[email:console] LowStockDigestEmail",
    );
    logger.debug({ text });
  }
}
