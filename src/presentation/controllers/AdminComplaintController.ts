import { Request, Response } from "express";
import { z } from "zod";
import { ListComplaintsUseCase } from "../../application/complaints/ListComplaintsUseCase";
import { RespondComplaintUseCase } from "../../application/complaints/RespondComplaintUseCase";

const respondSchema = z.object({
  providerResponse: z.string().trim().min(3),
});

export class AdminComplaintController {
  constructor(
    private readonly listComplaintsUseCase: ListComplaintsUseCase,
    private readonly respondComplaintUseCase: RespondComplaintUseCase,
  ) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const complaints = await this.listComplaintsUseCase.execute();
    res.status(200).json({ complaints });
  };

  respond = async (req: Request, res: Response): Promise<void> => {
    const { providerResponse } = respondSchema.parse(req.body);
    const complaint = await this.respondComplaintUseCase.execute(req.params.id, providerResponse);
    res.status(200).json({ complaint });
  };
}
