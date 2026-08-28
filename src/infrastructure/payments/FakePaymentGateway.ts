import { randomUUID } from "crypto";
import {
  CreateChargeInput,
  CreateChargeResult,
  IPaymentGateway,
  PaymentWebhookEvent,
} from "../../domain/services/IPaymentGateway";

// Magic amount to exercise the decline path in dev/tests without a real gateway.
const DECLINE_AMOUNT = 13;

/** Deterministic in-memory gateway for local dev/tests: no real network calls, no credentials needed. */
export class FakePaymentGateway implements IPaymentGateway {
  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const declined = input.amount === DECLINE_AMOUNT;
    return {
      providerChargeId: `fake_${randomUUID()}`,
      status: declined ? "failed" : "succeeded",
      raw: { fake: true, input },
    };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }

  parseWebhookEvent(rawBody: Buffer): PaymentWebhookEvent {
    const body = JSON.parse(rawBody.toString("utf-8")) as {
      type?: string;
      orderId?: string;
      providerChargeId?: string;
      status?: "succeeded" | "pending" | "failed";
    };
    return {
      type: body.type ?? "charge.updated",
      orderId: body.orderId ?? null,
      providerChargeId: body.providerChargeId ?? null,
      status: body.status ?? "succeeded",
      raw: body,
    };
  }
}
