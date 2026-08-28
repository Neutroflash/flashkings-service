import { Request, Response } from "express";
import { z } from "zod";
import { CreateComplaintUseCase } from "../../application/complaints/CreateComplaintUseCase";

const createComplaintSchema = z
  .object({
    type: z.enum(["RECLAMO", "QUEJA"]),
    fullName: z.string().trim().min(2),
    documentType: z.enum(["DNI", "CE", "PASAPORTE", "OTRO"]),
    documentNumber: z.string().trim().min(4).max(20),
    address: z.string().trim().min(5),
    phone: z.string().trim().min(6).optional(),
    email: z.string().trim().email(),
    isMinor: z.boolean(),
    guardianName: z.string().trim().min(2).optional(),
    goodType: z.enum(["producto", "servicio"]),
    goodDescription: z.string().trim().min(3),
    claimedAmount: z.number().nonnegative().optional(),
    detail: z.string().trim().min(10),
    request: z.string().trim().min(5),
  })
  // Anexo I requires the legal representative's data when the consumer is a minor.
  .refine((data) => !data.isMinor || !!data.guardianName, {
    message: "guardianName es requerido cuando isMinor es true",
    path: ["guardianName"],
  });

export class ComplaintController {
  constructor(private readonly createComplaintUseCase: CreateComplaintUseCase) {}

  // Public: filing a Libro de Reclamaciones complaint requires no account.
  create = async (req: Request, res: Response): Promise<void> => {
    const input = createComplaintSchema.parse(req.body);
    const complaint = await this.createComplaintUseCase.execute(input);
    res.status(201).json({
      complaint: {
        id: complaint.id,
        correlativo: complaint.correlativo,
        type: complaint.type,
        createdAt: complaint.createdAt,
      },
    });
  };
}
