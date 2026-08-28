import { Complaint, ComplaintType } from "../entities/Complaint";

export interface CreateComplaintData {
  type: ComplaintType;
  fullName: string;
  documentType: string;
  documentNumber: string;
  address: string;
  phone?: string;
  email: string;
  isMinor: boolean;
  guardianName?: string;
  goodType: string;
  goodDescription: string;
  claimedAmount?: number;
  detail: string;
  request: string;
}

export interface IComplaintRepository {
  create(data: CreateComplaintData): Promise<Complaint>;
  /** ADMIN-only. Ordered newest-first, capped — this is an operational inbox, not a reporting view. */
  findMany(): Promise<Complaint[]>;
  findById(id: string): Promise<Complaint | null>;
  /** ADMIN-only. Records the provider's response — see Complaint.providerResponse/respondedAt. */
  respond(id: string, providerResponse: string): Promise<Complaint>;
}
