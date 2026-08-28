import { Router, raw } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { PrismaPaymentRepository } from "../../infrastructure/database/PrismaPaymentRepository";
import { paymentGateway } from "../../infrastructure/payments/paymentGateway";
import { stockHoldScheduler } from "../../infrastructure/queue/stockHoldScheduler";
import { eventBus } from "../../infrastructure/events/NodeEventBus";
import { ProcessPaymentUseCase } from "../../application/payments/ProcessPaymentUseCase";
import { HandleCulqiWebhookUseCase } from "../../application/payments/HandleCulqiWebhookUseCase";
import { SubmitManualPaymentUseCase } from "../../application/payments/SubmitManualPaymentUseCase";
import { PaymentController } from "../controllers/PaymentController";
import { asyncHandler } from "../middlewares/asyncHandler";

const orderRepository = new PrismaOrderRepository(prisma);
const paymentRepository = new PrismaPaymentRepository(prisma);
const paymentController = new PaymentController(
  new ProcessPaymentUseCase(orderRepository, paymentRepository, paymentGateway, stockHoldScheduler, eventBus),
  new HandleCulqiWebhookUseCase(orderRepository, paymentGateway, stockHoldScheduler, eventBus),
  new SubmitManualPaymentUseCase(orderRepository, paymentRepository, stockHoldScheduler),
);

export const paymentRoutes = Router();

// Public: guest checkout has no session to authenticate against.
paymentRoutes.post("/charge", asyncHandler(paymentController.charge));

// Public: manual Yape/Plin — customer self-reports the operation number, stays PENDING_PAYMENT
// until an ADMIN confirms it (see adminOrderRoutes.ts).
paymentRoutes.post("/manual", asyncHandler(paymentController.submitManual));

// Public, no cookie auth — the body is untrusted input, re-verified against Culqi directly
// (see HandleCulqiWebhookUseCase). express.raw() here (not the global express.json() from
// app.ts, which explicitly skips this path) is what makes req.body a Buffer for that use case.
paymentRoutes.post("/webhook", raw({ type: "*/*" }), asyncHandler(paymentController.webhook));
