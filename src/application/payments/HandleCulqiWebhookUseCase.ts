import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IPaymentGateway } from "../../domain/services/IPaymentGateway";
import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { IEventBus } from "../../domain/services/IEventBus";
import { UnauthorizedError } from "../../shared/errors/AppError";

// markPaid/releaseHold are both idempotent (guarded on status='PENDING_PAYMENT'), so this
// is safe to run redundantly alongside ProcessPaymentUseCase's synchronous fast-path.
export class HandleCulqiWebhookUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly stockHoldScheduler: IStockHoldScheduler,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    if (!this.paymentGateway.verifyWebhookSignature(rawBody, signatureHeader)) {
      throw new UnauthorizedError("Firma de webhook inválida");
    }

    const event = this.paymentGateway.parseWebhookEvent(rawBody);
    if (!event.orderId) return;

    if (event.status === "succeeded") {
      const paidOrder = await this.orderRepository.markPaid(event.orderId);
      await this.stockHoldScheduler.cancel(event.orderId);
      if (paidOrder) {
        this.eventBus.publish({ type: "order.paid", order: paidOrder });
      }
    } else if (event.status === "failed") {
      await this.orderRepository.releaseHold(event.orderId, "PAYMENT_DECLINED");
    }
  }
}
