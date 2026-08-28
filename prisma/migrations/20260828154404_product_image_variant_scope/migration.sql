-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "product_variant_id" TEXT;

-- CreateIndex
CREATE INDEX "product_images_product_variant_id_idx" ON "product_images"("product_variant_id");

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
