import { render } from "@react-email/render";
import { IEmailService } from "../../domain/services/IEmailService";
import { Order } from "../../domain/entities/Order";
import { Complaint } from "../../domain/entities/Complaint";
import { logger } from "../logging/logger";
import { OrderConfirmedEmail } from "./templates/OrderConfirmedEmail";
import { OrderShippedEmail } from "./templates/OrderShippedEmail";
import { ComplaintReceivedEmail } from "./templates/ComplaintReceivedEmail";

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
}
