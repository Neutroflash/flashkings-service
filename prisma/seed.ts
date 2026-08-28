import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin123!", 12);
  await prisma.user.upsert({
    where: { email: "admin@flashkings.pe" },
    update: {},
    create: {
      email: "admin@flashkings.pe",
      passwordHash: adminPasswordHash,
      name: "Flashkings Admin",
      role: "ADMIN",
    },
  });

  const category = await prisma.category.upsert({
    where: { slug: "teclados-mecanicos" },
    update: {},
    create: {
      name: "Teclados Mecánicos",
      slug: "teclados-mecanicos",
      description: "Teclados mecánicos gaming de alto rendimiento",
    },
  });

  await prisma.product.upsert({
    where: { slug: "flashkings-fk-87-pro" },
    update: {},
    create: {
      name: "Flashkings FK-87 Pro",
      slug: "flashkings-fk-87-pro",
      description: "Teclado mecánico TKL hot-swappable con estructura de aluminio.",
      brand: "Flashkings",
      categoryId: category.id,
      isFeatured: true,
      variants: {
        create: [
          {
            sku: "FK87-RED-BLK",
            name: "Switch Red / Negro",
            price: 349.9,
            costPrice: 210.0,
            stock: 25,
            attributes: { switch: "Red", color: "Negro" },
          },
          {
            sku: "FK87-BRN-WHT",
            name: "Switch Brown / Blanco",
            price: 349.9,
            costPrice: 210.0,
            stock: 0,
            attributes: { switch: "Brown", color: "Blanco" },
          },
        ],
      },
      images: {
        create: [{ url: "https://placehold.co/800x800", altText: "Flashkings FK-87 Pro", isPrimary: true }],
      },
    },
  });

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
