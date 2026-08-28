import { Prisma, PrismaClient } from "@prisma/client";
import { CreateComplaintData, IComplaintRepository } from "../../domain/repositories/IComplaintRepository";
import { Complaint } from "../../domain/entities/Complaint";
import { NotFoundError } from "../../shared/errors/AppError";

const LIST_CAP = 200;

function toDomain(complaint: Prisma.ComplaintGetPayload<Record<string, never>>): Complaint {
  return {
    ...complaint,
    claimedAmount: complaint.claimedAmount ? complaint.claimedAmount.toNumber() : null,
  };
}

export class PrismaComplaintRepository implements IComplaintRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateComplaintData): Promise<Complaint> {
    const complaint = await this.prisma.complaint.create({
      data: {
        type: data.type,
        fullName: data.fullName,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        address: data.address,
        phone: data.phone,
        email: data.email,
        isMinor: data.isMinor,
        guardianName: data.guardianName,
        goodType: data.goodType,
        goodDescription: data.goodDescription,
        claimedAmount: data.claimedAmount,
        detail: data.detail,
        request: data.request,
      },
    });
    return toDomain(complaint);
  }

  async findMany(): Promise<Complaint[]> {
    const rows = await this.prisma.complaint.findMany({
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
    });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Complaint | null> {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    return complaint ? toDomain(complaint) : null;
  }

  async respond(id: string, providerResponse: string): Promise<Complaint> {
    try {
      const complaint = await this.prisma.complaint.update({
        where: { id },
        data: { providerResponse, respondedAt: new Date() },
      });
      return toDomain(complaint);
    } catch {
      throw new NotFoundError("Reclamo no encontrado");
    }
  }
}
