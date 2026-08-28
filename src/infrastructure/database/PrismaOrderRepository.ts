import { Prisma, PrismaClient } from "@prisma/client";
import {
  CreateOrderInput,
  IOrderRepository,
  OrderFilters,
  PaginatedOrders,
} from "../../domain/repositories/IOrderRepository";
import { ALLOWED_MANUAL_TRANSITIONS, CancelReason, Order, OrderStatus } from "../../domain/entities/Order";
import { ConflictError, InsufficientStockError, NotFoundError } from "../../shared/errors/AppError";

const orderInclude = {
  items: { include: { productVariant: true } },
  payment: true,
  invoice: true,
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function toDomain(order: OrderWithRelations): Order {
  return {
    id: order.id,
    userId: order.userId,
    status: order.status as OrderStatus,
    totalAmount: order.totalAmount.toNumber(),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    cancelReason: order.cancelReason as CancelReason | null,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    payment: order.payment ? { ...order.payment, amount: order.payment.amount.toNumber() } : null,
    invoice: order.invoice,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      price: item.price.toNumber(),
      productVariant: {
        ...item.productVariant,
        price: item.productVariant.price.toNumber(),
        costPrice: item.productVariant.costPrice.toNumber(),
        attributes: item.productVariant.attributes as Record<string, unknown>,
      },
    })),
  };
}

// Reverse-derived from ALLOWED_MANUAL_TRANSITIONS: each manual target status has exactly
// one valid prior status, which lets updateStatus() be a single atomic conditional UPDATE.
const REQUIRED_PRIOR_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {};
for (const [prior, nexts] of Object.entries(ALLOWED_MANUAL_TRANSITIONS) as [OrderStatus, OrderStatus[]][]) {
  for (const next of nexts) {
    REQUIRED_PRIOR_STATUS[next] = prior;
  }
}

interface LockedVariantRow {
  id: string;
  stock: number;
  reserved_stock: number;
  price: unknown;
}

export class PrismaOrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createWithStockReservation(input: CreateOrderInput): Promise<Order> {
    // Stable ordering across concurrent checkouts with overlapping variants prevents deadlocks.
    const sortedItems = [...input.items].sort((a, b) => a.productVariantId.localeCompare(b.productVariantId));

    const orderId = await this.prisma.$transaction(async (tx) => {
      const frozenItems: { productVariantId: string; quantity: number; price: number }[] = [];
      let totalAmount = 0;

      for (const item of sortedItems) {
        const rows = await tx.$queryRaw<LockedVariantRow[]>`
          SELECT id, stock, reserved_stock, price
          FROM product_variants
          WHERE id = ${item.productVariantId}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) {
          throw new NotFoundError(`Variante de producto no encontrada: ${item.productVariantId}`);
        }

        const available = row.stock - row.reserved_stock;
        if (available < item.quantity) {
          throw new InsufficientStockError(
            `Stock insuficiente para la variante ${item.productVariantId}: disponible ${available}, solicitado ${item.quantity}`,
          );
        }

        await tx.$executeRaw`
          UPDATE product_variants
          SET reserved_stock = reserved_stock + ${item.quantity}
          WHERE id = ${item.productVariantId}
        `;

        const unitPrice = Number(row.price);
        frozenItems.push({ productVariantId: item.productVariantId, quantity: item.quantity, price: unitPrice });
        totalAmount += unitPrice * item.quantity;
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId ?? null,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          shippingAddress: input.shippingAddress,
          totalAmount,
          items: {
            create: frozenItems.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
      });

      return order.id;
    });

    const created = await this.findById(orderId);
    if (!created) {
      throw new NotFoundError("No se pudo crear la orden");
    }
    return created;
  }

  async markPaid(orderId: string): Promise<Order | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (updateResult.count === 0) {
        return null;
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
      // Physical stock is only decremented once payment is confirmed — never at reservation time.
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { stock: { decrement: item.quantity }, reservedStock: { decrement: item.quantity } },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });

    return result ? toDomain(result) : null;
  }

  async releaseHold(orderId: string, reason: CancelReason): Promise<Order | null> {
    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", cancelReason: reason, cancelledAt: new Date() },
      });
      if (updateResult.count === 0) {
        return null;
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
      // stock is untouched here — it was never decremented for a hold that didn't pay.
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.productVariantId },
          data: { reservedStock: { decrement: item.quantity } },
        });
      }

      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });

    return result ? toDomain(result) : null;
  }

  async updateStatus(
    orderId: string,
    nextStatus: OrderStatus,
    shippingDetails?: { trackingNumber?: string; courier?: string },
  ): Promise<Order | null> {
    const requiredPrior = REQUIRED_PRIOR_STATUS[nextStatus];
    if (!requiredPrior) {
      throw new ConflictError(`Transición manual no permitida hacia ${nextStatus}`);
    }

    const updateResult = await this.prisma.order.updateMany({
      where: { id: orderId, status: requiredPrior },
      data: {
        status: nextStatus,
        ...(shippingDetails?.trackingNumber !== undefined ? { trackingNumber: shippingDetails.trackingNumber } : {}),
        ...(shippingDetails?.courier !== undefined ? { courier: shippingDetails.courier } : {}),
      },
    });

    if (updateResult.count === 0) {
      const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
      if (!existing) return null;
      throw new ConflictError(`No se puede pasar de ${existing.status} a ${nextStatus}`);
    }

    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    return toDomain(updated);
  }

  async findById(id: string): Promise<Order | null> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    return order ? toDomain(order) : null;
  }

  async findMany(filters: OrderFilters): Promise<PaginatedOrders> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 20;
    const where: Prisma.OrderWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items: rows.map(toDomain), total, page, pageSize };
  }
}
