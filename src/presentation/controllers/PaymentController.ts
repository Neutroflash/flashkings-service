import { Request, Response } from "express";
import { z } from "zod";
import { ProcessPaymentUseCase } from "../../application/payments/ProcessPaymentUseCase";
import { HandleCulqiWebhookUseCase } from "../../application/payments/HandleCulqiWebhookUseCase";
import { SubmitManualPaymentUseCase } from "../../application/payments/SubmitManualPaymentUseCase";

const chargeSchema = z.object({
  orderId: z.string().uuid(),
  sourceId: z.string().min(1),
});

const submitManualSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["yape", "plin"]),
  operationNumber: z.string().trim().min(4, "Número de operación inválido").max(30),
});

export class PaymentController {
  constructor(
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    private readonly handleCulqiWebhookUseCase: HandleCulqiWebhookUseCase,
    private readonly submitManualPaymentUseCase: SubmitManualPaymentUseCase,
  ) {}

  // Synchronous fast-path (card payments). Public: guest checkout has no session to authenticate.
  charge = async (req: Request, res: Response): Promise<void> => {
    const input = chargeSchema.parse(req.body);
    const result = await this.processPaymentUseCase.execute(input);
    res.status(200).json({ order: result.order, status: result.status });
  };

  // No cookie auth — the request body itself is untrusted (see HandleCulqiWebhookUseCase, which
  // re-verifies the charge directly against Culqi before acting on it).
  // req.body is a raw Buffer here (see express.raw() applied only to this route in the router).
  webhook = async (req: Request, res: Response): Promise<void> => {
    await this.handleCulqiWebhookUseCase.execute(req.body as Buffer);
    res.status(200).json({ received: true });
  };

  // Public: guest checkout has no session to authenticate against. Does not mark the order
  // PAID — only an ADMIN confirming from the dashboard does that (see AdminOrderController).
  submitManual = async (req: Request, res: Response): Promise<void> => {
    const input = submitManualSchema.parse(req.body);
    const order = await this.submitManualPaymentUseCase.execute(input);
    res.status(200).json({ order });
  };
}
