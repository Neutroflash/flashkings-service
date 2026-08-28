import { Request, Response } from "express";
import { z } from "zod";
import { ValidateCartUseCase } from "../../application/orders/ValidateCartUseCase";
import { CreateOrderUseCase } from "../../application/orders/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { env } from "../../config/env";

const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const validateCartSchema = z.object({
  items: z.array(cartItemSchema).min(1),
});

const createOrderSchema = z.object({
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(6),
  shippingAddress: z.string().min(5),
  items: z.array(cartItemSchema).min(1),
});

export class OrderController {
  constructor(
    private readonly validateCartUseCase: ValidateCartUseCase,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
  ) {}

  // Non-authoritative UX check before checkout — see ValidateCartUseCase.
  validateCart = async (req: Request, res: Response): Promise<void> => {
    const input = validateCartSchema.parse(req.body);
    const result = await this.validateCartUseCase.execute(input.items);
    res.status(200).json(result);
  };

  // Guest or authenticated checkout: req.user is set only if a valid session cookie was present.
  create = async (req: Request, res: Response): Promise<void> => {
    const input = createOrderSchema.parse(req.body);
    const order = await this.createOrderUseCase.execute({
      userId: req.user?.id ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      shippingAddress: input.shippingAddress,
      items: input.items.map((item) => ({ productVariantId: item.variantId, quantity: item.quantity })),
    });

    res.status(201).json({
      orderId: order.id,
      totalAmount: order.totalAmount,
      publicKey: env.payment.culqiPublicKey,
    });
  };

  // Public: order ids are UUIDs (unguessable), sufficient for a confirmation-page link at this scope.
  // Sanitized to PublicOrder unless the caller is an authenticated ADMIN (see attachUserIfPresent on the route).
  getById = async (req: Request, res: Response): Promise<void> => {
    const order = await this.getOrderByIdUseCase.execute(req.params.id, req.user?.role);
    res.status(200).json({ order });
  };
}
