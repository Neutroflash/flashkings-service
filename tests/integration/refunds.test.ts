import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaOrderRepository } from "../../src/infrastructure/database/PrismaOrderRepository";
import { PrismaRefundRepository } from "../../src/infrastructure/database/PrismaRefundRepository";
import { RefundOrderUseCase } from "../../src/application/refunds/RefundOrderUseCase";
import { FakePaymentGateway } from "../../src/infrastructure/payments/FakePaymentGateway";
import type { IEventBus } from "../../src/domain/services/IEventBus";
import type { DomainEvent } from "../../src/domain/events/OrderEvents";
import { prisma, resetDatabase, seedCatalog, testDatabaseAvailable } from "./setup";

const orderRepo = new PrismaOrderRepository(prisma);
const refundRepo = new PrismaRefundRepository(prisma);

const available = await testDatabaseAvailable();

/** Bus que solo recuerda lo publicado — acá interesa el efecto en la base, no el correo. */
function makeSpyBus(): IEventBus & { published: DomainEvent[] } {
  const published: DomainEvent[] = [];
  return {
    published,
    publish: (event: DomainEvent) => {
      published.push(event);
    },
    subscribe: () => undefined,
  } as IEventBus & { published: DomainEvent[] };
}

beforeEach(async () => {
  if (available) await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function orderInput(variantId: string, quantity: number, provincia = false) {
  return {
    customerName: "Cliente de Prueba",
    customerEmail: "test@flashkings.pe",
    customerPhone: "999888777",
    shippingAddress: "Av. Test 123",
    shippingDepartment: provincia ? "Cusco" : "Lima",
    shippingProvince: provincia ? "Cusco" : "Lima",
    shippingDistrict: "Centro",
    items: [{ productVariantId: variantId, quantity }],
  };
}

/** Orden pagada con su cargo registrado, que es lo que un reembolso necesita para revertir. */
async function paidOrder(options: { stock?: number; price?: number; quantity?: number; provincia?: boolean } = {}) {
  const gateway = new FakePaymentGateway();
  const { variantId } = await seedCatalog({ stock: options.stock ?? 10, price: options.price ?? 100 });
  const created = await orderRepo.createWithStockReservation(
    orderInput(variantId, options.quantity ?? 2, options.provincia),
  );

  const charge = await gateway.createCharge({
    amount: created.totalAmount,
    currency: "PEN",
    orderId: created.id,
    email: created.customerEmail,
    sourceId: "tok_test",
  });
  await prisma.payment.create({
    data: {
      orderId: created.id,
      provider: "culqi",
      providerChargeId: charge.providerChargeId,
      status: "succeeded",
      amount: created.totalAmount,
    },
  });
  await orderRepo.markPaid(created.id);

  const order = await orderRepo.findById(created.id);
  return { order: order!, variantId, gateway };
}

function makeUseCase(gateway: FakePaymentGateway) {
  const bus = makeSpyBus();
  return { useCase: new RefundOrderUseCase(orderRepo, refundRepo, gateway, bus), bus };
}

describe("reembolsos", () => {
  test.if(available)("un reembolso parcial repone stock y deja la orden en su estado", async () => {
    const { order, variantId, gateway } = await paidOrder({ stock: 10, price: 100, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    const { refund, order: updated } = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "07",
    });

    expect(refund.amount).toBe(100);
    expect(refund.isFull).toBe(false);
    expect(refund.status).toBe("COMPLETED");
    expect(updated.status).toBe("PAID");

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(9); // 10 - 2 vendidas + 1 devuelta
  });

  test.if(available)("no se puede devolver más dinero del que queda", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    await expect(useCase.execute({ orderId: order.id, amount: 9999, reasonCode: "06" })).rejects.toThrow(
      /No se puede reembolsar/,
    );
  });

  /**
   * Con precios normales esta guarda no se alcanza: pedir más unidades de las compradas produce un
   * monto que la guarda de dinero rechaza antes. Hace falta un precio bajo — 2 unidades a S/ 1 son
   * S/ 17 con flete, así que devolver 5 (S/ 5) cabe en el saldo y llega hasta la comprobación de
   * cantidades. Las dos guardas son necesarias: la de dinero no distingue de qué línea sale.
   */
  test.if(available)("no se pueden devolver más unidades de las compradas", async () => {
    const { order, gateway } = await paidOrder({ price: 1, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    await expect(
      useCase.execute({
        orderId: order.id,
        items: [{ orderItemId: order.items[0].id, quantity: 5 }],
        reasonCode: "07",
      }),
    ).rejects.toThrow(/No se pueden devolver 5 unidades/);
  });

  test.if(available)("con montos grandes gana la guarda de dinero, que también protege", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    await expect(
      useCase.execute({
        orderId: order.id,
        items: [{ orderItemId: order.items[0].id, quantity: 5 }],
        reasonCode: "07",
      }),
    ).rejects.toThrow(/No se puede reembolsar/);
  });

  test.if(available)("una orden ya reembolsada no admite otro reembolso", async () => {
    const { order, gateway } = await paidOrder({ quantity: 1 });
    const { useCase } = makeUseCase(gateway);

    await useCase.execute({ orderId: order.id, reasonCode: "06" });
    await expect(useCase.execute({ orderId: order.id, amount: 10, reasonCode: "06" })).rejects.toThrow(
      /no admite reembolso/,
    );
  });

  test.if(available)("un motivo fuera del catálogo 09 se rechaza", async () => {
    const { order, gateway } = await paidOrder();
    const { useCase } = makeUseCase(gateway);
    await expect(useCase.execute({ orderId: order.id, reasonCode: "99" })).rejects.toThrow(/Motivo/);
  });

  /**
   * La guarda que sostiene todo lo anterior bajo carrera: sin el `FOR UPDATE` sobre la orden, dos
   * reembolsos concurrentes leen el mismo saldo, ambos lo validan y entre los dos devuelven más de
   * lo cobrado.
   */
  test.if(available)("dos reembolsos concurrentes nunca superan el total", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 }); // total 215 con flete
    const { useCase } = makeUseCase(gateway);

    const results = await Promise.allSettled([
      useCase.execute({ orderId: order.id, amount: 150, reasonCode: "10" }),
      useCase.execute({ orderId: order.id, amount: 150, reasonCode: "10" }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBe(1);

    const total = await prisma.refund.aggregate({
      where: { orderId: order.id, status: { not: "FAILED" } },
      _sum: { amount: true },
    });
    expect(Number(total._sum.amount)).toBeLessThanOrEqual(215);
  });

  test.if(available)("sin reponer stock, las unidades no vuelven al almacén", async () => {
    const { order, variantId, gateway } = await paidOrder({ stock: 10, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "07",
      restock: false,
    });

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(8); // se quedó en lo vendido: el producto se perdió en tránsito
  });
});

describe("el flete en un reembolso", () => {
  /** Regresión del bug del Sprint 6: la orden quedaba colgada en PAID por el residuo del flete. */
  test.if(available)("devolver todas las unidades cierra la orden aunque el flete se retenga", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 }); // 200 + 15
    const { useCase } = makeUseCase(gateway);

    const { refund, order: updated } = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 2 }],
      reasonCode: "06", // arrepentimiento: el envío ya se prestó
    });

    expect(refund.amount).toBe(200);
    expect(refund.includesShipping).toBe(false);
    expect(refund.isFull).toBe(true);
    expect(updated.status).toBe("REFUNDED");
  });

  /** El otro bug del Sprint 6: `includesShipping` describe el monto, no el cierre de la orden. */
  test.if(available)("un reembolso que retiene el flete no lo marca como devuelto", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 1 });
    const { useCase } = makeUseCase(gateway);

    const { refund } = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "06",
    });

    expect(refund.amount).toBe(100);
    expect(refund.includesShipping).toBe(false);
  });

  test.if(available)("cuando la falla es del negocio, el flete vuelve con el producto", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 1 });
    const { useCase } = makeUseCase(gateway);

    const { refund } = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "01", // anulación de la operación
    });

    expect(refund.amount).toBe(115);
    expect(refund.includesShipping).toBe(true);
  });

  test.if(available)("en provincia el flete devuelto es S/ 25", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 1, provincia: true });
    const { useCase } = makeUseCase(gateway);

    const { refund } = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "01",
    });

    expect(refund.amount).toBe(125);
  });

  test.if(available)("el flete no se devuelve dos veces", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    const first = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "01",
    });
    expect(first.refund.includesShipping).toBe(true);
    expect(first.refund.amount).toBe(115);

    const second = await useCase.execute({
      orderId: order.id,
      items: [{ orderItemId: order.items[0].id, quantity: 1 }],
      reasonCode: "01",
    });
    expect(second.refund.includesShipping).toBe(false);
    expect(second.refund.amount).toBe(100);
  });
});

