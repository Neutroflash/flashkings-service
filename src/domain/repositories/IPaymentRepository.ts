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
  /** Order<->Payment is 1:1 (Payment.orderId is unique) — replaces any existing row for the
   * order, so a customer can resubmit (e.g. fixing a mistyped Yape/Plin operation number). */
  upsert(input: CreatePaymentInput): Promise<Payment>;
  updateStatus(orderId: string, status: string): Promise<Payment | null>;
  findByOrderId(orderId: string): Promise<Payment | null>;
}
