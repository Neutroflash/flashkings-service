import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { NotFoundError } from "../../shared/errors/AppError";

/** ADMIN-only. Solo categorías vacías: el repositorio bloquea el borrado si tiene productos. */
export class DeleteCategoryUseCase {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  async execute(id: string): Promise<void> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new NotFoundError("Categoría no encontrada");
    }
    await this.categoryRepository.delete(id);
  }
}
