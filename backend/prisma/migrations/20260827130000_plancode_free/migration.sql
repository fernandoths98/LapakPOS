-- Phase 2b: the freemium "free forever, limited" plan.
-- Postgres won't let a new enum value be USED in the same transaction it is
-- ADDed in, so this migration only adds it; the default/backfill that
-- references 'free' is the next migration.
ALTER TYPE "PlanCode" ADD VALUE IF NOT EXISTS 'free' BEFORE 'starter';
