import { describe, expect, test } from "bun:test";
import { toPublicProduct } from "../../src/domain/entities/Product";
import { toPublicVariant } from "../../src/domain/entities/ProductVariant";
import { toPublicOrder } from "../../src/domain/entities/Order";
import { toPublicRefund } from "../../src/domain/entities/Refund";
import type { Product } from "../../src/domain/entities/Product";
import type { ProductVariant } from "../../src/domain/entities/ProductVariant";
import type { Order } from "../../src/domain/entities/Order";
import type { Refund } from "../../src/domain/entities/Refund";

function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "v1",
    productId: "p1",
    sku: "FK87-RED",
    name: "Switch Red",
    price: 349.9,
    costPrice: 180,
    stock: 10,
    reservedStock: 2,
    attributes: { switch: "red" },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProduct(variants: ProductVariant[]): Product {
  return {
    id: "p1",
    name: "Flashkings FK-87",
    slug: "flashkings-fk-87",
    description: null,
    brand: "Flashkings",
    categoryId: "c1",
    isFeatured: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants,
  };
}

/**
 * `costPrice` y el stock exacto son ADMIN-only. Estos tests son la red contra el bug de Sprint 1,
 * donde un spread parecía excluir un campo sensible y en runtime lo dejaba pasar igual: acá se
 * comprueba el JSON serializado, no la forma del tipo, porque el tipo de TS no cambia el objeto.
 */
describe("frontera pública del catálogo", () => {
  test("costPrice nunca sale en una variante pública", () => {
    const serialized = JSON.stringify(toPublicVariant(makeVariant()));
    expect(serialized).not.toContain("costPrice");
    expect(serialized).not.toContain("180");
  });

  test("el stock exacto nunca sale: solo inStock booleano", () => {
    const publicVariant = toPublicVariant(makeVariant({ stock: 37, reservedStock: 5 }));
    const serialized = JSON.stringify(publicVariant);
    expect(publicVariant.inStock).toBe(true);
    expect(serialized).not.toContain("37");
    expect(serialized).not.toContain("reservedStock");
  });

  test("inStock es stock - reservedStock, no stock a secas", () => {
    expect(toPublicVariant(makeVariant({ stock: 3, reservedStock: 3 })).inStock).toBe(false);
    expect(toPublicVariant(makeVariant({ stock: 3, reservedStock: 2 })).inStock).toBe(true);
  });

  test("un producto público no filtra costPrice de ninguna de sus variantes", () => {
    const product = makeProduct([makeVariant(), makeVariant({ id: "v2", sku: "FK87-BRN", costPrice: 999 })]);
    const serialized = JSON.stringify(toPublicProduct(product));
    expect(serialized).not.toContain("costPrice");
    expect(serialized).not.toContain("999");
  });

  test("las variantes inactivas no llegan al público ni cuentan para inStock", () => {
    const product = makeProduct([
      makeVariant({ id: "v1", isActive: false, stock: 50 }),
      makeVariant({ id: "v2", sku: "FK87-BRN", isActive: true, stock: 0, reservedStock: 0 }),
    ]);
    const publicProduct = toPublicProduct(product);

    expect(publicProduct.variants.length).toBe(1);
    expect(publicProduct.variants[0].sku).toBe("FK87-BRN");
    // La única variante visible está sin stock, así que el producto no está disponible — aunque
    // la inactiva tenga 50 unidades guardadas.
    expect(publicProduct.inStock).toBe(false);
  });
});

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    userId: null,
    status: "PAID",
    totalAmount: 364.9,
    customerName: "Cliente",
    customerEmail: "c@flashkings.pe",
    customerPhone: "999888777",
    shippingAddress: "Av. Test 123",
    shippingDepartment: "Lima",
    shippingProvince: "Lima",
    shippingDistrict: "Miraflores",
    shippingZone: "LIMA_METROPOLITANA",
    shippingCost: 15,
    cancelReason: null,
    paidAt: new Date(),
    cancelledAt: null,
    refundedAt: null,
    trackingNumber: null,
    courier: null,
    items: [
      {
        id: "oi1",
        orderId: "o1",
        productVariantId: "v1",
        quantity: 1,
        price: 349.9,
        refundedQuantity: 0,
        productVariant: makeVariant(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRefund(overrides: Partial<Refund> = {}): Refund {
  return {
    id: "r1",
    orderId: "o1",
    paymentId: "pay1",
    amount: 349.9,
    isFull: false,
    status: "COMPLETED",
    reasonCode: "06",
    reasonText: "Devolución total",
    isManual: false,
    providerRefundId: "ref_secreto_del_gateway",
    rawResponse: { culqi: "payload interno", token: "tok_no_debe_salir" },
    restocked: true,
    includesShipping: false,
    createdById: "admin-user-id",
    createdAt: new Date(),
    items: [],
    ...overrides,
  };
}

describe("frontera pública de la orden", () => {
  test("la orden pública no arrastra costPrice de la variante del ítem", () => {
    const serialized = JSON.stringify(toPublicOrder(makeOrder()));
    expect(serialized).not.toContain("costPrice");
    expect(serialized).not.toContain("reservedStock");
    expect(serialized).not.toContain("180");
  });

  test("un reembolso público no expone el payload de la pasarela ni quién lo hizo", () => {
    const serialized = JSON.stringify(toPublicRefund(makeRefund()));
    expect(serialized).not.toContain("rawResponse");
    expect(serialized).not.toContain("tok_no_debe_salir");
    expect(serialized).not.toContain("ref_secreto_del_gateway");
    expect(serialized).not.toContain("admin-user-id");
    // Pero sí lo que el cliente necesita ver de su propia devolución.
    expect(serialized).toContain("349.9");
    expect(serialized).toContain("Devolución total");
  });

  test("los reembolsos de la orden salen ya sanitizados", () => {
    const order = makeOrder({ refunds: [makeRefund()] });
    const serialized = JSON.stringify(toPublicOrder(order));
    expect(serialized).not.toContain("tok_no_debe_salir");
    expect(serialized).not.toContain("createdById");
  });

  test("el flete cobrado sí es visible: es parte de lo que el cliente pagó", () => {
    const publicOrder = toPublicOrder(makeOrder());
    expect(publicOrder.shippingCost).toBe(15);
    expect(publicOrder.totalAmount).toBe(364.9);
  });
});
