import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { Category } from "../../domain/entities/Category";
import { ConflictError } from "../../shared/errors/AppError";
import { slugify } from "../../shared/slugify";

export interface CreateCategoryInput {
  name: string;
  description?: string;
}

// ADMIN-only, enforced by requireRole middleware before this use case is ever called.
export class CreateCategoryUseCase {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    const slug = slugify(input.name);
    const existing = await this.categoryRepository.findBySlug(slug);
    if (existing) {
      throw new ConflictError("Ya existe una categoría con un nombre/slug equivalente");
    }

    return this.categoryRepository.create({ name: input.name, slug, description: input.description });
  }
}
