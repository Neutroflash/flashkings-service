import { CategoryWithCount, ICategoryRepository } from "../../domain/repositories/ICategoryRepository";

/** ADMIN-only. Con el conteo de productos, para que el panel sepa cuáles se pueden borrar. */
export class ListCategoriesForAdminUseCase {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  execute(): Promise<CategoryWithCount[]> {
    return this.categoryRepository.findAllWithCounts();
  }
}
