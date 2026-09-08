import { Prisma } from "@prisma/client";
import { CancelReason, Order, OrderStatus } from "../../domain/entities/Order";
import { ShippingZone } from "../../domain/entities/Shipping";
import { findComprobante, findCreditNotes, Invoice } from "../../domain/entities/Invoice";
import { Refund, RefundStatus } from "../../domain/entities/Refund";

/**
 * Vive acá y no dentro de PrismaOrderRepository porque PrismaRefundRepository también devuelve la
 * orden afectada por un reembolso; importarla desde el otro repositorio los acoplaría en círculo.
 */
export const orderInclude = {
  items: { include: { productVariant: true } },
  payment: true,
  invoices: true,
  refunds: { include: { items: true }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

type InvoiceRow = OrderWithRelations["invoices"][number];
type RefundRow = OrderWithRelations["refunds"][number];

function toDomainInvoice(invoice: InvoiceRow): Invoice {
  return { ...invoice, type: invoice.type, status: invoice.status } as Invoice;
}

function toDomainRefundRow(refund: RefundRow): Refund {
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

export function toDomainOrder(order: OrderWithRelations): Order {
  const invoices = order.invoices.map(toDomainInvoice);

  return {
    id: order.id,
    userId: order.userId,
    status: order.status as OrderStatus,
    totalAmount: order.totalAmount.toNumber(),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    shippingDepartment: order.shippingDepartment,
    shippingProvince: order.shippingProvince,
    shippingDistrict: order.shippingDistrict,
    shippingZone: order.shippingZone as ShippingZone | null,
    shippingCost: order.shippingCost.toNumber(),
    cancelReason: order.cancelReason as CancelReason | null,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    refundedAt: order.refundedAt,
    trackingNumber: order.trackingNumber,
    courier: order.courier,
    payment: order.payment ? { ...order.payment, amount: order.payment.amount.toNumber() } : null,
    // `invoice` sigue siendo el comprobante (boleta/factura) para todo el código que ya existía;
    // las notas de crédito van aparte en vez de mezclarse en el mismo campo.
    invoice: findComprobante(invoices),
    creditNotes: findCreditNotes(invoices),
    refunds: order.refunds.map(toDomainRefundRow),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      price: item.price.toNumber(),
      refundedQuantity: item.refundedQuantity,
      productVariant: {
        ...item.productVariant,
        price: item.productVariant.price.toNumber(),
        costPrice: item.productVariant.costPrice.toNumber(),
        attributes: item.productVariant.attributes as Record<string, unknown>,
      },
    })),
  };
}
