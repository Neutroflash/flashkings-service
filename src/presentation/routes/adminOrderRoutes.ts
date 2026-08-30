import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { PrismaPaymentRepository } from "../../infrastructure/database/PrismaPaymentRepository";
import { PrismaInvoiceRepository } from "../../infrastructure/database/PrismaInvoiceRepository";
import { ListOrdersUseCase } from "../../application/orders/ListOrdersUseCase";
import { UpdateOrderStatusUseCase } from "../../application/orders/UpdateOrderStatusUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { ConfirmManualPaymentUseCase } from "../../application/payments/ConfirmManualPaymentUseCase";
import { RejectManualPaymentUseCase } from "../../application/payments/RejectManualPaymentUseCase";
import { IssueInvoiceUseCase } from "../../application/invoicing/IssueInvoiceUseCase";
import { GetInvoicePdfUseCase } from "../../application/invoicing/GetInvoicePdfUseCase";
import { eventBus } from "../../infrastructure/events/NodeEventBus";
import { invoicingGateway } from "../../infrastructure/invoicing/invoicingGateway";
import { sunatRetryScheduler } from "../../infrastructure/queue/sunatRetryScheduler";
import { AdminOrderController } from "../controllers/AdminOrderController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";

const orderRepository = new PrismaOrderRepository(prisma);
const paymentRepository = new PrismaPaymentRepository(prisma);
const invoiceRepository = new PrismaInvoiceRepository(prisma);
const adminOrderController = new AdminOrderController(
  new ListOrdersUseCase(orderRepository),
  new UpdateOrderStatusUseCase(orderRepository, eventBus),
  new GetOrderByIdUseCase(orderRepository),
  new ConfirmManualPaymentUseCase(orderRepository, paymentRepository, eventBus),
  new RejectManualPaymentUseCase(orderRepository, paymentRepository),
  new IssueInvoiceUseCase(invoiceRepository, orderRepository, invoicingGateway, sunatRetryScheduler),
  new GetInvoicePdfUseCase(invoiceRepository, orderRepository),
);

export const adminOrderRoutes = Router();

adminOrderRoutes.use(authenticateJWT, requireRole("ADMIN"));

adminOrderRoutes.get("/", asyncHandler(adminOrderController.list));
adminOrderRoutes.get("/:id", asyncHandler(adminOrderController.getById));
adminOrderRoutes.patch("/:id/status", asyncHandler(adminOrderController.updateStatus));
adminOrderRoutes.post("/:id/confirm-payment", asyncHandler(adminOrderController.confirmPayment));
adminOrderRoutes.post("/:id/reject-payment", asyncHandler(adminOrderController.rejectPayment));
adminOrderRoutes.post("/:id/invoice", asyncHandler(adminOrderController.issueInvoice));
adminOrderRoutes.get("/:id/invoice/pdf", asyncHandler(adminOrderController.getInvoicePdf));
