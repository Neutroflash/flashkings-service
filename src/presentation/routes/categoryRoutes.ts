import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaCategoryRepository } from "../../infrastructure/database/PrismaCategoryRepository";
import { CreateCategoryUseCase } from "../../application/categories/CreateCategoryUseCase";
import { CategoryController } from "../controllers/CategoryController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";
import { catalogLimiter } from "../middlewares/rateLimiter";

const categoryRepository = new PrismaCategoryRepository(prisma);
const categoryController = new CategoryController(categoryRepository, new CreateCategoryUseCase(categoryRepository));

export const categoryRoutes = Router();

categoryRoutes.get("/", catalogLimiter, asyncHandler(categoryController.list));
categoryRoutes.post("/", authenticateJWT, requireRole("ADMIN"), asyncHandler(categoryController.create));
