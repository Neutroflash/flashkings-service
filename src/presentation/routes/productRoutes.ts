import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaProductRepository } from "../../infrastructure/database/PrismaProductRepository";
import { PrismaCategoryRepository } from "../../infrastructure/database/PrismaCategoryRepository";
import { GetProductsUseCase } from "../../application/products/GetProductsUseCase";
import { GetProductBySlugUseCase } from "../../application/products/GetProductBySlugUseCase";
import { CreateProductUseCase } from "../../application/products/CreateProductUseCase";
import { UpdateProductUseCase } from "../../application/products/UpdateProductUseCase";
import { UpdateProductVariantUseCase } from "../../application/products/UpdateProductVariantUseCase";
import { AddProductImageUseCase } from "../../application/products/AddProductImageUseCase";
import { UpdateProductImageUseCase } from "../../application/products/UpdateProductImageUseCase";
import { DeleteProductImageUseCase } from "../../application/products/DeleteProductImageUseCase";
import { ProductController } from "../controllers/ProductController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { attachUserIfPresent, authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";
import { catalogLimiter } from "../middlewares/rateLimiter";

const productRepository = new PrismaProductRepository(prisma);
const categoryRepository = new PrismaCategoryRepository(prisma);
const productController = new ProductController(
  new GetProductsUseCase(productRepository),
  new GetProductBySlugUseCase(productRepository),
  new CreateProductUseCase(productRepository, categoryRepository),
  new UpdateProductUseCase(productRepository, categoryRepository),
  new UpdateProductVariantUseCase(productRepository),
  new AddProductImageUseCase(productRepository),
  new UpdateProductImageUseCase(productRepository),
  new DeleteProductImageUseCase(productRepository),
);

export const productRoutes = Router();

// Public routes: attachUserIfPresent lets the use case sanitize the response
// unless the caller is an authenticated ADMIN.
productRoutes.get("/", catalogLimiter, attachUserIfPresent, asyncHandler(productController.list));
productRoutes.get("/:slug", catalogLimiter, attachUserIfPresent, asyncHandler(productController.getBySlug));

// ADMIN-only
productRoutes.post("/", authenticateJWT, requireRole("ADMIN"), asyncHandler(productController.create));
productRoutes.patch(
  "/:productId",
  authenticateJWT,
  requireRole("ADMIN"),
  asyncHandler(productController.updateProduct),
);
productRoutes.patch(
  "/variants/:id",
  authenticateJWT,
  requireRole("ADMIN"),
  asyncHandler(productController.updateVariant),
);
productRoutes.post(
  "/:productId/images",
  authenticateJWT,
  requireRole("ADMIN"),
  asyncHandler(productController.addImage),
);
productRoutes.patch(
  "/images/:imageId",
  authenticateJWT,
  requireRole("ADMIN"),
  asyncHandler(productController.updateImage),
);
productRoutes.delete(
  "/images/:imageId",
  authenticateJWT,
  requireRole("ADMIN"),
  asyncHandler(productController.deleteImage),
);
