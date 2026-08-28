import { IProductRepository, UpdateProductVariantData } from "../../domain/repositories/IProductRepository";
import { ProductVariant } from "../../domain/entities/ProductVariant";

// ADMIN-only, enforced by requireRole middleware before this use case is ever called.
export class UpdateProductVariantUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  execute(variantId: string, data: UpdateProductVariantData): Promise<ProductVariant> {
    return this.productRepository.updateVariant(variantId, data);
  }
}
