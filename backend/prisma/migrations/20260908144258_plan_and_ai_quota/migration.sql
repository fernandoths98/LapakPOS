-- CreateEnum
CREATE TYPE "MerchantPlan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('recap', 'ask', 'discrepancy', 'photoFill');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "plan" "MerchantPlan" NOT NULL DEFAULT 'free',
ADD COLUMN     "plan_renews_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ppob_commission_ledger" ADD COLUMN     "platform_fee_amount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ai_usage_days" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_days_merchant_id_day_feature_key" ON "ai_usage_days"("merchant_id", "day", "feature");

-- AddForeignKey
ALTER TABLE "ai_usage_days" ADD CONSTRAINT "ai_usage_days_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
