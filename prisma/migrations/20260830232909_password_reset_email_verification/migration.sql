-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verification_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "email_verification_token_hash" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "password_reset_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "password_reset_token_hash" TEXT;
