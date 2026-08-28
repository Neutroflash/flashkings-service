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

export interface IPaymentGateway {
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  /** Verifies the webhook request actually came from the gateway before trusting its body. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  parseWebhookEvent(rawBody: Buffer): PaymentWebhookEvent;
}
