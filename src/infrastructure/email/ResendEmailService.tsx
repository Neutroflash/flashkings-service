import { Resend } from "resend";
import { render } from "@react-email/render";
import { IEmailService } from "../../domain/services/IEmailService";
import { Order } from "../../domain/entities/Order";
import { Complaint } from "../../domain/entities/Complaint";
import { env } from "../../config/env";
import { logger } from "../logging/logger";
import { OrderConfirmedEmail } from "./templates/OrderConfirmedEmail";
import { OrderShippedEmail } from "./templates/OrderShippedEmail";
import { ComplaintReceivedEmail } from "./templates/ComplaintReceivedEmail";

export class ResendEmailService implements IEmailService {
  private readonly resend = new Resend(env.email.resendApiKey);

  async sendOrderConfirmedEmail(order: Order): Promise<void> {
    const html = await render(<OrderConfirmedEmail order={order} />);
    await this.send(order.customerEmail, `Confirmamos tu pago — Pedido #${order.id.slice(0, 8)}`, html);
  }

  async sendOrderShippedEmail(order: Order, trackingNumber: string | null, courier: string | null): Promise<void> {
    const html = await render(<OrderShippedEmail order={order} trackingNumber={trackingNumber} courier={courier} />);
    await this.send(order.customerEmail, `Tu pedido #${order.id.slice(0, 8)} está en camino`, html);
  }

  async sendComplaintReceivedEmail(complaint: Complaint): Promise<void> {
    const html = await render(<ComplaintReceivedEmail complaint={complaint} />);
    const code = `RC-${String(complaint.correlativo).padStart(6, "0")}`;
    await this.send(complaint.email, `Constancia de tu reclamo — ${code}`, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    const { error } = await this.resend.emails.send({ from: env.email.from, to, subject, html });
    if (error) {
      logger.error({ error, to, subject }, "Resend failed to send email");
      throw new Error(`Resend error: ${error.message}`);
    }
  }
}
