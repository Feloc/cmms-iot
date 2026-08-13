ALTER TABLE "Attachment"
  ADD COLUMN IF NOT EXISTS "isAssetPhoto" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Attachment_tenantId_assetId_isAssetPhoto_idx"
  ON "Attachment" ("tenantId", "assetId", "isAssetPhoto");

CREATE UNIQUE INDEX IF NOT EXISTS "Attachment_one_photo_per_asset_idx"
  ON "Attachment" ("tenantId", "assetId")
  WHERE "isAssetPhoto" = true AND "assetId" IS NOT NULL;
