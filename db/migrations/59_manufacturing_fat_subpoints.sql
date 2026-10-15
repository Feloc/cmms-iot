BEGIN;
ALTER TABLE "ManufacturingFatTemplateCase" ADD COLUMN "subpoints" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ManufacturingFatTemplateCase" ADD CONSTRAINT "ManufacturingFatTemplateCase_subpoints_array" CHECK (jsonb_typeof("subpoints") = 'array');
ALTER TABLE "ManufacturingFatCase"
  ADD COLUMN "parentCaseId" TEXT,
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'PROTOCOL',
  ADD COLUMN "addedByUserId" TEXT,
  ADD COLUMN "addedByName" TEXT,
  ADD COLUMN "additionReason" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidedByUserId" TEXT,
  ADD COLUMN "voidedByName" TEXT,
  ADD COLUMN "voidReason" TEXT;
ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_origin_check" CHECK (
  "origin" IN ('PROTOCOL', 'EXECUTION') AND ("origin" <> 'EXECUTION' OR ("parentCaseId" IS NOT NULL AND "addedByUserId" IS NOT NULL AND "additionReason" IS NOT NULL))
);
ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_void_check" CHECK (
  ("voidedAt" IS NULL AND "voidedByUserId" IS NULL AND "voidedByName" IS NULL AND "voidReason" IS NULL)
  OR ("voidedAt" IS NOT NULL AND "parentCaseId" IS NOT NULL AND "voidedByUserId" IS NOT NULL AND "voidedByName" IS NOT NULL AND "voidReason" IS NOT NULL)
);
CREATE UNIQUE INDEX "ManufacturingFatCase_tenant_execution_id_key" ON "ManufacturingFatCase"("tenantId", "executionId", "id");
CREATE INDEX "ManufacturingFatCase_parent_idx" ON "ManufacturingFatCase"("tenantId", "parentCaseId", "position");
ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_parent_scope_fkey" FOREIGN KEY ("tenantId", "executionId", "parentCaseId") REFERENCES "ManufacturingFatCase"("tenantId", "executionId", "id");
CREATE FUNCTION manufacturing_fat_subpoint_depth() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentCaseId" IS NOT NULL AND (
    NEW."parentCaseId" = NEW.id
    OR EXISTS (SELECT 1 FROM "ManufacturingFatCase" p WHERE p.id = NEW."parentCaseId" AND p."parentCaseId" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "ManufacturingFatCase" c WHERE c."parentCaseId" = NEW.id)
  ) THEN RAISE EXCEPTION 'FAT supports only one subpoint level'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ManufacturingFatCase_subpoint_depth" BEFORE INSERT OR UPDATE OF "parentCaseId" ON "ManufacturingFatCase" FOR EACH ROW EXECUTE FUNCTION manufacturing_fat_subpoint_depth();
COMMIT;
