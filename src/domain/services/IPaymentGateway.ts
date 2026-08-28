export type ChargeStatus = "succeeded" | "pending" | "failed";

export interface CreateChargeInput {
  amount: number; // soles, e.g. 349.90
  currency: "PEN";
  orderId: string;
  email: string;
  sourceId: string; // Culqi.js token/card-id generated client-side
}

export interface CreateChargeResult {
  providerChargeId: string;
  status: ChargeStatus;
  raw: unknown;
}

export interface PaymentWebhookEvent {
  type: string;
  orderId: string | null;
  providerChargeId: string | null;
  status: ChargeStatus;
  raw: unknown;
}

export interface ChargeStatusResult {
  status: ChargeStatus;
  /** null when the charge doesn't exist, isn't ours, or carries no orderId metadata. */
  orderId: string | null;
}

export interface IPaymentGateway {
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /**
   * Re-fetches a charge's status directly from the gateway using our own secret key — the only
   * source a money decision may trust. A webhook POST body is otherwise fully spoofable (see the
   * comment on CulqiPaymentGateway), so parseWebhookEvent's result is used only to learn which
   * chargeId to look up here, never to learn its outcome directly.
   */
  fetchChargeStatus(chargeId: string): Promise<ChargeStatusResult>;
  parseWebhookEvent(rawBody: Buffer): PaymentWebhookEvent;
}
