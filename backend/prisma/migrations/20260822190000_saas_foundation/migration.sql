-- SaaS foundation. Existing merchants remain valid and receive one primary outlet.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'stocker';

CREATE TYPE "BusinessType" AS ENUM ('retail', 'restaurant');
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled');
CREATE TYPE "PlanCode" AS ENUM ('starter', 'growth', 'pro');

ALTER TABLE "merchants"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "business_type" "BusinessType" NOT NULL DEFAULT 'retail',
  ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trial_ends_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

CREATE TABLE "outlets" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outlets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outlets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "outlets_merchant_id_code_key" ON "outlets"("merchant_id", "code");
CREATE INDEX "outlets_merchant_id_idx" ON "outlets"("merchant_id");

ALTER TABLE "users"
  ADD COLUMN "outlet_id" TEXT,
  ADD COLUMN "pin_hash" TEXT,
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "subscriptions" (
  "id" TEXT NOT NULL,
  "merchant_id" TEXT NOT NULL,
  "plan_code" "PlanCode" NOT NULL DEFAULT 'starter',
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
  "trial_ends_at" TIMESTAMP(3) NOT NULL,
  "current_period_ends_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subscriptions_merchant_id_key" ON "subscriptions"("merchant_id");

-- Backfill old production tenants without changing their operational data.
UPDATE "merchants"
SET "slug" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr("id", 1, 6),
    "onboarding_completed" = true,
    "trial_ends_at" = CURRENT_TIMESTAMP + INTERVAL '14 days';

INSERT INTO "outlets" ("id", "merchant_id", "name", "code", "address", "phone", "is_primary")
SELECT gen_random_uuid()::text, "id", "name", 'UTAMA', "address", "phone", true FROM "merchants";

UPDATE "users" u SET "outlet_id" = o."id"
FROM "outlets" o WHERE o."merchant_id" = u."merchant_id" AND o."is_primary" = true;

INSERT INTO "subscriptions" ("id", "merchant_id", "plan_code", "status", "trial_ends_at", "updated_at")
SELECT gen_random_uuid()::text, "id", 'starter', 'trialing', COALESCE("trial_ends_at", CURRENT_TIMESTAMP + INTERVAL '14 days'), CURRENT_TIMESTAMP
FROM "merchants";
