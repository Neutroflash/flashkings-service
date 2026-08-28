import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { ListOrdersUseCase } from "../../application/orders/ListOrdersUseCase";
import { UpdateOrderStatusUseCase } from "../../application/orders/UpdateOrderStatusUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { eventBus } from "../../infrastructure/events/NodeEventBus";
import { AdminOrderController } from "../controllers/AdminOrderController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";

const orderRepository = new PrismaOrderRepository(prisma);
const adminOrderController = new AdminOrderController(
  new ListOrdersUseCase(orderRepository),
  new UpdateOrderStatusUseCase(orderRepository, eventBus),
  new GetOrderByIdUseCase(orderRepository),
);

export const adminOrderRoutes = Router();

adminOrderRoutes.use(authenticateJWT, requireRole("ADMIN"));

adminOrderRoutes.get("/", asyncHandler(adminOrderController.list));
adminOrderRoutes.get("/:id", asyncHandler(adminOrderController.getById));
adminOrderRoutes.patch("/:id/status", asyncHandler(adminOrderController.updateStatus));
