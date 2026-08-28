import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentGateway } from "../../domain/services/IPaymentGateway";
import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { IEventBus } from "../../domain/services/IEventBus";

// markPaid/releaseHold are both idempotent (guarded on status='PENDING_PAYMENT'), so this
// is safe to run redundantly alongside ProcessPaymentUseCase's synchronous fast-path.
export class HandleCulqiWebhookUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly stockHoldScheduler: IStockHoldScheduler,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(rawBody: Buffer): Promise<void> {
    const event = this.paymentGateway.parseWebhookEvent(rawBody);
    if (!event.providerChargeId) return;

    // The webhook body is untrusted input (see the comment on CulqiPaymentGateway) — it only
    // tells us which charge to look up. The actual status/orderId always comes from re-querying
    // the gateway directly with our own secret key, never from event.status/event.orderId.
    const { status, orderId } = await this.paymentGateway.fetchChargeStatus(event.providerChargeId);
    if (!orderId) return;

    if (status === "succeeded") {
      const paidOrder = await this.orderRepository.markPaid(orderId);
      await this.stockHoldScheduler.cancel(orderId);
      if (paidOrder) {
        this.eventBus.publish({ type: "order.paid", order: paidOrder });
      }
    } else if (status === "failed") {
      await this.orderRepository.releaseHold(orderId, "PAYMENT_DECLINED");
    }
  }
}
