export interface ProductImage {
  id: string;
  productId: string;
  /** null = shared image (fallback for any variant with none of its own). */
  productVariantId: string | null;
  url: string;
  altText: string | null;
  isPrimary: boolean;
}
