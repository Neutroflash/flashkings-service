import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaOrderRepository } from "../../src/infrastructure/database/PrismaOrderRepository";
import { InsufficientStockError } from "../../src/shared/errors/AppError";
import { prisma, resetDatabase, seedCatalog, testDatabaseAvailable } from "./setup";

const repo = new PrismaOrderRepository(prisma);

// A nivel de módulo, no en un beforeAll: `test.if(...)` se evalúa cuando el test se DECLARA, y
// para entonces un beforeAll todavía no corrió — con la comprobación ahí, todo quedaba saltado en
// silencio, que es la peor forma de fallar en una suite.
const available = await testDatabaseAvailable();
if (!available) {
  console.warn("[integration] sin base de test alcanzable — estos tests se saltan");
}

beforeEach(async () => {
  if (available) await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function orderInput(variantId: string, quantity: number) {
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

describe("motor de reserva de stock", () => {
  /**
   * LA regresión del sistema. La invariante que protege es que dos clientes no puedan comprar la
   * misma última unidad, y solo se puede comprobar con concurrencia real contra Postgres: los
   * locks `FOR UPDATE` no tienen equivalente simulable. Hasta acá esto se había verificado a mano
   * una vez y nunca más.
   */
  test.if(available)("10 checkouts simultáneos sobre stock=1 → exactamente 1 gana", async () => {
    const { variantId } = await seedCatalog({ stock: 1 });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => repo.createWithStockReservation(orderInput(variantId, 1))),
    );

    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(ok.length).toBe(1);
    expect(rejected.length).toBe(9);
    for (const failure of rejected) {
      expect((failure as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);
    }

    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    // La unidad quedó reservada, no vendida: el stock físico no se toca hasta que se pague.
    expect(variant.reservedStock).toBe(1);
    expect(variant.stock).toBe(1);
  });

  test.if(available)("reserva concurrente parcial: 5 unidades entre 8 pedidos de 1", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => repo.createWithStockReservation(orderInput(variantId, 1))),
    );

    expect(results.filter((r) => r.status === "fulfilled").length).toBe(5);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    expect(variant.reservedStock).toBe(5);
  });

  test.if(available)("disponible es stock menos reservado, no stock a secas", async () => {
    const { variantId } = await seedCatalog({ stock: 3 });
    await repo.createWithStockReservation(orderInput(variantId, 2));

    // Quedan 1 disponibles aunque el stock físico siga en 3.
    await expect(repo.createWithStockReservation(orderInput(variantId, 2))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    await expect(repo.createWithStockReservation(orderInput(variantId, 1))).resolves.toBeDefined();
  });

  /** Un carrito es todo-o-nada: no puede quedar medio reservado. */
  test.if(available)("si un ítem del carrito no alcanza, no se reserva ninguno", async () => {
    const abundante = await seedCatalog({ stock: 50 });
    const escaso = await seedCatalog({ stock: 1 });

    await expect(
      repo.createWithStockReservation({
        ...orderInput(abundante.variantId, 1),
        items: [
          { productVariantId: abundante.variantId, quantity: 5 },
          { productVariantId: escaso.variantId, quantity: 99 },
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    const sinTocar = await prisma.productVariant.findUniqueOrThrow({ where: { id: abundante.variantId } });
    expect(sinTocar.reservedStock).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  test.if(available)("congela el precio vigente: subirlo después no altera la orden", async () => {
    const { variantId } = await seedCatalog({ stock: 5, price: 100 });
    const order = await repo.createWithStockReservation(orderInput(variantId, 2));

    await prisma.productVariant.update({ where: { id: variantId }, data: { price: 999 } });

    const reloaded = await repo.findById(order.id);
    expect(reloaded?.items[0].price).toBe(100);
    // 2 × 100 + 15 de flete a Lima.
    expect(reloaded?.totalAmount).toBe(215);
  });

  test.if(available)("no se puede comprar una variante desactivada", async () => {
    const { variantId } = await seedCatalog({ stock: 10 });
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });

    await expect(repo.createWithStockReservation(orderInput(variantId, 1))).rejects.toThrow(
      /ya no está a la venta/,
    );
    expect(await prisma.order.count()).toBe(0);
  });

  test.if(available)("el flete se tarifa en el servidor según el destino", async () => {
    const { variantId } = await seedCatalog({ stock: 10, price: 100 });

    const lima = await repo.createWithStockReservation(orderInput(variantId, 1));
    expect(lima.shippingCost).toBe(15);
    expect(lima.totalAmount).toBe(115);

    const provincia = await repo.createWithStockReservation({
      ...orderInput(variantId, 1),
      shippingDepartment: "Cusco",
      shippingProvince: "Cusco",
      shippingDistrict: "Centro",
    });
    expect(provincia.shippingCost).toBe(25);
    expect(provincia.totalAmount).toBe(125);
  });
});
