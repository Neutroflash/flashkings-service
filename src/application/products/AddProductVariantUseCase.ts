import { CreateProductVariantInput, IProductRepository } from "../../domain/repositories/IProductRepository";
import { ProductVariant } from "../../domain/entities/ProductVariant";
import { NotFoundError } from "../../shared/errors/AppError";

/** ADMIN-only. Agrega una variante (un color, un switch) a un producto ya existente — hasta acá
 * solo se podían crear todas juntas al crear el producto. */
export class AddProductVariantUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(productId: string, data: CreateProductVariantInput): Promise<ProductVariant> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError("Producto no encontrado");
    }
    return this.productRepository.addVariant(productId, data);
  }
}
