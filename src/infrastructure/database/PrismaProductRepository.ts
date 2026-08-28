import { Prisma, PrismaClient } from "@prisma/client";
import {
  CreateProductData,
  IProductRepository,
  PaginatedResult,
  ProductFilters,
  UpdateProductVariantData,
} from "../../domain/repositories/IProductRepository";
import { Product } from "../../domain/entities/Product";
import { ProductVariant } from "../../domain/entities/ProductVariant";
import { NotFoundError } from "../../shared/errors/AppError";

const DEFAULT_PAGE_SIZE = 20;

const productInclude = {
  category: true,
  images: true,
  variants: true,
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

// Prisma's Decimal fields need explicit conversion to number for the domain layer,
// which is transport-agnostic and shouldn't depend on Prisma's Decimal type.
function toDomain(product: ProductWithRelations): Product {
  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      price: variant.price.toNumber(),
      costPrice: variant.costPrice.toNumber(),
      attributes: variant.attributes as Record<string, unknown>,
    })),
  };
}

function toVariantDomain(variant: Prisma.ProductVariantGetPayload<Record<string, never>>): ProductVariant {
  return {
    ...variant,
    price: variant.price.toNumber(),
    costPrice: variant.costPrice.toNumber(),
    attributes: variant.attributes as Record<string, unknown>,
  };
}

export class PrismaProductRepository implements IProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findMany(filters: ProductFilters): Promise<PaginatedResult<Product>> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : DEFAULT_PAGE_SIZE;

    const where: Prisma.ProductWhereInput = {
      ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
      ...(filters.isFeatured !== undefined ? { isFeatured: filters.isFeatured } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { brand: { contains: filters.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map(toDomain),
      total,
      page,
      pageSize,
    };
  }

  async findBySlug(slug: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: productInclude,
    });
    return product ? toDomain(product) : null;
  }

  async findById(id: string): Promise<Product | null> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    return product ? toDomain(product) : null;
  }

  async create(data: CreateProductData): Promise<Product> {
    const product = await this.prisma.product.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        brand: data.brand,
        categoryId: data.categoryId,
        isFeatured: data.isFeatured ?? false,
        variants: {
          create: data.variants.map((variant) => ({
            sku: variant.sku,
            name: variant.name,
            price: variant.price,
            costPrice: variant.costPrice,
            stock: variant.stock,
            attributes: (variant.attributes ?? {}) as Prisma.InputJsonValue,
          })),
        },
        images: data.images?.length
          ? {
              create: data.images.map((image) => ({
                url: image.url,
                altText: image.altText,
                isPrimary: image.isPrimary ?? false,
              })),
            }
          : undefined,
      },
      include: productInclude,
    });
    return toDomain(product);
  }

  async updateVariant(variantId: string, data: UpdateProductVariantData): Promise<ProductVariant> {
    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...(data.price !== undefined ? { price: data.price } : {}),
          ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
          ...(data.stock !== undefined ? { stock: data.stock } : {}),
        },
      });
      return toVariantDomain(variant);
    } catch {
      throw new NotFoundError("Variante de producto no encontrada");
    }
  }

  async findVariantById(variantId: string): Promise<ProductVariant | null> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    return variant ? toVariantDomain(variant) : null;
  }
}
