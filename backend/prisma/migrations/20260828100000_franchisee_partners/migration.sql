-- Phase 5: inter-tenant franchise — another business runs under a merchant's
-- brand with its own login/plan/catalog, linked via a redeemable join code.

CREATE TYPE "PartnerStatus" AS ENUM ('pending', 'active', 'ended');

CREATE TABLE "franchisee_partners" (
  "id" TEXT NOT NULL,
  "franchisor_merchant_id" TEXT NOT NULL,
  "franchisee_merchant_id" TEXT,
  "label" TEXT,
  "join_code" TEXT NOT NULL,
  "royalty_percent" INTEGER NOT NULL DEFAULT 0,
  "fee_monthly" INTEGER NOT NULL DEFAULT 0,
  "status" "PartnerStatus" NOT NULL DEFAULT 'pending',
  "joined_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "franchisee_partners_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchisee_partners_franchisee_merchant_id_key" ON "franchisee_partners"("franchisee_merchant_id");
CREATE UNIQUE INDEX "franchisee_partners_join_code_key" ON "franchisee_partners"("join_code");
CREATE INDEX "franchisee_partners_franchisor_merchant_id_idx" ON "franchisee_partners"("franchisor_merchant_id");
ALTER TABLE "franchisee_partners" ADD CONSTRAINT "franchisee_partners_franchisor_merchant_id_fkey"
  FOREIGN KEY ("franchisor_merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchisee_partners" ADD CONSTRAINT "franchisee_partners_franchisee_merchant_id_fkey"
  FOREIGN KEY ("franchisee_merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "franchisee_partner_statements" (
  "id" TEXT NOT NULL,
  "partner_id" TEXT NOT NULL,
  "franchisor_merchant_id" TEXT NOT NULL,
  "franchisee_merchant_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "gross_sales" INTEGER NOT NULL,
  "royalty_due" INTEGER NOT NULL,
  "fee_due" INTEGER NOT NULL,
  "total_due" INTEGER NOT NULL,
  "status" "RoyaltyStatementStatus" NOT NULL DEFAULT 'draft',
  "issued_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "franchisee_partner_statements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchisee_partner_statements_partner_id_period_start_key"
  ON "franchisee_partner_statements"("partner_id", "period_start");
CREATE INDEX "franchisee_partner_statements_franchisor_merchant_id_period_st_idx"
  ON "franchisee_partner_statements"("franchisor_merchant_id", "period_start");
CREATE INDEX "franchisee_partner_statements_franchisee_merchant_id_idx"
  ON "franchisee_partner_statements"("franchisee_merchant_id");
ALTER TABLE "franchisee_partner_statements" ADD CONSTRAINT "franchisee_partner_statements_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "franchisee_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
