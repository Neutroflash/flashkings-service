-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterEnum
ALTER TYPE "InvoiceType" ADD VALUE 'NOTA_CREDITO';

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';

-- DropIndex
DROP INDEX "invoices_order_id_key";

-- AlterTable
-- The counter key becomes (type, series). Existing rows already represent a real SUNAT sequence
-- each, so the column is added nullable, backfilled with the series those rows have always used
-- (B001 for boletas, F001 for facturas — the SERIES map in PrismaInvoiceRepository), and only
-- then made NOT NULL. Adding it NOT NULL up front would fail on any database that has already
-- issued a comprobante.
ALTER TABLE "invoice_counters" ADD COLUMN "series" TEXT;

UPDATE "invoice_counters" SET "series" = CASE
  WHEN "type" = 'BOLETA' THEN 'B001'
  WHEN "type" = 'FACTURA' THEN 'F001'
END
WHERE "series" IS NULL;

ALTER TABLE "invoice_counters" ALTER COLUMN "series" SET NOT NULL;

ALTER TABLE "invoice_counters" DROP CONSTRAINT "invoice_counters_pkey",
ADD CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("type", "series");

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "note_reason_code" TEXT,
ADD COLUMN     "refund_id" TEXT,
ADD COLUMN     "related_invoice_id" TEXT;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "refunded_quantity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refunded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "is_full" BOOLEAN NOT NULL DEFAULT false,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason_code" TEXT NOT NULL,
    "reason_text" TEXT NOT NULL,
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "provider_refund_id" TEXT,
    "raw_response" JSONB,
    "restocked" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_items" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "refund_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "refund_items_refund_id_idx" ON "refund_items"("refund_id");

-- CreateIndex
CREATE INDEX "refund_items_order_item_id_idx" ON "refund_items"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_refund_id_key" ON "invoices"("refund_id");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_related_invoice_id_idx" ON "invoices"("related_invoice_id");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_related_invoice_id_fkey" FOREIGN KEY ("related_invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

