import { IComplaintRepository } from "../../domain/repositories/IComplaintRepository";
import { Complaint } from "../../domain/entities/Complaint";

export class RespondComplaintUseCase {
  constructor(private readonly complaintRepository: IComplaintRepository) {}

  execute(complaintId: string, providerResponse: string): Promise<Complaint> {
    return this.complaintRepository.respond(complaintId, providerResponse);
  }
}
