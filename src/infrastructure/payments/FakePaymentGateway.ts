import { randomUUID } from "crypto";
import {
  ChargeStatusResult,
  CreateChargeInput,
  CreateChargeResult,
  IPaymentGateway,
  PaymentWebhookEvent,
} from "../../domain/services/IPaymentGateway";

// Magic amount to exercise the decline path in dev/tests without a real gateway.
const DECLINE_AMOUNT = 13;

/** Deterministic in-memory gateway for local dev/tests: no real network calls, no credentials needed. */
export class FakePaymentGateway implements IPaymentGateway {
  // Mirrors CulqiPaymentGateway's real design: the source of truth for a charge's status lives
  // here (decided once, at creation time), never in whatever a webhook body claims.
  private readonly charges = new Map<string, ChargeStatusResult>();

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const declined = input.amount === DECLINE_AMOUNT;
    const status = declined ? "failed" : "succeeded";
    const providerChargeId = `fake_${randomUUID()}`;
    this.charges.set(providerChargeId, { status, orderId: input.orderId });
    return { providerChargeId, status, raw: { fake: true, input } };
  }

  async fetchChargeStatus(chargeId: string): Promise<ChargeStatusResult> {
    return this.charges.get(chargeId) ?? { status: "failed", orderId: null };
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
