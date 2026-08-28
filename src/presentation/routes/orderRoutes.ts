import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { PrismaProductRepository } from "../../infrastructure/database/PrismaProductRepository";
import { stockHoldScheduler } from "../../infrastructure/queue/stockHoldScheduler";
import { ValidateCartUseCase } from "../../application/orders/ValidateCartUseCase";
import { CreateOrderUseCase } from "../../application/orders/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "../../application/orders/GetOrderByIdUseCase";
import { OrderController } from "../controllers/OrderController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { attachUserIfPresent } from "../middlewares/authenticateJWT";

const orderRepository = new PrismaOrderRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const orderController = new OrderController(
  new ValidateCartUseCase(productRepository),
  new CreateOrderUseCase(orderRepository, stockHoldScheduler),
  new GetOrderByIdUseCase(orderRepository),
);

export const orderRoutes = Router();

// All public: guest checkout is allowed (Order.userId is optional). attachUserIfPresent
// links the order to a logged-in user when a session cookie is present, without requiring one.
orderRoutes.post("/validate-cart", asyncHandler(orderController.validateCart));
orderRoutes.post("/", attachUserIfPresent, asyncHandler(orderController.create));
orderRoutes.get("/:id", attachUserIfPresent, asyncHandler(orderController.getById));
