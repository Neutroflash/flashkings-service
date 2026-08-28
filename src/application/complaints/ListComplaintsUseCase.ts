import { IComplaintRepository } from "../../domain/repositories/IComplaintRepository";
import { Complaint } from "../../domain/entities/Complaint";

export class ListComplaintsUseCase {
  constructor(private readonly complaintRepository: IComplaintRepository) {}

  execute(): Promise<Complaint[]> {
    return this.complaintRepository.findMany();
  }
}
