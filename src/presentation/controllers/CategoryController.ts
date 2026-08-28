import { Request, Response } from "express";
import { z } from "zod";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";
import { CreateCategoryUseCase } from "../../application/categories/CreateCategoryUseCase";

const createCategorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
});

export class CategoryController {
  constructor(
    private readonly categoryRepository: ICategoryRepository,
    private readonly createCategoryUseCase: CreateCategoryUseCase,
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.categoryRepository.findAll();
    res.status(200).json({ categories });
  };

  // ADMIN-only.
  create = async (req: Request, res: Response): Promise<void> => {
    const input = createCategorySchema.parse(req.body);
    const category = await this.createCategoryUseCase.execute(input);
    res.status(201).json({ category });
  };
}
