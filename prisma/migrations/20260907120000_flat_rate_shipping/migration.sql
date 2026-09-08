-- CreateEnum
CREATE TYPE "ShippingZone" AS ENUM ('LIMA_METROPOLITANA', 'PROVINCIA');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shipping_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_department" TEXT,
ADD COLUMN     "shipping_district" TEXT,
ADD COLUMN     "shipping_province" TEXT,
ADD COLUMN     "shipping_zone" "ShippingZone";

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "includes_shipping" BOOLEAN NOT NULL DEFAULT false;

