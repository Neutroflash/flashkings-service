import { ICategoryRepository, UpdateCategoryData } from "../../domain/repositories/ICategoryRepository";
import { Category } from "../../domain/entities/Category";
import { NotFoundError } from "../../shared/errors/AppError";

/** ADMIN-only. El slug no es editable — ver el comentario en UpdateCategoryData. */
export class UpdateCategoryUseCase {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  async execute(id: string, data: UpdateCategoryData): Promise<Category> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError("Categoría no encontrada");
    }
    return this.categoryRepository.update(id, data);
  }
}
