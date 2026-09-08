import { IProductRepository } from "../../domain/repositories/IProductRepository";
import { PublicProduct, Product, toPublicProduct } from "../../domain/entities/Product";
import { Role } from "../../domain/entities/User";
import { NotFoundError } from "../../shared/errors/AppError";

export class GetProductBySlugUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(slug: string, requesterRole?: Role): Promise<Product | PublicProduct> {
    const product = await this.productRepository.findBySlug(slug);
    if (!product) {
      throw new NotFoundError("Producto no encontrado");
    }

    if (requesterRole === "ADMIN") {
      return product;
    }

    // Para el público, un producto desactivado no existe: 404, no una página vacía. Así el
    // enlace deja de ser indexable y el cliente no ve una ficha sin nada que comprar.
    if (!product.isActive) {
      throw new NotFoundError("Producto no encontrado");
    }

    return toPublicProduct(product);
  }
}
