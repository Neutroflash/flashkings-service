export type ComplaintType = "RECLAMO" | "QUEJA";

export interface Complaint {
  id: string;
  correlativo: number;
  type: ComplaintType;
  fullName: string;
  documentType: string;
  documentNumber: string;
  address: string;
  phone: string | null;
  email: string;
  isMinor: boolean;
  guardianName: string | null;
  goodType: string;
  goodDescription: string;
  claimedAmount: number | null;
  detail: string;
  request: string;
  providerResponse: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}
