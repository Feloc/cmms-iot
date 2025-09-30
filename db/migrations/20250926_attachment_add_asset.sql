-- === Migration: expand Attachment to support assets ===
-- Safe to run multiple times (drops constraints conditionally)
BEGIN;

-- 1) Make workOrderId nullable if it's NOT already
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Attachment' AND column_name='workOrderId' AND is_nullable='NO'
  ) THEN
    ALTER TABLE "Attachment" ALTER COLUMN "workOrderId" DROP NOT NULL;
  END IF;
END $$;

-- 2) Add assetId column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='Attachment' AND column_name='assetId'
  ) THEN
    ALTER TABLE "Attachment" ADD COLUMN "assetId" TEXT NULL;
  END IF;
END $$;

-- 3) Add FK to Asset (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_assetId_fkey'
  ) THEN
    ALTER TABLE "Attachment"
      ADD CONSTRAINT "Attachment_assetId_fkey"
      FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- 4) Optional CHECK: at least one of (workOrderId, assetId) must be non-null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachment_owner_not_null_ck'
  ) THEN
    ALTER TABLE "Attachment"
      ADD CONSTRAINT attachment_owner_not_null_ck
      CHECK (("workOrderId" IS NOT NULL) OR ("assetId" IS NOT NULL));
  END IF;
END $$;

-- 5) Indices to speed up listings
CREATE INDEX IF NOT EXISTS "idx_attachment_tenant_asset_createdAt"
  ON "Attachment" ("tenantId", "assetId", "createdAt" DESC);

-- RLS remains based on tenantId (no change required)
COMMIT;
