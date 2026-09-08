import {
  ChargeStatusResult,
  CreateChargeInput,
  CreateChargeResult,
  CreateRefundInput,
  CreateRefundResult,
  IPaymentGateway,
  PaymentWebhookEvent,
} from "../../domain/services/IPaymentGateway";
import { env } from "../../config/env";

const CULQI_CHARGES_URL = "https://api.culqi.com/v2/charges";
const CULQI_REFUNDS_URL = "https://api.culqi.com/v2/refunds";
/** Catálogo cerrado de Culqi. El motivo real y legible del admin viaja en `metadata.detail`. */
const CULQI_REFUND_REASON = "solicitud_comprador";

interface CulqiChargeResponse {
  id?: string;
  outcome?: { type?: string };
  merchant_message?: string;
  object?: string;
  metadata?: { orderId?: string };
  [key: string]: unknown;
}

interface CulqiRefundResponse {
  id?: string;
  object?: string;
  amount?: number;
  [key: string]: unknown;
}

/**
 * Coded against Culqi's documented REST charge shape. NOT verified end-to-end without live
 * sandbox credentials.
 *
 * Culqi does not publish a signature/HMAC scheme for webhook requests (checked
 * docs.culqi.com/es/documentacion/pagos-online/webhooks/ and apidocs.culqi.com — neither
 * documents a header or algorithm to verify a webhook's authenticity), so a webhook POST body
 * must be treated as fully spoofable input. Instead of guessing an unverifiable scheme, this
 * gateway never trusts a webhook body directly: fetchChargeStatus re-queries Culqi's own API
 * with our secret key for the authoritative status/orderId of a given chargeId. An attacker can
 * POST anything to our webhook endpoint, but they cannot make Culqi's own API lie about the
 * state of a real charge. See HandleCulqiWebhookUseCase for how the two are combined.
 *
 * If you enable "Activar autenticación" on the webhook in the Culqi panel when configuring the
 * real production webhook, that adds HTTP Basic Auth on the incoming request as a second,
 * independent layer — worth turning on, but not a replacement for the re-fetch above, since it
 * only proves the request came from someone who knows the shared credential, not that its body
 * is truthful.
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

  async fetchChargeStatus(chargeId: string): Promise<ChargeStatusResult> {
    const response = await fetch(`${CULQI_CHARGES_URL}/${chargeId}`, {
      headers: { Authorization: `Bearer ${env.payment.culqiSecretKey}` },
    });

    // Charge doesn't exist, isn't ours, or the API errored — never treat as a success.
    if (!response.ok) return { status: "failed", orderId: null };

    const raw = (await response.json()) as CulqiChargeResponse;
    const outcomeType = raw.outcome?.type;
    const status = outcomeType === "venta_exitosa" ? "succeeded" : outcomeType ? "failed" : "pending";

    return { status, orderId: raw.metadata?.orderId ?? null };
  }

  /**
   * POST /v2/refunds. El monto va en céntimos, igual que en el cargo.
   *
   * ⚠️ Escrito contra la API REST documentada de Culqi, NUNCA ejecutado contra un sandbox real —
   * exactamente el mismo estado que createCharge (ver docs/IMPLEMENTATION_STATUS.md). Al
   * conectar las credenciales reales hay que verificar dos cosas antes de confiar en esto: el
   * nombre del campo de motivo (Culqi documenta un catálogo cerrado — "solicitud_comprador",
   * "anulacion_venta", "error_administrativo"; acá se manda el texto libre del admin en
   * `metadata` y un código fijo en `reason`), y si un reembolso parcial devuelve el mismo shape
   * que uno total.
   */
  async refundCharge(input: CreateRefundInput): Promise<CreateRefundResult> {
    const response = await fetch(CULQI_REFUNDS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.payment.culqiSecretKey}`,
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        charge_id: input.providerChargeId,
        reason: CULQI_REFUND_REASON,
        metadata: { detail: input.reason },
      }),
    });

    const raw = (await response.json()) as CulqiRefundResponse;

    if (!response.ok || !raw.id) {
      return { providerRefundId: null, status: "failed", raw };
    }

    return { providerRefundId: raw.id, status: "succeeded", raw };
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
