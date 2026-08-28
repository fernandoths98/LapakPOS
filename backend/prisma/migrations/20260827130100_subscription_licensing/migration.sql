-- Phase 2b: subscriptions become freemium.
--   - a fresh account is on `free` / `active` with no trial
--   - existing never-paid trials collapse to `free` / `active`
--   - paid plans are bought with a QRIS invoice (subscription_invoices),
--     mirroring wallet top-ups

ALTER TABLE "subscriptions" ALTER COLUMN "trial_ends_at" DROP NOT NULL;
ALTER TABLE "subscriptions" ALTER COLUMN "plan_code" SET DEFAULT 'free';
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'active';

UPDATE "subscriptions"
SET "plan_code" = 'free', "status" = 'active', "trial_ends_at" = NULL, "updated_at" = NOW()
WHERE "status" = 'trialing';

CREATE TABLE "subscription_invoices" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "plan_code" "PlanCode" NOT NULL,
  "months" INTEGER NOT NULL DEFAULT 1,
  "amount" INTEGER NOT NULL,
  "partner_ref" TEXT NOT NULL,
  "provider_ref" TEXT,
  "qr_content" TEXT NOT NULL,
  "status" "WalletTopupStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_invoices_partner_ref_key" ON "subscription_invoices"("partner_ref");
CREATE INDEX "subscription_invoices_merchant_id_created_at_idx" ON "subscription_invoices"("merchant_id", "created_at");
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
