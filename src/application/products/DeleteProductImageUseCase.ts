import { IProductRepository } from "../../domain/repositories/IProductRepository";

// ADMIN-only.
export class DeleteProductImageUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  execute(imageId: string): Promise<void> {
    return this.productRepository.deleteImage(imageId);
  }
}
