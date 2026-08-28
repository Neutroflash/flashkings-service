import { Prisma, PrismaClient } from "@prisma/client";
import { CreatePaymentInput, IPaymentRepository } from "../../domain/repositories/IPaymentRepository";
import { Payment } from "../../domain/entities/Payment";

function toDomain(payment: Prisma.PaymentGetPayload<Record<string, never>>): Payment {
  return { ...payment, amount: payment.amount.toNumber() };
}

export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreatePaymentInput): Promise<Payment> {
    const payment = await this.prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        providerChargeId: input.providerChargeId ?? null,
        status: input.status,
        amount: input.amount,
        ...(input.rawResponse !== undefined ? { rawResponse: input.rawResponse as Prisma.InputJsonValue } : {}),
      },
    });
    return toDomain(payment);
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } });
    return payment ? toDomain(payment) : null;
  }
}
