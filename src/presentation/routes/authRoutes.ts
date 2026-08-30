import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaUserRepository } from "../../infrastructure/database/PrismaUserRepository";
import { PrismaOrderRepository } from "../../infrastructure/database/PrismaOrderRepository";
import { RegisterUseCase } from "../../application/auth/RegisterUseCase";
import { LoginUseCase } from "../../application/auth/LoginUseCase";
import { RefreshTokenUseCase } from "../../application/auth/RefreshTokenUseCase";
import { UpdateProfileUseCase } from "../../application/auth/UpdateProfileUseCase";
import { GetCurrentUserUseCase } from "../../application/auth/GetCurrentUserUseCase";
import { ForgotPasswordUseCase } from "../../application/auth/ForgotPasswordUseCase";
import { ResetPasswordUseCase } from "../../application/auth/ResetPasswordUseCase";
import { VerifyEmailUseCase } from "../../application/auth/VerifyEmailUseCase";
import { ResendVerificationUseCase } from "../../application/auth/ResendVerificationUseCase";
import { emailService } from "../../infrastructure/email/emailService";
import { AuthController } from "../controllers/AuthController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { authLimiter } from "../middlewares/rateLimiter";

const userRepository = new PrismaUserRepository(prisma);
const orderRepository = new PrismaOrderRepository(prisma);
const authController = new AuthController(
  new RegisterUseCase(userRepository, orderRepository, emailService),
  new LoginUseCase(userRepository),
  new RefreshTokenUseCase(userRepository),
  new UpdateProfileUseCase(userRepository),
  new GetCurrentUserUseCase(userRepository),
  new ForgotPasswordUseCase(userRepository, emailService),
  new ResetPasswordUseCase(userRepository),
  new VerifyEmailUseCase(userRepository),
  new ResendVerificationUseCase(userRepository, emailService),
);

export const authRoutes = Router();

// authLimiter: brute-force protection, keyed by IP via Redis (shared across instances). Se aplica
// también a forgot/reset/verify — mismo perfil de riesgo (adivinar tokens/enumerar correos) que
// login/register.
authRoutes.post("/register", authLimiter, asyncHandler(authController.register));
authRoutes.post("/login", authLimiter, asyncHandler(authController.login));
authRoutes.post("/refresh", authLimiter, asyncHandler(authController.refresh));
authRoutes.post("/logout", asyncHandler(authController.logout));
authRoutes.get("/me", authenticateJWT, asyncHandler(authController.me));
authRoutes.patch("/me", authenticateJWT, asyncHandler(authController.updateProfile));
authRoutes.post("/forgot-password", authLimiter, asyncHandler(authController.forgotPassword));
authRoutes.post("/reset-password", authLimiter, asyncHandler(authController.resetPassword));
authRoutes.post("/verify-email", authLimiter, asyncHandler(authController.verifyEmail));
authRoutes.post("/resend-verification", authenticateJWT, authLimiter, asyncHandler(authController.resendVerification));
