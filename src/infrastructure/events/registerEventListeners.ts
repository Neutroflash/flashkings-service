import { eventBus } from "./NodeEventBus";
import { emailService } from "../email/emailService";
import { ComplaintCreatedEvent, OrderPaidEvent, OrderShippedEvent } from "../../domain/events/OrderEvents";
import { logger } from "../logging/logger";

/** Wires notification side-effects to domain events. Called once at server startup (server.ts) —
 * never in worker.ts, since payment confirmation only happens through the HTTP process (charge/webhook routes). */
export function registerEventListeners(): void {
  eventBus.subscribe<OrderPaidEvent>("order.paid", async (event) => {
    await emailService.sendOrderConfirmedEmail(event.order);
    logger.info({ orderId: event.order.id }, "OrderConfirmedEmail sent");
  });

  eventBus.subscribe<OrderShippedEvent>("order.shipped", async (event) => {
    await emailService.sendOrderShippedEmail(event.order, event.trackingNumber, event.courier);
    logger.info({ orderId: event.order.id }, "OrderShippedEmail sent");
  });

  eventBus.subscribe<ComplaintCreatedEvent>("complaint.created", async (event) => {
    await emailService.sendComplaintReceivedEmail(event.complaint);
    logger.info({ complaintId: event.complaint.id, correlativo: event.complaint.correlativo }, "ComplaintReceivedEmail sent");
  });
}
