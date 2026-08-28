-- Phase 4: franchise agreements + royalty statements.

CREATE TYPE "FranchiseStatus" AS ENUM ('active', 'ended');
CREATE TYPE "RoyaltyStatementStatus" AS ENUM ('draft', 'issued', 'paid');

CREATE TABLE "franchise_agreements" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "royalty_percent" INTEGER NOT NULL DEFAULT 0,
  "fee_monthly" INTEGER NOT NULL DEFAULT 0,
  "allow_price_override" BOOLEAN NOT NULL DEFAULT false,
  "start_date" TIMESTAMP(3) NOT NULL,
  "status" "FranchiseStatus" NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "franchise_agreements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchise_agreements_outlet_id_key" ON "franchise_agreements"("outlet_id");
CREATE INDEX "franchise_agreements_merchant_id_idx" ON "franchise_agreements"("merchant_id");
ALTER TABLE "franchise_agreements" ADD CONSTRAINT "franchise_agreements_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_agreements" ADD CONSTRAINT "franchise_agreements_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "franchise_royalty_statements" (
  "id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "outlet_id" TEXT NOT NULL,
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
  CONSTRAINT "franchise_royalty_statements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "franchise_royalty_statements_agreement_id_period_start_key"
  ON "franchise_royalty_statements"("agreement_id", "period_start");
CREATE INDEX "franchise_royalty_statements_merchant_id_period_start_idx"
  ON "franchise_royalty_statements"("merchant_id", "period_start");
ALTER TABLE "franchise_royalty_statements" ADD CONSTRAINT "franchise_royalty_statements_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "franchise_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "franchise_royalty_statements" ADD CONSTRAINT "franchise_royalty_statements_merchant_id_fkey"
  FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
