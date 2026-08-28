import { IProductRepository } from "../../domain/repositories/IProductRepository";

export interface ValidateCartItemInput {
  variantId: string;
  quantity: number;
}

export interface CartItemValidationResult {
  variantId: string;
  requested: number;
  available: number;
  ok: boolean;
}

export interface ValidateCartResult {
  ok: boolean;
  items: CartItemValidationResult[];
}

/** Non-authoritative UX check (TOCTOU race is expected and fine) — real enforcement is the
 * locked transaction in CreateOrderUseCase / PrismaOrderRepository.createWithStockReservation. */
export class ValidateCartUseCase {
  constructor(private readonly productRepository: IProductRepository) {}

  async execute(items: ValidateCartItemInput[]): Promise<ValidateCartResult> {
    const results = await Promise.all(
      items.map(async (item): Promise<CartItemValidationResult> => {
        const variant = await this.productRepository.findVariantById(item.variantId);
        const available = variant ? variant.stock - variant.reservedStock : 0;
        return { variantId: item.variantId, requested: item.quantity, available, ok: available >= item.quantity };
      }),
    );

    return { ok: results.every((r) => r.ok), items: results };
  }
}
