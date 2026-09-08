import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaOrderRepository } from "../../src/infrastructure/database/PrismaOrderRepository";
import { prisma, resetDatabase, seedCatalog, testDatabaseAvailable } from "./setup";

const repo = new PrismaOrderRepository(prisma);

const available = await testDatabaseAvailable();

beforeEach(async () => {
  if (available) await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function orderInput(variantId: string, quantity = 1) {
  return {
    customerName: "Cliente de Prueba",
    customerEmail: "test@flashkings.pe",
    customerPhone: "999888777",
    shippingAddress: "Av. Test 123",
    shippingDepartment: "Lima",
    shippingProvince: "Lima",
    shippingDistrict: "Miraflores",
    items: [{ productVariantId: variantId, quantity }],
  };
}

/**
 * `markPaid` y `releaseHold` están guardados en `status = 'PENDING_PAYMENT'`, y de eso depende que
 * la carrera entre el cobro síncrono, el webhook y el worker de expiración sea segura: quien llega
 * primero gana y el resto es no-op. Sin esa guarda, un webhook duplicado descontaría el stock dos
 * veces — y el stock no tiene forma de saber que ya lo hizo.
 */
describe("idempotencia de la confirmación de pago", () => {
  test.if(available)("markPaid dos veces descuenta el stock una sola vez", async () => {
    const { variantId } = await seedCatalog({ stock: 10 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 3));

    const first = await repo.markPaid(order.id);
    const second = await repo.markPaid(order.id);

    expect(first?.status).toBe("PAID");
    // El segundo no encuentra la orden en PENDING_PAYMENT: devuelve null y no toca nada.
    expect(second).toBeNull();

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(7);
    expect(variant.reservedStock).toBe(0);
  });

  test.if(available)("markPaid y releaseHold concurrentes: gana uno solo", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 2));

    // La carrera real: el cobro confirma justo cuando expira el hold.
    const [paid, released] = await Promise.all([
      repo.markPaid(order.id),
      repo.releaseHold(order.id, "EXPIRED_HOLD"),
    ]);

    const winners = [paid, released].filter(Boolean);
    expect(winners.length).toBe(1);

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    // Gane quien gane, la reserva queda liberada y el stock es coherente con el resultado.
    expect(variant.reservedStock).toBe(0);
    expect(variant.stock).toBe(paid ? 3 : 5);
  });

  test.if(available)("releaseHold no toca el stock físico: nunca se decrementó", async () => {
    const { variantId } = await seedCatalog({ stock: 4 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 2));

    const cancelled = await repo.releaseHold(order.id, "EXPIRED_HOLD");

    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.cancelReason).toBe("EXPIRED_HOLD");
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(4);
    expect(variant.reservedStock).toBe(0);
  });

  test.if(available)("releaseHold sobre una orden ya pagada es no-op", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 1));
    await repo.markPaid(order.id);

    expect(await repo.releaseHold(order.id, "EXPIRED_HOLD")).toBeNull();

    const reloaded = await repo.findById(order.id);
    expect(reloaded?.status).toBe("PAID");
    // Y el stock no se "devolvió" por el intento tardío de expiración.
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(4);
  });

  test.if(available)("cinco confirmaciones simultáneas descuentan una sola vez", async () => {
    const { variantId } = await seedCatalog({ stock: 10 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 2));

    const results = await Promise.all(Array.from({ length: 5 }, () => repo.markPaid(order.id)));

    expect(results.filter(Boolean).length).toBe(1);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.stock).toBe(8);
    expect(variant.reservedStock).toBe(0);
  });
});

describe("transiciones de fulfillment contra la base", () => {
  test.if(available)("la cadena avanza en orden y rechaza los saltos", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 1));
    await repo.markPaid(order.id);

    // No se puede saltar de PAID a SHIPPED.
    await expect(repo.updateStatus(order.id, "SHIPPED")).rejects.toThrow(/No se puede pasar de PAID a SHIPPED/);

    expect((await repo.updateStatus(order.id, "IN_PREPARATION"))?.status).toBe("IN_PREPARATION");
    expect((await repo.updateStatus(order.id, "SHIPPED", { courier: "Olva", trackingNumber: "OLV-1" }))?.status).toBe(
      "SHIPPED",
    );
    expect((await repo.updateStatus(order.id, "DELIVERED"))?.status).toBe("DELIVERED");
  });

  test.if(available)("los estados gestionados por el sistema no son alcanzables a mano", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 1));

    for (const target of ["PAID", "CANCELLED", "REFUNDED", "PENDING_PAYMENT"] as const) {
      await expect(repo.updateStatus(order.id, target)).rejects.toThrow(/Transición manual no permitida/);
    }
  });

  test.if(available)("el tracking del envío se persiste con la transición", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 1));
    await repo.markPaid(order.id);
    await repo.updateStatus(order.id, "IN_PREPARATION");

    const shipped = await repo.updateStatus(order.id, "SHIPPED", { courier: "Shalom", trackingNumber: "SH-99" });
    expect(shipped?.courier).toBe("Shalom");
    expect(shipped?.trackingNumber).toBe("SH-99");
  });
});
