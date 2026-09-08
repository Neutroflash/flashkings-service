import { PrismaClient } from "@prisma/client";

/**
 * Base de datos SEPARADA de la de desarrollo. Los tests de integración truncan tablas entre casos,
 * así que apuntarlos a `flashkings` borraría los datos con los que se está trabajando — de ahí que
 * la URL no se herede del `.env` sino que se construya explícitamente hacia `flashkings_test`.
 *
 * Crear la base la primera vez:
 *   docker exec flashkings-postgres psql -U postgres -c "CREATE DATABASE flashkings_test"
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flashkings_test?schema=public" bunx prisma migrate deploy
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/flashkings_test?schema=public";

export const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

/** Guarda de seguridad: si alguien apunta esto a la base real, mejor fallar que truncarla. */
function assertIsTestDatabase(): void {
  if (!/flashkings_test/.test(TEST_DATABASE_URL)) {
    throw new Error(
      `TEST_DATABASE_URL debe apuntar a una base de test (contiene "flashkings_test"), no a ${TEST_DATABASE_URL}`,
    );
  }
}

/** true si hay una base de test alcanzable — los tests se saltan solos cuando no la hay. */
export async function testDatabaseAvailable(): Promise<boolean> {
  assertIsTestDatabase();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Deja la base vacía. TRUNCATE ... CASCADE en una sola sentencia en vez de borrar tabla por tabla:
 * el orden de las FKs (refund_items → refunds → orders → order_items → product_variants) ya es
 * suficientemente enredado como para mantenerlo a mano.
 */
export async function resetDatabase(): Promise<void> {
  assertIsTestDatabase();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      refund_items, refunds, invoices, invoice_counters, payments,
      order_items, orders, product_images, product_variants, products,
      categories, complaints, users
    RESTART IDENTITY CASCADE
  `);
}

export interface SeededCatalog {
  categoryId: string;
  productId: string;
  variantId: string;
}

export async function seedCatalog(options: { stock?: number; price?: number } = {}): Promise<SeededCatalog> {
  const category = await prisma.category.create({
    data: { name: "Teclados", slug: `teclados-${crypto.randomUUID().slice(0, 8)}` },
  });
  const product = await prisma.product.create({
    data: {
      name: "Teclado de prueba",
      slug: `teclado-${crypto.randomUUID().slice(0, 8)}`,
      brand: "Flashkings",
      categoryId: category.id,
    },
  });
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `SKU-${crypto.randomUUID().slice(0, 8)}`,
      name: "Variante",
      price: options.price ?? 100,
      costPrice: 50,
      stock: options.stock ?? 10,
    },
  });

  return { categoryId: category.id, productId: product.id, variantId: variant.id };
}
