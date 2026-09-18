-- Existing shops keep every feature they already use; new shops start in simple mode.
ALTER TABLE "merchants" ADD COLUMN "features" TEXT[] NOT NULL DEFAULT ARRAY['ppob', 'shift', 'outlets', 'staff', 'ai', 'advancedTender']::TEXT[];
ALTER TABLE "merchants" ALTER COLUMN "features" SET DEFAULT ARRAY[]::TEXT[];
