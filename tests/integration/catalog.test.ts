import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { PrismaProductRepository } from "../../src/infrastructure/database/PrismaProductRepository";
import { PrismaCategoryRepository } from "../../src/infrastructure/database/PrismaCategoryRepository";
import { PrismaOrderRepository } from "../../src/infrastructure/database/PrismaOrderRepository";
import { GetProductsUseCase } from "../../src/application/products/GetProductsUseCase";
import { ConflictError } from "../../src/shared/errors/AppError";
import { prisma, resetDatabase, seedCatalog, testDatabaseAvailable } from "./setup";

const productRepo = new PrismaProductRepository(prisma);
const categoryRepo = new PrismaCategoryRepository(prisma);
const orderRepo = new PrismaOrderRepository(prisma);
const getProducts = new GetProductsUseCase(productRepo);

const available = await testDatabaseAvailable();

beforeEach(async () => {
  if (available) await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function sellOne(variantId: string) {
  const order = await orderRepo.createWithStockReservation({
    customerName: "Cliente de Prueba",
    customerEmail: "test@flashkings.pe",
    customerPhone: "999888777",
    shippingAddress: "Av. Test 123",
    shippingDepartment: "Lima",
    shippingProvince: "Lima",
    shippingDistrict: "Miraflores",
    items: [{ productVariantId: variantId, quantity: 1 }],
  });
  await orderRepo.markPaid(order.id);
}

describe("baja lógica del catálogo", () => {
  /**
   * La razón de que exista `isActive` en vez de un DELETE: borrar un producto vendido rompería la
   * trazabilidad de sus órdenes y del comprobante SUNAT ya emitido, que vive en los servidores de
   * SUNAT y tiene que seguir siendo explicable.
   */
  test.if(available)("un producto ya vendido no se puede borrar", async () => {
    const { productId, variantId } = await seedCatalog({ stock: 5 });
    await sellOne(variantId);

    await expect(productRepo.deleteProduct(productId)).rejects.toBeInstanceOf(ConflictError);
    await expect(productRepo.deleteProduct(productId)).rejects.toThrow(/ya se vendió/);
    expect(await prisma.product.count()).toBe(1);
  });

  test.if(available)("una variante ya vendida no se puede borrar", async () => {
    const { variantId } = await seedCatalog({ stock: 5 });
    await sellOne(variantId);

    await expect(productRepo.deleteVariant(variantId)).rejects.toThrow(/ya se vendió/);
  });

  test.if(available)("un producto que nunca se vendió sí se borra, con sus variantes", async () => {
    const { productId } = await seedCatalog({ stock: 5 });

    await productRepo.deleteProduct(productId);

    expect(await prisma.product.count()).toBe(0);
    // Las variantes caen por cascade.
    expect(await prisma.productVariant.count()).toBe(0);
  });

  test.if(available)("desactivar saca el producto del catálogo público pero no del admin", async () => {
    const { productId } = await seedCatalog({ stock: 5 });
    await productRepo.updateProduct(productId, { isActive: false });

    const publico = await getProducts.execute({});
    const admin = await getProducts.execute({}, "ADMIN");

    expect(publico.items.length).toBe(0);
    // El ADMIN tiene que seguir viéndolo para poder reactivarlo.
    expect(admin.items.length).toBe(1);
  });

  test.if(available)("reactivar lo devuelve al catálogo", async () => {
    const { productId } = await seedCatalog({ stock: 5 });
    await productRepo.updateProduct(productId, { isActive: false });
    await productRepo.updateProduct(productId, { isActive: true });

    expect((await getProducts.execute({})).items.length).toBe(1);
  });

  /** Regresión del bug del Sprint 7: el PATCH respondía 200 con el valor viejo. */
  test.if(available)("isActive se persiste de verdad, no solo se responde", async () => {
    const { productId, variantId } = await seedCatalog({ stock: 5 });

    const updated = await productRepo.updateProduct(productId, { isActive: false });
    expect(updated.isActive).toBe(false);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).isActive).toBe(false);

    const variant = await productRepo.updateVariant(variantId, { isActive: false });
    expect(variant.isActive).toBe(false);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).isActive).toBe(false);
  });

  test.if(available)("una variante nueva se puede agregar a un producto existente", async () => {
    const { productId } = await seedCatalog({ stock: 5 });

    const variant = await productRepo.addVariant(productId, {
      sku: "NUEVA-SKU",
      name: "Switch Brown",
      price: 200,
      costPrice: 90,
      stock: 7,
    });

    expect(variant.sku).toBe("NUEVA-SKU");
    expect(variant.isActive).toBe(true);
    expect(await prisma.productVariant.count({ where: { productId } })).toBe(2);
  });
});

describe("categorías", () => {
  test.if(available)("una categoría con productos no se puede borrar", async () => {
    const { categoryId } = await seedCatalog();

    await expect(categoryRepo.delete(categoryId)).rejects.toBeInstanceOf(ConflictError);
    await expect(categoryRepo.delete(categoryId)).rejects.toThrow(/muévelos a otra categoría/);
  });

  test.if(available)("una categoría vacía sí se borra", async () => {
    const category = await categoryRepo.create({ name: "Vacía", slug: "vacia" });

    await categoryRepo.delete(category.id);

    expect(await prisma.category.count({ where: { id: category.id } })).toBe(0);
  });

  test.if(available)("el conteo de productos alimenta la decisión del panel", async () => {
    const { categoryId } = await seedCatalog();
    await categoryRepo.create({ name: "Vacía", slug: "vacia" });

    const conCuentas = await categoryRepo.findAllWithCounts();
    const conProductos = conCuentas.find((c) => c.id === categoryId);
    const vacia = conCuentas.find((c) => c.slug === "vacia");

    expect(conProductos?.productCount).toBe(1);
    expect(vacia?.productCount).toBe(0);
  });

  test.if(available)("renombrar no cambia el slug: es una URL que puede estar indexada", async () => {
    const category = await categoryRepo.create({ name: "Nombre Viejo", slug: "nombre-viejo" });

    const updated = await categoryRepo.update(category.id, { name: "Nombre Nuevo" });

    expect(updated.name).toBe("Nombre Nuevo");
    expect(updated.slug).toBe("nombre-viejo");
  });
});
