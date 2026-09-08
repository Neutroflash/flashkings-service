import { PrismaClient } from "@prisma/client";
import {
  CategoryWithCount,
  CreateCategoryData,
  ICategoryRepository,
  UpdateCategoryData,
} from "../../domain/repositories/ICategoryRepository";
import { Category } from "../../domain/entities/Category";
import { ConflictError } from "../../shared/errors/AppError";

export class PrismaCategoryRepository implements ICategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  async findAllWithCounts(): Promise<CategoryWithCount[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    return rows.map(({ _count, ...category }) => ({ ...category, productCount: _count.products }));
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug } });
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async create(data: CreateCategoryData): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  async update(id: string, data: UpdateCategoryData): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  async delete(id: string): Promise<void> {
    const productCount = await this.countProducts(id);
    if (productCount > 0) {
      throw new ConflictError(
        `Esta categoría tiene ${productCount} ${productCount === 1 ? "producto" : "productos"}: muévelos a otra categoría antes de borrarla.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }

  async countProducts(id: string): Promise<number> {
    return this.prisma.product.count({ where: { categoryId: id } });
  }
}
