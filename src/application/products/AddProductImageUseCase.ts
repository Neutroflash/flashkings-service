import { AddProductImageInput, IProductRepository } from "../../domain/repositories/IProductRepository";
import { ProductImage } from "../../domain/entities/ProductImage";

// ADMIN-only, enforced by requireRole middleware before this use case is ever called.
export class AddProductImageUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  execute(input: AddProductImageInput): Promise<ProductImage> {
    return this.productRepository.addImage(input);
  }
}
