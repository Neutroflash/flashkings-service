-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('RECLAMO', 'QUEJA');

-- CreateTable
CREATE TABLE "complaints" (
    "id" TEXT NOT NULL,
    "correlativo" SERIAL NOT NULL,
    "type" "ComplaintType" NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "is_minor" BOOLEAN NOT NULL DEFAULT false,
    "guardian_name" TEXT,
    "good_type" TEXT NOT NULL,
    "good_description" TEXT NOT NULL,
    "claimed_amount" DECIMAL(10,2),
    "detail" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "provider_response" TEXT,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);
