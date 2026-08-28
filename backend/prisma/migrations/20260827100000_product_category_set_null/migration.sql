-- Phase 0: make the schema's ON DELETE behaviour for products.category_id
-- explicit. The init migration already created this FK as ON DELETE SET NULL,
-- but schema.prisma never declared `onDelete`, so `prisma migrate` saw drift.
-- This re-asserts the existing behaviour (a removed category leaves its
-- products uncategorized, still reachable via the "Tanpa kategori" filter)
-- and is a no-op on any database already created by the init migration.
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_category_id_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
