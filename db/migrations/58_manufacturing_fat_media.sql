BEGIN;
ALTER TABLE "ManufacturingFatEvidence"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "filename" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "size" INTEGER;
ALTER TABLE "ManufacturingFatEvidence" ADD CONSTRAINT "ManufacturingFatEvidence_media_check" CHECK (
  ("storageKey" IS NULL AND "filename" IS NULL AND "mimeType" IS NULL AND "size" IS NULL)
  OR ("storageKey" IS NOT NULL AND "filename" IS NOT NULL AND "mimeType" IS NOT NULL AND "size" IS NOT NULL AND "mimeType" IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime') AND "size" > 0 AND "size" <= 52428800)
);
CREATE UNIQUE INDEX "ManufacturingFatEvidence_storageKey_key" ON "ManufacturingFatEvidence"("storageKey");
COMMIT;
