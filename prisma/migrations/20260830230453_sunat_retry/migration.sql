-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'PENDING_SUNAT';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "signed_xml" TEXT,
ADD COLUMN     "sunat_retry_count" INTEGER NOT NULL DEFAULT 0;
