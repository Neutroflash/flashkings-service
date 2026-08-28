import { createHmac, timingSafeEqual } from "crypto";
import {
  CreateChargeInput,
  CreateChargeResult,
  IPaymentGateway,
  PaymentWebhookEvent,
} from "../../domain/services/IPaymentGateway";
import { env } from "../../config/env";

const CULQI_CHARGES_URL = "https://api.culqi.com/v2/charges";

interface CulqiChargeResponse {
  id?: string;
  outcome?: { type?: string };
  merchant_message?: string;
  object?: string;
  [key: string]: unknown;
}

/**
 * Coded against Culqi's documented REST charge shape. NOT verified end-to-end without live
 * sandbox credentials — before go-live, confirm `verifyWebhookSignature`'s header name/algorithm
 * against the current Culqi dashboard/docs; this HMAC-SHA256-over-raw-body scheme is a placeholder.
 */
export class CulqiPaymentGateway implements IPaymentGateway {
  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const amountInCents = Math.round(input.amount * 100);

    const response = await fetch(CULQI_CHARGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.payment.culqiSecretKey}`,
      },
      body: JSON.stringify({
        amount: amountInCents,
        currency_code: input.currency,
        email: input.email,
        source_id: input.sourceId,
        metadata: { orderId: input.orderId },
      }),
    });

    const raw = (await response.json()) as CulqiChargeResponse;

    if (!response.ok || !raw.id) {
      return { providerChargeId: raw.id ?? "", status: "failed", raw };
    }

    return { providerChargeId: raw.id, status: "succeeded", raw };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader || !env.payment.culqiWebhookSecret) return false;

    const expected = createHmac("sha256", env.payment.culqiWebhookSecret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf-8");
    const receivedBuffer = Buffer.from(signatureHeader, "utf-8");

    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  parseWebhookEvent(rawBody: Buffer): PaymentWebhookEvent {
    const body = JSON.parse(rawBody.toString("utf-8")) as {
      type?: string;
      data?: { id?: string; metadata?: { orderId?: string }; outcome?: { type?: string } };
    };

    const outcomeType = body.data?.outcome?.type;
    const status = outcomeType === "venta_exitosa" ? "succeeded" : outcomeType ? "failed" : "pending";

    return {
      type: body.type ?? "unknown",
      orderId: body.data?.metadata?.orderId ?? null,
      providerChargeId: body.data?.id ?? null,
      status,
      raw: body,
    };
  }
}
