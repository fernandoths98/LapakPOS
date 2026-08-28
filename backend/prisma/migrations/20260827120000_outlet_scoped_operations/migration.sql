-- Phase 2a: scope operational records to an outlet.
--
-- Every shift, sale, expense and PPOB transaction gains a non-null outlet_id.
-- Backfill order matters: shifts first (from the acting user's outlet, else
-- the merchant's primary outlet), then sales/expenses/ppob from their shift.

-- helper expression reused below: a merchant's primary (else earliest) outlet
-- is inlined as a correlated subquery rather than a function.

-- ── shifts ────────────────────────────────────────────────────────────────
ALTER TABLE "shifts" ADD COLUMN "outlet_id" TEXT;

UPDATE "shifts" s SET "outlet_id" = COALESCE(
  (SELECT u."outlet_id" FROM "users" u WHERE u."id" = s."user_id"),
  (SELECT o."id" FROM "outlets" o WHERE o."merchant_id" = s."merchant_id"
     ORDER BY o."is_primary" DESC, o."created_at" ASC LIMIT 1)
);

ALTER TABLE "shifts" ALTER COLUMN "outlet_id" SET NOT NULL;
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "shifts_outlet_id_status_idx" ON "shifts"("outlet_id", "status");

-- ── sales ─────────────────────────────────────────────────────────────────
ALTER TABLE "sales" ADD COLUMN "outlet_id" TEXT;

UPDATE "sales" sa SET "outlet_id" =
  (SELECT sh."outlet_id" FROM "shifts" sh WHERE sh."id" = sa."shift_id");
UPDATE "sales" sa SET "outlet_id" =
  (SELECT o."id" FROM "outlets" o WHERE o."merchant_id" = sa."merchant_id"
     ORDER BY o."is_primary" DESC, o."created_at" ASC LIMIT 1)
  WHERE sa."outlet_id" IS NULL;

ALTER TABLE "sales" ALTER COLUMN "outlet_id" SET NOT NULL;
ALTER TABLE "sales" ADD CONSTRAINT "sales_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "sales_outlet_id_created_at_idx" ON "sales"("outlet_id", "created_at");

-- ── expenses ──────────────────────────────────────────────────────────────
ALTER TABLE "expenses" ADD COLUMN "outlet_id" TEXT;

UPDATE "expenses" e SET "outlet_id" = COALESCE(
  (SELECT sh."outlet_id" FROM "shifts" sh WHERE sh."id" = e."shift_id"),
  (SELECT o."id" FROM "outlets" o WHERE o."merchant_id" = e."merchant_id"
     ORDER BY o."is_primary" DESC, o."created_at" ASC LIMIT 1)
);

ALTER TABLE "expenses" ALTER COLUMN "outlet_id" SET NOT NULL;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "expenses_outlet_id_created_at_idx" ON "expenses"("outlet_id", "created_at");

-- ── ppob_transactions ─────────────────────────────────────────────────────
ALTER TABLE "ppob_transactions" ADD COLUMN "outlet_id" TEXT;

UPDATE "ppob_transactions" pt SET "outlet_id" =
  (SELECT sh."outlet_id" FROM "shifts" sh WHERE sh."id" = pt."shift_id");
UPDATE "ppob_transactions" pt SET "outlet_id" =
  (SELECT o."id" FROM "outlets" o WHERE o."merchant_id" = pt."merchant_id"
     ORDER BY o."is_primary" DESC, o."created_at" ASC LIMIT 1)
  WHERE pt."outlet_id" IS NULL;

ALTER TABLE "ppob_transactions" ALTER COLUMN "outlet_id" SET NOT NULL;
ALTER TABLE "ppob_transactions" ADD CONSTRAINT "ppob_transactions_outlet_id_fkey"
  FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "ppob_transactions_outlet_id_created_at_idx" ON "ppob_transactions"("outlet_id", "created_at");
