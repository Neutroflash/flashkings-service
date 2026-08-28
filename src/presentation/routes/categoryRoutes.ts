import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaCategoryRepository } from "../../infrastructure/database/PrismaCategoryRepository";
import { CategoryController } from "../controllers/CategoryController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { catalogLimiter } from "../middlewares/rateLimiter";

const categoryController = new CategoryController(new PrismaCategoryRepository(prisma));

export const categoryRoutes = Router();

categoryRoutes.get("/", catalogLimiter, asyncHandler(categoryController.list));
