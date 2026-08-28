import { Request, Response } from "express";
import { ICategoryRepository } from "../../domain/repositories/ICategoryRepository";

export class CategoryController {
  constructor(private readonly categoryRepository: ICategoryRepository) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.categoryRepository.findAll();
    res.status(200).json({ categories });
  };
}
