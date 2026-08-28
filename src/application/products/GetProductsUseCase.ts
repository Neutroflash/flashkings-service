import { IProductRepository, ProductFilters } from "../../domain/repositories/IProductRepository";
import { PublicProduct, Product, toPublicProduct } from "../../domain/entities/Product";
import { Role } from "../../domain/entities/User";

export interface GetProductsResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export class GetProductsUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  /**
   * requesterRole is the caller's authenticated role (undefined for anonymous visitors).
   * Only ADMIN callers receive the raw entity with costPrice and exact stock counts;
   * everyone else gets the sanitized PublicProduct projection.
   */
  async execute(filters: ProductFilters, requesterRole?: Role): Promise<GetProductsResult<Product | PublicProduct>> {
    const result = await this.productRepository.findMany(filters);

    if (requesterRole === "ADMIN") {
      return result;
    }

    return {
      ...result,
      items: result.items.map(toPublicProduct),
    };
  }
}
