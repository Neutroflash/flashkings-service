import { CreateProductData, IProductRepository } from "../../domain/repositories/IProductRepository";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { Product } from "../../domain/entities/Product";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export type CreateProductInput = Omit<CreateProductData, "slug">;

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// This use case is ADMIN-only; enforcement happens in requireRole middleware
// before the controller ever calls execute().
export class CreateProductUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(input: CreateProductInput): Promise<Product> {
    const category = await this.categoryRepository.findById(input.categoryId);
    if (!category) {
      throw new NotFoundError("La categoría especificada no existe");
    }

    if (!input.variants.length) {
      throw new ConflictError("El producto debe tener al menos una variante");
    }

    const slug = slugify(input.name);
    const existing = await this.productRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictError("Ya existe un producto con un nombre/slug equivalente");
    }

    return this.productRepository.create({ ...input, slug });
  }
}
