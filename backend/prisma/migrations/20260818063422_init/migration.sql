-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'cashier');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "TenderType" AS ENUM ('cash', 'qris', 'debit', 'split');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('completed', 'voided');

-- CreateEnum
CREATE TYPE "ExpenseSource" AS ENUM ('manual', 'ai_photo');

-- CreateEnum
CREATE TYPE "PpobCategory" AS ENUM ('electricity', 'mobile', 'water', 'health_insurance', 'ewallet', 'internet_tv');

-- CreateEnum
CREATE TYPE "PpobTransactionStatus" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "RecapKind" AS ENUM ('daily_story', 'ask_context');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "defaultPrinterName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "barcode" TEXT,
    "sell_price" INTEGER NOT NULL,
    "cost_price" INTEGER NOT NULL,
    "stock_qty" INTEGER NOT NULL,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 8,
    "image_url" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "old_cost" INTEGER NOT NULL,
    "new_cost" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_float" INTEGER NOT NULL,
    "counted_cash" INTEGER,
    "expected_cash" INTEGER,
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "tender_type" "TenderType" NOT NULL,
    "cash_amount" INTEGER NOT NULL,
    "qris_amount" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'completed',
    "created_offline" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line_items" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_price_snapshot" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_total" INTEGER NOT NULL,

    CONSTRAINT "sale_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "shift_id" TEXT,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "photo_url" TEXT,
    "source" "ExpenseSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppob_billers" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "category" "PpobCategory" NOT NULL,
    "margin_amount" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ppob_billers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppob_transactions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "biller_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "customer_number" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "bill_amount" INTEGER NOT NULL,
    "admin_fee" INTEGER NOT NULL,
    "margin_amount" INTEGER NOT NULL,
    "total_charged" INTEGER NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "status" "PpobTransactionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppob_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppob_commission_ledger" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "ppob_transaction_id" TEXT NOT NULL,
    "commission_amount" INTEGER NOT NULL,
    "deposit_delta" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ppob_commission_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recap_cache" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "recap_date" DATE NOT NULL,
    "kind" "RecapKind" NOT NULL,
    "prompt_input_json" JSONB NOT NULL,
    "response_json" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recap_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "products_merchant_id_name_idx" ON "products"("merchant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_merchant_id_barcode_key" ON "products"("merchant_id", "barcode");

-- CreateIndex
CREATE INDEX "shifts_merchant_id_status_idx" ON "shifts"("merchant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_client_id_key" ON "sales"("client_id");

-- CreateIndex
CREATE INDEX "sales_merchant_id_created_at_idx" ON "sales"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "sale_line_items_sale_id_idx" ON "sale_line_items"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "ppob_billers_merchant_id_code_key" ON "ppob_billers"("merchant_id", "code");

-- CreateIndex
CREATE INDEX "ppob_transactions_merchant_id_created_at_idx" ON "ppob_transactions"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ppob_commission_ledger_ppob_transaction_id_key" ON "ppob_commission_ledger"("ppob_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_recap_cache_merchant_id_recap_date_kind_key" ON "ai_recap_cache"("merchant_id", "recap_date", "kind");

-- CreateIndex
CREATE INDEX "ai_chat_messages_merchant_id_user_id_created_at_idx" ON "ai_chat_messages"("merchant_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_history" ADD CONSTRAINT "product_cost_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_items" ADD CONSTRAINT "sale_line_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line_items" ADD CONSTRAINT "sale_line_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_billers" ADD CONSTRAINT "ppob_billers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_transactions" ADD CONSTRAINT "ppob_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_transactions" ADD CONSTRAINT "ppob_transactions_biller_id_fkey" FOREIGN KEY ("biller_id") REFERENCES "ppob_billers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_transactions" ADD CONSTRAINT "ppob_transactions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_commission_ledger" ADD CONSTRAINT "ppob_commission_ledger_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ppob_commission_ledger" ADD CONSTRAINT "ppob_commission_ledger_ppob_transaction_id_fkey" FOREIGN KEY ("ppob_transaction_id") REFERENCES "ppob_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recap_cache" ADD CONSTRAINT "ai_recap_cache_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
