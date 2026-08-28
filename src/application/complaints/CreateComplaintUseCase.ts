import { CreateComplaintData, IComplaintRepository } from "../../domain/repositories/IComplaintRepository";
import { Complaint } from "../../domain/entities/Complaint";
import { IEventBus } from "../../domain/services/IEventBus";

// Public — a consumer filing a Libro de Reclamaciones complaint has no account. Cross-field
// shape validation (e.g. isMinor requiring guardianName) happens in the controller's zod schema;
// this use case only handles the persist-then-notify flow.
export class CreateComplaintUseCase {
  constructor(
    private readonly complaintRepository: IComplaintRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(data: CreateComplaintData): Promise<Complaint> {
    const complaint = await this.complaintRepository.create(data);
    this.eventBus.publish({ type: "complaint.created", complaint });
    return complaint;
  }
}
