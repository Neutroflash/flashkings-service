export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  providerChargeId: string | null;
  status: string;
  amount: number;
  rawResponse: unknown;
  createdAt: Date;
  updatedAt: Date;
}
