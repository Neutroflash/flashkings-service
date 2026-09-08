import { Prisma, PrismaClient } from "@prisma/client";
import {
  CreateRefundInput,
  IRefundRepository,
  RefundOutcome,
} from "../../domain/repositories/IRefundRepository";
import { Refund, RefundStatus } from "../../domain/entities/Refund";
import { Order, round2 } from "../../domain/entities/Order";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";
import { toDomainOrder, orderInclude } from "./orderMapper";

const refundInclude = { items: true } satisfies Prisma.RefundInclude;
type RefundWithRelations = Prisma.RefundGetPayload<{ include: typeof refundInclude }>;

export function toDomainRefund(refund: RefundWithRelations): Refund {
  return {
    id: refund.id,
    orderId: refund.orderId,
    paymentId: refund.paymentId,
    amount: refund.amount.toNumber(),
    isFull: refund.isFull,
    status: refund.status as RefundStatus,
    reasonCode: refund.reasonCode,
    reasonText: refund.reasonText,
    isManual: refund.isManual,
    providerRefundId: refund.providerRefundId,
    rawResponse: refund.rawResponse,
    restocked: refund.restocked,
    includesShipping: refund.includesShipping,
    createdById: refund.createdById,
    createdAt: refund.createdAt,
    items: refund.items.map((i) => ({
      id: i.id,
      refundId: i.refundId,
      orderItemId: i.orderItemId,
      quantity: i.quantity,
    })),
  };
}

interface LockedOrderRow {
  id: string;
  status: string;
  total_amount: unknown;
}

export class PrismaRefundRepository implements IRefundRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateRefundInput): Promise<RefundOutcome> {
    const refundId = await this.prisma.$transaction(async (tx) => {
      // Lock the order first: everything below (how much is left to refund, which units are still
      // returnable, whether it flips to REFUNDED) is read-then-write on this order, so two
      // concurrent refunds must serialize here or they can each pass a check the other invalidates.
      const orderRows = await tx.$queryRaw<LockedOrderRow[]>`
        SELECT id, status::text, total_amount
        FROM orders
        WHERE id = ${input.orderId}
        FOR UPDATE
      `;
      const orderRow = orderRows[0];
      if (!orderRow) {
        throw new NotFoundError("Orden no encontrada");
      }

      const alreadyRefunded = await tx.refund.aggregate({
        where: { orderId: input.orderId, status: { not: "FAILED" } },
        _sum: { amount: true },
      });
      const refundedSoFar = alreadyRefunded._sum.amount?.toNumber() ?? 0;
      const orderTotal = Number(orderRow.total_amount);
      const remaining = round2(orderTotal - refundedSoFar);

      if (input.amount <= 0) {
        throw new ConflictError("El monto a reembolsar debe ser mayor a cero");
      }
      if (round2(input.amount) > remaining) {
        throw new ConflictError(
          `No se puede reembolsar S/ ${input.amount.toFixed(2)}: quedan S/ ${remaining.toFixed(2)} por devolver de esta orden`,
        );
      }

      // Per-line quantities, same read-then-write hazard as the amount above.
      for (const item of input.items) {
        const orderItem = await tx.orderItem.findUnique({ where: { id: item.orderItemId } });
        if (!orderItem || orderItem.orderId !== input.orderId) {
          throw new NotFoundError(`Ítem ${item.orderItemId} no pertenece a esta orden`);
        }
        const stillRefundable = orderItem.quantity - orderItem.refundedQuantity;
        if (item.quantity <= 0 || item.quantity > stillRefundable) {
          throw new ConflictError(
            `No se pueden devolver ${item.quantity} unidades del ítem ${item.orderItemId}: quedan ${stillRefundable}`,
          );
        }
      }

      const refund = await tx.refund.create({
        data: {
          orderId: input.orderId,
          paymentId: input.paymentId,
          amount: input.amount,
          isFull: input.isFull,
          status: "PENDING",
          reasonCode: input.reasonCode,
          reasonText: input.reasonText,
          isManual: input.isManual,
          restocked: input.restock,
          includesShipping: input.includesShipping,
          createdById: input.createdById,
          items: { create: input.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
        },
      });

      for (const item of input.items) {
        await tx.orderItem.update({
          where: { id: item.orderItemId },
          data: { refundedQuantity: { increment: item.quantity } },
        });

        if (input.restock) {
          const orderItem = await tx.orderItem.findUniqueOrThrow({ where: { id: item.orderItemId } });
          await tx.productVariant.update({
            where: { id: orderItem.productVariantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      // A full refund with no item breakdown still has to return every unit to stock — otherwise
      // "devolver toda la orden" would silently behave differently from "devolver todos los ítems".
      if (input.isFull && input.items.length === 0 && input.restock) {
        const orderItems = await tx.orderItem.findMany({ where: { orderId: input.orderId } });
        for (const orderItem of orderItems) {
          const pending = orderItem.quantity - orderItem.refundedQuantity;
          if (pending <= 0) continue;
          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { refundedQuantity: { increment: pending } },
          });
          await tx.productVariant.update({
            where: { id: orderItem.productVariantId },
            data: { stock: { increment: pending } },
          });
        }
      }

      if (input.isFull) {
        await tx.order.update({
          where: { id: input.orderId },
          data: { status: "REFUNDED", refundedAt: new Date() },
        });
      }

      return refund.id;
    });

    const refund = await this.findById(refundId);
    const order = await this.findOrder(input.orderId);
    if (!refund || !order) {
      throw new NotFoundError("No se pudo registrar el reembolso");
    }
    return { refund, order };
  }

  async markResult(
    refundId: string,
    data: { status: "COMPLETED" | "FAILED"; providerRefundId: string | null; rawResponse: unknown },
  ): Promise<Refund | null> {
    const existing = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!existing) return null;

    const refund = await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: data.status,
        providerRefundId: data.providerRefundId,
        rawResponse: data.rawResponse as Prisma.InputJsonValue,
      },
      include: refundInclude,
    });
    return toDomainRefund(refund);
  }

  async findById(id: string): Promise<Refund | null> {
    const refund = await this.prisma.refund.findUnique({ where: { id }, include: refundInclude });
    return refund ? toDomainRefund(refund) : null;
  }

  async findByOrderId(orderId: string): Promise<Refund[]> {
    const refunds = await this.prisma.refund.findMany({
      where: { orderId },
      include: refundInclude,
      orderBy: { createdAt: "desc" },
    });
    return refunds.map(toDomainRefund);
  }

  private async findOrder(orderId: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
    return order ? toDomainOrder(order) : null;
  }
}
