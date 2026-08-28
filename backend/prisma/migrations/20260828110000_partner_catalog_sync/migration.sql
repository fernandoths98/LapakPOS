-- Phase 5b: track when a franchisor last pushed its catalog to a franchisee tenant.
ALTER TABLE "franchisee_partners" ADD COLUMN "last_catalog_sync_at" TIMESTAMP(3);
