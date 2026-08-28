import { Request, Response } from "express";
import { z } from "zod";
import { ListOrdersUseCase } from "../../application/orders/ListOrdersUseCase";
import { UpdateOrderStatusUseCase } from "../../application/orders/UpdateOrderStatusUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { ConfirmManualPaymentUseCase } from "../../application/payments/ConfirmManualPaymentUseCase";
import { RejectManualPaymentUseCase } from "../../application/payments/RejectManualPaymentUseCase";

const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "IN_PREPARATION", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

const listQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

// Only manual admin-driven transitions — PAID/PENDING_PAYMENT/CANCELLED are system-managed
// (payment confirmation, hold expiry/decline) and rejected by the repository's transition table.
const updateStatusSchema = z.object({
  status: z.enum(["IN_PREPARATION", "SHIPPED", "DELIVERED"]),
  // Only meaningful (and only sent by the admin UI) when status === "SHIPPED" — see OrderShippedEmail.
  trackingNumber: z.string().min(1).optional(),
  courier: z.string().min(1).optional(),
});

export class AdminOrderController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
    private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
    private readonly confirmManualPaymentUseCase: ConfirmManualPaymentUseCase,
    private readonly rejectManualPaymentUseCase: RejectManualPaymentUseCase,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = listQuerySchema.parse(req.query);
    const result = await this.listOrdersUseCase.execute(query);
    res.status(200).json(result);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const order = await this.getOrderByIdUseCase.execute(req.params.id, "ADMIN");
    res.status(200).json({ order });
  };

  updateStatus = async (req: Request, res: Response): Promise<void> => {
    const input = updateStatusSchema.parse(req.body);
    const order = await this.updateOrderStatusUseCase.execute(req.params.id, input.status, {
      trackingNumber: input.trackingNumber,
      courier: input.courier,
    });
    res.status(200).json({ order });
  };

  confirmPayment = async (req: Request, res: Response): Promise<void> => {
    const order = await this.confirmManualPaymentUseCase.execute(req.params.id);
    res.status(200).json({ order });
  };

  rejectPayment = async (req: Request, res: Response): Promise<void> => {
    const order = await this.rejectManualPaymentUseCase.execute(req.params.id);
    res.status(200).json({ order });
  };
}
