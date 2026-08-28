import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaUserRepository } from "../../infrastructure/database/PrismaUserRepository";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { RegisterUseCase } from "../../application/auth/RegisterUseCase";
import { LoginUseCase } from "../../application/auth/LoginUseCase";
import { RefreshTokenUseCase } from "../../application/auth/RefreshTokenUseCase";
import { UpdateProfileUseCase } from "../../application/auth/UpdateProfileUseCase";
import { GetCurrentUserUseCase } from "../../application/auth/GetCurrentUserUseCase";
import { AuthController } from "../controllers/AuthController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { authLimiter } from "../middlewares/rateLimiter";

const userRepository = new PrismaUserRepository(prisma);
const orderRepository = new PrismaOrderRepository(prisma);
const authController = new AuthController(
  new RegisterUseCase(userRepository, orderRepository),
  new LoginUseCase(userRepository),
  new RefreshTokenUseCase(userRepository),
  new UpdateProfileUseCase(userRepository),
  new GetCurrentUserUseCase(userRepository),
);

export const authRoutes = Router();

// authLimiter: brute-force protection, keyed by IP via Redis (shared across instances).
authRoutes.post("/register", authLimiter, asyncHandler(authController.register));
authRoutes.post("/login", authLimiter, asyncHandler(authController.login));
authRoutes.post("/refresh", authLimiter, asyncHandler(authController.refresh));
authRoutes.post("/logout", asyncHandler(authController.logout));
authRoutes.get("/me", authenticateJWT, asyncHandler(authController.me));
authRoutes.patch("/me", authenticateJWT, asyncHandler(authController.updateProfile));
