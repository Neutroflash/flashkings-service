import { Request, Response } from "express";
import { z } from "zod";
import { ProcessPaymentUseCase } from "../../application/payments/ProcessPaymentUseCase";
import { HandleCulqiWebhookUseCase } from "../../application/payments/HandleCulqiWebhookUseCase";

const chargeSchema = z.object({
  orderId: z.string().uuid(),
  sourceId: z.string().min(1),
});

export class PaymentController {
  constructor(
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    private readonly handleCulqiWebhookUseCase: HandleCulqiWebhookUseCase,
  ) {}

  // Synchronous fast-path (card payments). Public: guest checkout has no session to authenticate.
  charge = async (req: Request, res: Response): Promise<void> => {
    const input = chargeSchema.parse(req.body);
    const result = await this.processPaymentUseCase.execute(input);
    res.status(200).json({ order: result.order, status: result.status });
  };

  // No cookie auth — authenticity comes from the signature check inside the use case.
  // req.body is a raw Buffer here (see express.raw() applied only to this route in the router).
  webhook = async (req: Request, res: Response): Promise<void> => {
    const signatureHeader = req.header("X-Culqi-Signature"); // placeholder header name — confirm against live Culqi docs
    await this.handleCulqiWebhookUseCase.execute(req.body as Buffer, signatureHeader);
    res.status(200).json({ received: true });
  };
}
