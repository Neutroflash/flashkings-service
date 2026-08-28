import { CancelReason, Order, OrderStatus } from "../entities/Order";

export interface CreateOrderItemInput {
  productVariantId: string;
  quantity: number;
}

export interface CreateOrderInput {
  userId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  items: CreateOrderItemInput[];
}

export interface OrderFilters {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

export interface PaginatedOrders {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IOrderRepository {
  /**
   * Locks each requested variant row (FOR UPDATE), verifies available stock
   * (stock - reservedStock >= quantity), increments reservedStock, freezes the
   * current price into each OrderItem, and creates the Order — all in one transaction.
   * Throws InsufficientStockError if any line item can't be reserved.
   */
  createWithStockReservation(input: CreateOrderInput): Promise<Order>;

  /** Idempotent: only transitions PENDING_PAYMENT -> PAID. Returns null if the order was already resolved. */
  markPaid(orderId: string): Promise<Order | null>;

  /** Idempotent: only transitions PENDING_PAYMENT -> CANCELLED, releasing reservedStock (never touches stock). */
  releaseHold(orderId: string, reason: CancelReason): Promise<Order | null>;

  /** Manual admin transition, guarded by ALLOWED_MANUAL_TRANSITIONS. shippingDetails only apply when moving to SHIPPED. */
  updateStatus(
    orderId: string,
    nextStatus: OrderStatus,
    shippingDetails?: { trackingNumber?: string; courier?: string },
  ): Promise<Order | null>;

  findById(id: string): Promise<Order | null>;
  findMany(filters: OrderFilters): Promise<PaginatedOrders>;
}
