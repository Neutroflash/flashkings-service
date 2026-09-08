import { randomUUID } from "crypto";
import {
  ChargeStatusResult,
  CreateChargeInput,
  CreateChargeResult,
  CreateRefundInput,
  CreateRefundResult,
  IPaymentGateway,
  PaymentWebhookEvent,
} from "../../domain/services/IPaymentGateway";

// Magic amount to exercise the decline path in dev/tests without a real gateway.
const DECLINE_AMOUNT = 13;
// Same trick on the refund side: this exact refund amount fails, so the "gateway refused the
// refund" branch is reachable in dev without a real gateway.
const REFUND_DECLINE_AMOUNT = 7;

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

  async refundCharge(input: CreateRefundInput): Promise<CreateRefundResult> {
    // Refunding a charge this gateway never issued is a programming error, not a decline —
    // surfacing it as "failed" would hide it behind a plausible-looking business outcome.
    if (!this.charges.has(input.providerChargeId)) {
      return { providerRefundId: null, status: "failed", raw: { fake: true, error: "charge_not_found", input } };
    }
    if (input.amount === REFUND_DECLINE_AMOUNT) {
      return { providerRefundId: null, status: "failed", raw: { fake: true, error: "refund_declined", input } };
    }
    return { providerRefundId: `fake_ref_${randomUUID()}`, status: "succeeded", raw: { fake: true, input } };
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
