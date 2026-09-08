import { Product } from "../entities/Product";
import { ProductVariant } from "../entities/ProductVariant";
import { ProductImage } from "../entities/ProductImage";

export interface ProductFilters {
  categorySlug?: string;
  isFeatured?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  /**
   * true = solo productos activos (catálogo público, sitemap). undefined = todos, que es lo que
   * necesita el panel para poder reactivar lo que desactivó. Explícito y no un default silencioso:
   * quien consulta tiene que decidir de qué lado está.
   */
  onlyActive?: boolean;
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
  isActive?: boolean;
}

// slug is deliberately excluded: it's the product's public URL (/producto/[slug]) and may
// already be indexed by search engines or shared/bookmarked — renaming the product must not
// break it. If a real rename-with-redirect need comes up later, that's a distinct feature
// (old-slug -> new-slug redirect table), not a plain field edit.
export interface UpdateProductData {
  name?: string;
  description?: string;
  brand?: string;
  categoryId?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}

export interface AddProductImageInput {
  productId: string;
  /** Omit/null = shared image (fallback for any variant with none of its own). */
  productVariantId?: string | null;
  url: string;
  altText?: string;
  isPrimary?: boolean;
}

export interface UpdateProductImageData {
  url?: string;
  altText?: string | null;
  isPrimary?: boolean;
  productVariantId?: string | null;
}

export interface IProductRepository {
  findMany(filters: ProductFilters): Promise<PaginatedResult<Product>>;
  findBySlug(slug: string): Promise<Product | null>;
  findById(id: string): Promise<Product | null>;
  create(data: CreateProductData): Promise<Product>;
  /** ADMIN-only. slug is never editable here — see UpdateProductData. */
  updateProduct(productId: string, data: UpdateProductData): Promise<Product>;
  /**
   * Borra un producto de verdad. Solo es posible si nunca se vendió: en cuanto existe un OrderItem
   * que lo referencia, borrarlo destruiría la trazabilidad de una orden y del comprobante SUNAT ya
   * emitido. En ese caso lanza ConflictError y el camino correcto es desactivarlo.
   */
  deleteProduct(productId: string): Promise<void>;
  /** Cuántas unidades vendidas referencian a este producto — 0 significa que se puede borrar. */
  countProductSales(productId: string): Promise<number>;
  addVariant(productId: string, data: CreateProductVariantInput): Promise<ProductVariant>;
  /** Misma regla que deleteProduct, un nivel más abajo. */
  deleteVariant(variantId: string): Promise<void>;
  countVariantSales(variantId: string): Promise<number>;
  /** ADMIN-only. reservedStock is intentionally not editable — it's system-managed by the order flow. */
  updateVariant(variantId: string, data: UpdateProductVariantData): Promise<ProductVariant>;
  findVariantById(variantId: string): Promise<ProductVariant | null>;
  /** `stock - reservedStock <= threshold` — para el aviso diario de stock bajo. */
  findVariantsBelowThreshold(threshold: number): Promise<ProductVariant[]>;
  /** ADMIN-only. Marking isPrimary:true atomically unsets any other primary image within the
   * same (productId, productVariantId) scope. */
  addImage(input: AddProductImageInput): Promise<ProductImage>;
  updateImage(imageId: string, data: UpdateProductImageData): Promise<ProductImage>;
  deleteImage(imageId: string): Promise<void>;
}
