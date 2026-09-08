import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaCategoryRepository } from "../../infrastructure/database/PrismaCategoryRepository";
import { CreateCategoryUseCase } from "../../application/categories/CreateCategoryUseCase";
import { UpdateCategoryUseCase } from "../../application/categories/UpdateCategoryUseCase";
import { DeleteCategoryUseCase } from "../../application/categories/DeleteCategoryUseCase";
import { ListCategoriesForAdminUseCase } from "../../application/categories/ListCategoriesForAdminUseCase";
import { CategoryController } from "../controllers/CategoryController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";
import { catalogLimiter } from "../middlewares/rateLimiter";

const categoryRepository = new PrismaCategoryRepository(prisma);
const categoryController = new CategoryController(
  categoryRepository,
  new CreateCategoryUseCase(categoryRepository),
  new UpdateCategoryUseCase(categoryRepository),
  new DeleteCategoryUseCase(categoryRepository),
  new ListCategoriesForAdminUseCase(categoryRepository),
);

export const categoryRoutes = Router();

categoryRoutes.get("/", catalogLimiter, asyncHandler(categoryController.list));
categoryRoutes.get("/admin", authenticateJWT, requireRole("ADMIN"), asyncHandler(categoryController.listForAdmin));
categoryRoutes.post("/", authenticateJWT, requireRole("ADMIN"), asyncHandler(categoryController.create));
categoryRoutes.patch("/:id", authenticateJWT, requireRole("ADMIN"), asyncHandler(categoryController.update));
categoryRoutes.delete("/:id", authenticateJWT, requireRole("ADMIN"), asyncHandler(categoryController.remove));
