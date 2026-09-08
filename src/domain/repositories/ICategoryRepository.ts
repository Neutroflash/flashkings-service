import { Category } from "../entities/Category";

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
}

/** El slug queda fuera a propósito, igual que en UpdateProductData: es la URL pública del
 * catálogo filtrado (/catalogo?category=slug) y puede estar indexada o compartida. */
export interface UpdateCategoryData {
  name?: string;
  description?: string | null;
}

export interface CategoryWithCount extends Category {
  productCount: number;
}

export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  /** Para el panel: saber cuántos productos cuelgan de cada categoría antes de intentar borrarla. */
  findAllWithCounts(): Promise<CategoryWithCount[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  /** ADMIN-only. */
  create(data: CreateCategoryData): Promise<Category>;
  update(id: string, data: UpdateCategoryData): Promise<Category>;
  /**
   * Borra una categoría vacía. Si tiene productos lanza ConflictError: `Product.categoryId` es
   * obligatorio, así que no hay ningún destino al que mandarlos — el admin tiene que reasignarlos
   * primero. Reasignarlos automáticamente a una categoría "sin clasificar" sería inventar una
   * decisión de catálogo que le corresponde a él.
   */
  delete(id: string): Promise<void>;
  countProducts(id: string): Promise<number>;
}
