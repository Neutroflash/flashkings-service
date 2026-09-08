import { Request, Response } from "express";
import { z } from "zod";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { CreateCategoryUseCase } from "../../application/categories/CreateCategoryUseCase";
import { UpdateCategoryUseCase } from "../../application/categories/UpdateCategoryUseCase";
import { DeleteCategoryUseCase } from "../../application/categories/DeleteCategoryUseCase";
import { ListCategoriesForAdminUseCase } from "../../application/categories/ListCategoriesForAdminUseCase";

const createCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

// El slug no se acepta acá: es la URL pública del catálogo filtrado y puede estar indexada.
const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
});

export class CategoryController {
  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly deleteCategoryUseCase: DeleteCategoryUseCase,
    private readonly listCategoriesForAdminUseCase: ListCategoriesForAdminUseCase,
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.categoryRepository.findAll();
    res.status(200).json({ categories });
  };

  /** ADMIN-only. Con el conteo de productos, para saber cuáles se pueden borrar. */
  listForAdmin = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.listCategoriesForAdminUseCase.execute();
    res.status(200).json({ categories });
  };

  // ADMIN-only.
  create = async (req: Request, res: Response): Promise<void> => {
    const input = createCategorySchema.parse(req.body);
    const category = await this.createCategoryUseCase.execute(input);
    res.status(201).json({ category });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = updateCategorySchema.parse(req.body);
    const category = await this.updateCategoryUseCase.execute(req.params.id, input);
    res.status(200).json({ category });
  };

  /** Solo categorías vacías — con productos devuelve 409 pidiendo reasignarlos primero. */
  remove = async (req: Request, res: Response): Promise<void> => {
    await this.deleteCategoryUseCase.execute(req.params.id);
    res.status(204).send();
  };
}
