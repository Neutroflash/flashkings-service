import { Request, Response } from "express";
import { z } from "zod";
import { ListOrdersUseCase } from "../../application/orders/ListOrdersUseCase";
import { UpdateOrderStatusUseCase } from "../../application/orders/UpdateOrderStatusUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { ConfirmManualPaymentUseCase } from "../../application/payments/ConfirmManualPaymentUseCase";
import { RejectManualPaymentUseCase } from "../../application/payments/RejectManualPaymentUseCase";
import { IssueInvoiceUseCase } from "../../application/invoicing/IssueInvoiceUseCase";
import { GetInvoicePdfUseCase } from "../../application/invoicing/GetInvoicePdfUseCase";
import { GetInvoiceTicketDataUseCase } from "../../application/invoicing/GetInvoiceTicketDataUseCase";
import { IssueCreditNoteUseCase } from "../../application/invoicing/IssueCreditNoteUseCase";
import { RefundOrderUseCase } from "../../application/refunds/RefundOrderUseCase";
import { CREDIT_NOTE_REASONS } from "../../infrastructure/invoicing/sunat/note-catalogs";

const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "IN_PREPARATION",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

// Derivado del catálogo 09 de SUNAT en vez de repetir los códigos acá — un motivo que el
// catálogo no tenga no puede llegar a la nota de crédito.
const REASON_CODES = CREDIT_NOTE_REASONS.map((r) => r.code) as [string, ...string[]];

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

const issueInvoiceSchema = z
  .object({
    type: z.enum(["BOLETA", "FACTURA"]),
    documentType: z.enum(["DNI", "RUC", "CE", "PASAPORTE"]),
    documentNumber: z.string().trim().min(4).max(20),
    businessName: z.string().trim().min(2).optional(),
  })
  // SUNAT requires the buyer's razón social on a factura.
  .refine((data) => data.type !== "FACTURA" || !!data.businessName, {
    message: "businessName es requerido para facturas",
    path: ["businessName"],
  });

const refundSchema = z.object({
  // Omitido = se devuelve todo lo que quede pendiente de la orden.
  amount: z.number().positive().optional(),
  items: z
    .array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().positive() }))
    .optional(),
  reasonCode: z.enum(REASON_CODES),
  reasonText: z.string().trim().min(3).max(300).optional(),
  isManual: z.boolean().optional(),
  restock: z.boolean().optional(),
});

export class AdminOrderController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
    private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
    private readonly confirmManualPaymentUseCase: ConfirmManualPaymentUseCase,
    private readonly rejectManualPaymentUseCase: RejectManualPaymentUseCase,
    private readonly issueInvoiceUseCase: IssueInvoiceUseCase,
    private readonly getInvoicePdfUseCase: GetInvoicePdfUseCase,
    private readonly getInvoiceTicketDataUseCase: GetInvoiceTicketDataUseCase,
    private readonly refundOrderUseCase: RefundOrderUseCase,
    private readonly issueCreditNoteUseCase: IssueCreditNoteUseCase,
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

  issueInvoice = async (req: Request, res: Response): Promise<void> => {
    const input = issueInvoiceSchema.parse(req.body);
    const invoice = await this.issueInvoiceUseCase.execute({ orderId: req.params.id, ...input });
    res.status(201).json({ invoice });
  };

  refund = async (req: Request, res: Response): Promise<void> => {
    const input = refundSchema.parse(req.body);
    const result = await this.refundOrderUseCase.execute({
      orderId: req.params.id,
      ...input,
      adminUserId: req.user?.id ?? null,
    });
    res.status(201).json({ refund: result.refund, order: result.order });
  };

  issueCreditNote = async (req: Request, res: Response): Promise<void> => {
    const note = await this.issueCreditNoteUseCase.execute({ refundId: req.params.refundId });
    res.status(201).json({ invoice: note });
  };

  /** El catálogo 09 que alimenta el desplegable de motivos del panel — evita duplicarlo en el frontend. */
  listRefundReasons = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ reasons: CREDIT_NOTE_REASONS });
  };

  getInvoicePdf = async (req: Request, res: Response): Promise<void> => {
    const pdfBuffer = await this.getInvoicePdfUseCase.execute(req.params.id);
    res.status(200).setHeader("Content-Type", "application/pdf").send(pdfBuffer);
  };

  getInvoiceTicketData = async (req: Request, res: Response): Promise<void> => {
    const data = await this.getInvoiceTicketDataUseCase.execute(req.params.id);
    res.status(200).json(data);
  };
}
