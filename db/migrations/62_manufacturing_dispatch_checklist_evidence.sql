-- Each packing checklist item can retain multiple authenticated attachments.
-- The composite relation prevents attachments from crossing tenant boundaries.
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchChecklistItem_tenantId_id_key"
  ON "ManufacturingDispatchChecklistItem" ("tenantId", "id");

CREATE TABLE IF NOT EXISTS "ManufacturingDispatchChecklistEvidence" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "checklistItemId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT,
  "storageKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingDispatchChecklistEvidence_size_check" CHECK ("size" > 0)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingDispatchChecklistEvidence"
    ADD CONSTRAINT "ManufacturingDispatchChecklistEvidence_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingDispatchChecklistEvidence"
    ADD CONSTRAINT "ManufacturingDispatchChecklistEvidence_tenant_item_fkey"
    FOREIGN KEY ("tenantId", "checklistItemId")
    REFERENCES "ManufacturingDispatchChecklistItem" ("tenantId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchChecklistEvidence_storageKey_key"
  ON "ManufacturingDispatchChecklistEvidence" ("storageKey");

CREATE INDEX IF NOT EXISTS "ManufacturingDispatchChecklistEvidence_tenant_item_created_idx"
  ON "ManufacturingDispatchChecklistEvidence" ("tenantId", "checklistItemId", "createdAt" DESC);
