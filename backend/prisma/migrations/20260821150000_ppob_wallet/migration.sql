CREATE TYPE "WalletEntryType" AS ENUM ('topup_credit', 'ppob_debit', 'ppob_refund', 'adjustment');
CREATE TYPE "WalletTopupStatus" AS ENUM ('pending', 'paid', 'expired', 'failed');

CREATE TABLE "merchant_wallets" (
  "merchant_id" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchant_wallets_pkey" PRIMARY KEY ("merchant_id")
);

CREATE TABLE "wallet_ledger_entries" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "type" "WalletEntryType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reference" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_topups" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "partner_ref" TEXT NOT NULL,
  "provider_ref" TEXT,
  "qr_content" TEXT NOT NULL,
  "status" "WalletTopupStatus" NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_topups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ppob_transactions" ADD COLUMN "wallet_debit_amount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ppob_transactions" ADD COLUMN "wallet_reference" TEXT;

CREATE UNIQUE INDEX "wallet_ledger_entries_reference_key" ON "wallet_ledger_entries"("reference");
CREATE INDEX "wallet_ledger_entries_merchant_id_created_at_idx" ON "wallet_ledger_entries"("merchant_id", "created_at");
CREATE UNIQUE INDEX "wallet_topups_partner_ref_key" ON "wallet_topups"("partner_ref");
CREATE INDEX "wallet_topups_merchant_id_created_at_idx" ON "wallet_topups"("merchant_id", "created_at");
CREATE UNIQUE INDEX "ppob_transactions_wallet_reference_key" ON "ppob_transactions"("wallet_reference");

ALTER TABLE "merchant_wallets" ADD CONSTRAINT "merchant_wallets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "wallet_topups" ADD CONSTRAINT "wallet_topups_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
