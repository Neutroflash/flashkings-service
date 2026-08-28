import { Product } from "../entities/Product";
import { ProductVariant } from "../entities/ProductVariant";
import { ProductImage } from "../entities/ProductImage";

export interface ProductFilters {
  categorySlug?: string;
  isFeatured?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateProductVariantInput {
  sku: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  attributes?: Record<string, unknown>;
}

export interface CreateProductImageInput {
  url: string;
  altText?: string;
  isPrimary?: boolean;
}

export interface CreateProductData {
  name: string;
  slug: string;
  description?: string;
  brand: string;
  categoryId: string;
  isFeatured?: boolean;
  variants: CreateProductVariantInput[];
  images?: CreateProductImageInput[];
}

export interface UpdateProductVariantData {
  price?: number;
  costPrice?: number;
  stock?: number;
}

export interface AddProductImageInput {
  productId: string;
  url: string;
  altText?: string;
  isPrimary?: boolean;
}

export interface UpdateProductImageData {
  url?: string;
  altText?: string | null;
  isPrimary?: boolean;
}

export interface IProductRepository {
  findMany(filters: ProductFilters): Promise<PaginatedResult<Product>>;
  findBySlug(slug: string): Promise<Product | null>;
  findById(id: string): Promise<Product | null>;
  create(data: CreateProductData): Promise<Product>;
  /** ADMIN-only. reservedStock is intentionally not editable — it's system-managed by the order flow. */
  updateVariant(variantId: string, data: UpdateProductVariantData): Promise<ProductVariant>;
  findVariantById(variantId: string): Promise<ProductVariant | null>;
  /** ADMIN-only. Marking isPrimary:true atomically unsets any other primary image for the same product. */
  addImage(input: AddProductImageInput): Promise<ProductImage>;
  updateImage(imageId: string, data: UpdateProductImageData): Promise<ProductImage>;
  deleteImage(imageId: string): Promise<void>;
}
