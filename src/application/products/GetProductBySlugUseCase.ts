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

    return toPublicProduct(product);
  }
}
