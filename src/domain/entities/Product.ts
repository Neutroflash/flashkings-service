import { Category } from "./Category";
import { ProductImage } from "./ProductImage";
import { PublicProductVariant, ProductVariant, toPublicVariant } from "./ProductVariant";

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string;
  categoryId: string;
  isFeatured: boolean;
  /** Baja lógica — ver el comentario en schema.prisma. */
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
  variants?: ProductVariant[];
  images?: ProductImage[];
}

/** Shape returned to CLIENT / anonymous consumers: variants are sanitized, no costPrice. */
export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string;
  isFeatured: boolean;
  category?: Category;
  images?: ProductImage[];
  variants: PublicProductVariant[];
  inStock: boolean;
}

/**
 * Boundary mapper: strips costPrice and exact stock counts for CLIENT / anonymous
 * consumers. Only ADMIN-authenticated requests should ever see the raw Product entity.
 */
export function toPublicProduct(product: Product): PublicProduct {
  // Las variantes inactivas se filtran ACÁ, en la frontera del dominio, y no en cada consulta:
  // una variante descontinuada no debe aparecer en el selector del producto ni contar para
  // `inStock` — mismo criterio que costPrice, que se quita en este mismo punto.
  const variants = (product.variants ?? []).filter((v) => v.isActive).map(toPublicVariant);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    brand: product.brand,
    isFeatured: product.isFeatured,
    category: product.category,
    images: product.images,
    variants,
    inStock: variants.some((v) => v.inStock),
  };
}
