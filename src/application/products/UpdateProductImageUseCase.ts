import { IProductRepository, UpdateProductImageData } from "../../domain/repositories/IProductRepository";
import { ProductImage } from "../../domain/entities/ProductImage";

// ADMIN-only. Also used to promote an image to "primary" (isPrimary: true) — the repository
// atomically unsets any previous primary image for the same product.
export class UpdateProductImageUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  execute(imageId: string, data: UpdateProductImageData): Promise<ProductImage> {
    return this.productRepository.updateImage(imageId, data);
  }
}
