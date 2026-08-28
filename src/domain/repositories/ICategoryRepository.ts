import { Category } from "../entities/Category";

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string;
}

export interface ICategoryRepository {
  findAll(): Promise<Category[]>;
  findBySlug(slug: string): Promise<Category | null>;
  findById(id: string): Promise<Category | null>;
  /** ADMIN-only. */
  create(data: CreateCategoryData): Promise<Category>;
}
