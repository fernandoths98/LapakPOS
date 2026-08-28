-- Phase 1: foundation for multi-outlet inventory.
--
-- No behaviour change yet. The app keeps reading products.stock_qty; this
-- migration only (a) gives outlets a type/timezone/active flag, (b) hardens
-- categories against duplicates, and (c) creates + backfills a per-outlet
-- inventory table that Phase 2 will switch reads over to.

-- ── 1. Outlet: owned vs franchise, timezone, active flag ────────────────────
CREATE TYPE "OutletType" AS ENUM ('owned', 'franchise');

ALTER TABLE "outlets"
  ADD COLUMN "type" "OutletType" NOT NULL DEFAULT 'owned',
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- ── 2. Categories: merge accidental duplicates, then enforce uniqueness ─────
-- Repoint every product that used a duplicate category row to the surviving
-- (lowest-id) row for that (merchant, lower(name)) pair, then drop the extras.
-- Production currently has no duplicates; this is defensive for other envs.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY merchant_id, lower(name) ORDER BY id) AS keep_id
  FROM "categories"
)
UPDATE "products" p
SET "category_id" = r.keep_id
FROM ranked r
WHERE p."category_id" = r.id AND r.id <> r.keep_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY merchant_id, lower(name) ORDER BY id) AS keep_id
  FROM "categories"
)
DELETE FROM "categories" c
USING ranked r
WHERE c.id = r.id AND r.id <> r.keep_id;

CREATE UNIQUE INDEX "categories_merchant_id_name_key" ON "categories"("merchant_id", "name");

-- ── 3. Per-outlet inventory table ─────────────────────────────────────────
CREATE TABLE "outlet_products" (
  "id" TEXT NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "stock_qty" INTEGER NOT NULL DEFAULT 0,
  "low_stock_threshold" INTEGER NOT NULL DEFAULT 8,
  "price_override" INTEGER,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outlet_products_pkey" PRIMARY KEY ("id")
);

-- This table is backend-only. Prisma uses the trusted database role;
-- anonymous/authenticated Data API clients must not read tenant inventory.
ALTER TABLE "outlet_products" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "outlet_products_outlet_id_product_id_key"
  ON "outlet_products"("outlet_id", "product_id");
CREATE INDEX "outlet_products_outlet_id_idx" ON "outlet_products"("outlet_id");

ALTER TABLE "outlet_products"
  ADD CONSTRAINT "outlet_products_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outlet_products"
  ADD CONSTRAINT "outlet_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Backfill: current catalog -> each merchant's primary outlet ─────────
-- One row per product, at the merchant's primary outlet (falling back to its
-- earliest outlet), carrying the product's current stock and threshold. A
-- soft-deleted product still gets a row, marked unavailable.
INSERT INTO "outlet_products"
  ("id", "outlet_id", "product_id", "stock_qty", "low_stock_threshold", "is_available", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  o.id,
  p.id,
  p."stock_qty",
  p."low_stock_threshold",
  (p."deleted_at" IS NULL),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "products" p
JOIN LATERAL (
  SELECT id FROM "outlets"
  WHERE "merchant_id" = p."merchant_id"
  ORDER BY "is_primary" DESC, "created_at" ASC
  LIMIT 1
) o ON true;
