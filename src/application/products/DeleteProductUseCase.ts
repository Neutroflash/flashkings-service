import { IProductRepository } from "../../domain/repositories/IProductRepository";
import { NotFoundError } from "../../shared/errors/AppError";

/**
 * ADMIN-only. Borra un producto que nunca se vendió. Si ya tiene ventas, el repositorio lanza
 * ConflictError y el camino correcto es desactivarlo (`PATCH /:productId` con `isActive: false`) —
 * ver el comentario de `isActive` en schema.prisma.
 */
export class DeleteProductUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(productId: string): Promise<void> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError("Producto no encontrado");
    }
    await this.productRepository.deleteProduct(productId);
  }
}
