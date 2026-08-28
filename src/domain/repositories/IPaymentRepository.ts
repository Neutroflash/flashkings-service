import { Payment } from "../entities/Payment";

export interface CreatePaymentInput {
  orderId: string;
  provider: string;
  providerChargeId?: string | null;
  status: string;
  amount: number;
  rawResponse?: unknown;
}

export interface IPaymentRepository {
  create(input: CreatePaymentInput): Promise<Payment>;
  findByOrderId(orderId: string): Promise<Payment | null>;
}
