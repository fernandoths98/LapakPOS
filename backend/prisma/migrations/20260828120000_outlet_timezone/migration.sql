-- Phase 5 (penajaman): bucket each outlet's calendar days by a real IANA
-- timezone instead of the server's UTC day. Every outlet so far is Western
-- Indonesia (WIB); backfill to that and make the column non-null with a WIB
-- default so new outlets always carry one.
UPDATE "outlets" SET "timezone" = 'Asia/Jakarta' WHERE "timezone" IS NULL;

ALTER TABLE "outlets" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Jakarta';
ALTER TABLE "outlets" ALTER COLUMN "timezone" SET NOT NULL;
