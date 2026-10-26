-- Preserve reference-only documents while allowing authenticated file attachments.
ALTER TABLE "ManufacturingDispatchDocument"
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "filename" TEXT,
  ADD COLUMN IF NOT EXISTS "mimeType" TEXT,
  ADD COLUMN IF NOT EXISTS "size" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchDocument_storageKey_key"
  ON "ManufacturingDispatchDocument" ("storageKey");
