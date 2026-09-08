import { IProductRepository } from "../../domain/repositories/IProductRepository";
import { NotFoundError } from "../../shared/errors/AppError";

/** ADMIN-only. Misma regla que DeleteProductUseCase: solo si nunca se vendió; si no, desactivar. */
export class DeleteProductVariantUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(variantId: string): Promise<void> {
    const variant = await this.productRepository.findVariantById(variantId);
    if (!variant) {
      throw new NotFoundError("Variante no encontrada");
    }
    await this.productRepository.deleteVariant(variantId);
  }
}
