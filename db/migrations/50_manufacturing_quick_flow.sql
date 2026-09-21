ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "executionMode" text NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "AfterSalesPartDemand" ADD COLUMN IF NOT EXISTS "directDeliveredQuantity" decimal(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "AfterSalesPartDemand" ADD COLUMN IF NOT EXISTS "removedPartDisposition" jsonb;
ALTER TABLE "ServiceOrderPart" ADD COLUMN IF NOT EXISTS "directIssuedQuantity" decimal(18,6) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ManufacturingQuickProfile" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "inventoryItemId" text NOT NULL REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" integer NOT NULL CHECK ("revision" > 0), "status" text NOT NULL DEFAULT 'DRAFT',
  "recipe" jsonb NOT NULL, "validUntil" timestamp(3), "createdByUserId" text NOT NULL,
  "approvedByUserId" text, "approvedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingQuickProfile_status_check" CHECK ("status" IN ('DRAFT','APPROVED','RETIRED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingQuickProfile_tenantId_inventoryItemId_revision_key" ON "ManufacturingQuickProfile" ("tenantId","inventoryItemId","revision");
CREATE INDEX IF NOT EXISTS "ManufacturingQuickProfile_tenantId_inventoryItemId_status_idx" ON "ManufacturingQuickProfile" ("tenantId","inventoryItemId","status");
CREATE TABLE IF NOT EXISTS "ManufacturingQuickExecution" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "profileId" text NOT NULL REFERENCES "ManufacturingQuickProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "recipeSnapshot" jsonb NOT NULL, "state" jsonb NOT NULL,
  "lockVersion" integer NOT NULL DEFAULT 1 CHECK ("lockVersion" > 0),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingQuickExecution_manufacturingOrderId_key" ON "ManufacturingQuickExecution" ("manufacturingOrderId");
CREATE INDEX IF NOT EXISTS "ManufacturingQuickExecution_tenantId_manufacturingOrderId_idx" ON "ManufacturingQuickExecution" ("tenantId","manufacturingOrderId");
