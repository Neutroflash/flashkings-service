import { Request, Response } from "express";
import { z } from "zod";
import { ValidateCartUseCase } from "../../application/orders/ValidateCartUseCase";
import { CreateOrderUseCase } from "../../application/orders/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { ListOrdersUseCase } from "../../application/orders/ListOrdersUseCase";
import { toPublicOrder } from "../../domain/entities/Order";
import { env } from "../../config/env";
import { PERU_DEPARTMENTS, quoteShipping } from "../../domain/entities/Shipping";

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
  /** Calle y referencia. La ubicación que tarifa el envío son los tres campos siguientes. */
  shippingAddress: z.string().min(5),
  // Se valida contra la lista real de departamentos: de acá sale la zona y, con ella, el flete.
  // Un valor libre haría que cualquier typo cayera en PROVINCIA y cobrara S/ 25 de más.
  shippingDepartment: z.enum(PERU_DEPARTMENTS),
  shippingProvince: z.string().trim().min(2).max(60),
  shippingDistrict: z.string().trim().min(2).max(60),
  items: z.array(cartItemSchema).min(1),
});

const shippingQuoteSchema = z.object({
  department: z.enum(PERU_DEPARTMENTS),
  province: z.string().trim().min(2).max(60),
});

export class OrderController {
  constructor(
    private readonly validateCartUseCase: ValidateCartUseCase,
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase,
  ) {}

  /** Cotiza el flete antes de crear la orden, para que el checkout muestre el total real. La
   * tarifa definitiva se vuelve a calcular en el servidor al crear la orden — esto es solo UX. */
  quoteShippingCost = async (req: Request, res: Response): Promise<void> => {
    const input = shippingQuoteSchema.parse(req.query);
    const quote = quoteShipping(input.department, input.province);
    res.status(200).json(quote);
  };

  /** La lista que alimenta el selector del checkout. */
  listDepartments = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ departments: PERU_DEPARTMENTS });
  };

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
      shippingDepartment: input.shippingDepartment,
      shippingProvince: input.shippingProvince,
      shippingDistrict: input.shippingDistrict,
      items: input.items.map((item) => ({ productVariantId: item.variantId, quantity: item.quantity })),
    });

    // totalAmount ya incluye el flete y es el monto que el checkout debe cobrar — el cliente nunca
    // vuelve a sumar su propio total para pasárselo a la pasarela.
    res.status(201).json({
      orderId: order.id,
      totalAmount: order.totalAmount,
      shippingCost: order.shippingCost,
      publicKey: env.payment.culqiPublicKey,
    });
  };

  // Public: order ids are UUIDs (unguessable), sufficient for a confirmation-page link at this scope.
  // Sanitized to PublicOrder unless the caller is an authenticated ADMIN (see attachUserIfPresent on the route).
  getById = async (req: Request, res: Response): Promise<void> => {
    const order = await this.getOrderByIdUseCase.execute(req.params.id, req.user?.role);
    res.status(200).json({ order });
  };

  // Protected by authenticateJWT at the route level — req.user is guaranteed. Always sanitized
  // (never the ADMIN view), regardless of the caller's role: this is "my orders", not an admin tool.
  mine = async (req: Request, res: Response): Promise<void> => {
    const query = z
      .object({ page: z.coerce.number().int().positive().optional(), pageSize: z.coerce.number().int().positive().max(50).optional() })
      .parse(req.query);
    const result = await this.listOrdersUseCase.execute({ userId: req.user!.id, ...query });
    res.status(200).json({ ...result, items: result.items.map(toPublicOrder) });
  };
}
