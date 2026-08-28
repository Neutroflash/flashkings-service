import { IProductRepository, UpdateProductData } from "../../domain/repositories/IProductRepository";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { Product } from "../../domain/entities/Product";
import { NotFoundError } from "../../shared/errors/AppError";

// ADMIN-only, enforced by requireRole middleware before this use case is ever called.
// slug (and each variant's SKU, via UpdateProductVariantUseCase) stay immutable by design —
// see the comment on UpdateProductData.
export class UpdateProductUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly categoryRepository: ICategoryRepository,
  ) {}

  async execute(productId: string, data: UpdateProductData): Promise<Product> {
    if (data.categoryId !== undefined) {
      const category = await this.categoryRepository.findById(data.categoryId);
      if (!category) {
        throw new NotFoundError("La categoría especificada no existe");
      }
    }

    return this.productRepository.updateProduct(productId, data);
  }
}
