export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number; // ADMIN-only, must never leave the domain/application layer toward a CLIENT-facing response
  stock: number;
  reservedStock: number; // units held by PENDING_PAYMENT orders; available = stock - reservedStock
  attributes: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape returned to CLIENT / anonymous consumers: no costPrice, no exact stock count. */
export interface PublicProductVariant {
  id: string;
  sku: string;
  name: string;
  price: number;
  inStock: boolean;
  attributes: Record<string, unknown>;
}

export function toPublicVariant(variant: ProductVariant): PublicProductVariant {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name,
    price: variant.price,
    inStock: variant.stock - variant.reservedStock > 0,
    attributes: variant.attributes,
  };
}