describe("el dinero y su registro no se separan", () => {
  /**
   * El orden importa: primero se registra el reembolso en nuestra base, después se le pide el
   * dinero a la pasarela. Si la pasarela rechaza, el registro sobrevive en FAILED — que es lo
   * único que hace el fallo auditable y recuperable a mano.
   */
  test.if(available)("si la pasarela rechaza, el reembolso queda registrado en FAILED", async () => {
    // 7.00 es el monto que FakePaymentGateway rechaza a propósito.
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 });
    const { useCase } = makeUseCase(gateway);

    const { refund } = await useCase.execute({ orderId: order.id, amount: 7, reasonCode: "10" });

    expect(refund.status).toBe("FAILED");
    const persisted = await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(persisted.status).toBe("FAILED");
  });

  test.if(available)("un reembolso FAILED no consume saldo de la orden", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 2 }); // total 215
    const { useCase } = makeUseCase(gateway);

    await useCase.execute({ orderId: order.id, amount: 7, reasonCode: "10" });
    // El saldo sigue completo, así que todavía se puede devolver todo.
    const { refund } = await useCase.execute({ orderId: order.id, reasonCode: "06" });
    expect(refund.amount).toBe(215);
  });

  test.if(available)("un reembolso manual no toca la pasarela y queda COMPLETED", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 1 });
    const { useCase } = makeUseCase(gateway);

    const { refund } = await useCase.execute({ orderId: order.id, reasonCode: "06", isManual: true });

    expect(refund.isManual).toBe(true);
    expect(refund.status).toBe("COMPLETED");
    expect(refund.providerRefundId).toBeNull();
  });

  test.if(available)("publica order.refunded para que salga el correo al cliente", async () => {
    const { order, gateway } = await paidOrder({ price: 100, quantity: 1 });
    const { useCase, bus } = makeUseCase(gateway);

    await useCase.execute({ orderId: order.id, reasonCode: "06" });

    expect(bus.published.length).toBe(1);
    expect(bus.published[0].type).toBe("order.refunded");
  });
});
