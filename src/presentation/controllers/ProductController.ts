import { Request, Response } from "express";
import { z } from "zod";
import { GetProductsUseCase } from "../../application/products/GetProductsUseCase";
import { GetProductBySlugUseCase } from "../../application/products/GetProductBySlugUseCase";
import { CreateProductUseCase } from "../../application/products/CreateProductUseCase";
import { UpdateProductVariantUseCase } from "../../application/products/UpdateProductVariantUseCase";

const listQuerySchema = z.object({
  category: z.string().optional(),
  featured: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

const variantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().positive(),
  costPrice: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  attributes: z.record(z.unknown()).optional(),
});

const imageSchema = z.object({
  url: z.string().url(),
  altText: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

const createProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  brand: z.string().min(1),
  categoryId: z.string().uuid(),
  isFeatured: z.boolean().optional(),
  variants: z.array(variantSchema).min(1),
  images: z.array(imageSchema).optional(),
});

const updateVariantSchema = z.object({
  price: z.number().positive().optional(),
  costPrice: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
});

export class ProductController {
  constructor(
    private readonly getProductsUseCase: GetProductsUseCase,
    private readonly getProductBySlugUseCase: GetProductBySlugUseCase,
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly updateProductVariantUseCase: UpdateProductVariantUseCase,
  ) {}

  // Public endpoint: req.user is populated only if a valid ADMIN/CLIENT session cookie
  // was present (see attachUserIfPresent). Anonymous visitors get the sanitized view.
  list = async (req: Request, res: Response): Promise<void> => {
    const query = listQuerySchema.parse(req.query);
    const result = await this.getProductsUseCase.execute(
      {
        categorySlug: query.category,
        isFeatured: query.featured,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
      },
      req.user?.role,
    );
    res.status(200).json(result);
  };

  getBySlug = async (req: Request, res: Response): Promise<void> => {
    const product = await this.getProductBySlugUseCase.execute(req.params.slug, req.user?.role);
    res.status(200).json({ product });
  };

  // Protected by authenticateJWT + requireRole('ADMIN') at the route level.
  create = async (req: Request, res: Response): Promise<void> => {
    const input = createProductSchema.parse(req.body);
    const product = await this.createProductUseCase.execute(input);
    res.status(201).json({ product });
  };

  // ADMIN-only. reservedStock is never accepted here — it's system-managed by the order flow.
  updateVariant = async (req: Request, res: Response): Promise<void> => {
    const input = updateVariantSchema.parse(req.body);
    const variant = await this.updateProductVariantUseCase.execute(req.params.id, input);
    res.status(200).json({ variant });
  };
}
