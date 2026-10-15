BEGIN;
CREATE TABLE IF NOT EXISTS "EngineeringManufacturingOrder" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT,
  "requestId" text NOT NULL REFERENCES "EngineeringRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revisionId" text NOT NULL REFERENCES "EngineeringRequestRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "manufacturingOrderId" text NOT NULL REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdByUserId" text NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringManufacturingOrder_manufacturingOrderId_key" ON "EngineeringManufacturingOrder"("manufacturingOrderId");
CREATE INDEX IF NOT EXISTS "EngineeringManufacturingOrder_tenantId_requestId_idx" ON "EngineeringManufacturingOrder"("tenantId", "requestId");
COMMIT;
