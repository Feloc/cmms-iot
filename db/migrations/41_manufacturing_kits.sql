DO $$ BEGIN
  CREATE TYPE "ManufacturingKitStatus" AS ENUM ('DRAFT', 'PREPARING', 'READY', 'RELEASED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingKit" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "supplyPlanId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL,
  "kitCode" text NOT NULL,
  "name" text NOT NULL,
  "status" "ManufacturingKitStatus" NOT NULL DEFAULT 'DRAFT',
  "releaseCodeSnapshot" text NOT NULL,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "releasedAt" timestamp(3),
  "releasedByUserId" text,
  "releasedByName" text,
  "releaseNotes" text,
  "canceledAt" timestamp(3),
  "canceledReason" text,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingKit_lock_check" CHECK ("lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingKitLine" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "kitId" text NOT NULL,
  "supplyRequirementId" text NOT NULL,
  "positionSnapshot" integer NOT NULL,
  "itemCodeSnapshot" text NOT NULL,
  "descriptionSnapshot" text NOT NULL,
  "uomSnapshot" text NOT NULL,
  "requiredQuantity" decimal(18,6) NOT NULL,
  "allocatedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "waivedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "waiverReason" text,
  "waivedByUserId" text,
  "waivedByName" text,
  "waivedAt" timestamp(3),
  "lockVersion" integer NOT NULL DEFAULT 1,
  "updatedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingKitLine_quantities_check" CHECK (
    "requiredQuantity" > 0 AND "allocatedQuantity" >= 0 AND "waivedQuantity" >= 0
    AND "allocatedQuantity" + "waivedQuantity" <= "requiredQuantity"
  ),
  CONSTRAINT "ManufacturingKitLine_lock_check" CHECK ("lockVersion" >= 1)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingKit" ADD CONSTRAINT "ManufacturingKit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKit" ADD CONSTRAINT "ManufacturingKit_orderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKit" ADD CONSTRAINT "ManufacturingKit_supplyPlanId_fkey" FOREIGN KEY ("supplyPlanId") REFERENCES "ManufacturingSupplyPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKit" ADD CONSTRAINT "ManufacturingKit_unitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKitLine" ADD CONSTRAINT "ManufacturingKitLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKitLine" ADD CONSTRAINT "ManufacturingKitLine_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ManufacturingKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingKitLine" ADD CONSTRAINT "ManufacturingKitLine_requirementId_fkey" FOREIGN KEY ("supplyRequirementId") REFERENCES "ManufacturingSupplyRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingKit_plan_unit_key" ON "ManufacturingKit" ("supplyPlanId", "manufacturedUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingKit_tenant_code_key" ON "ManufacturingKit" ("tenantId", "kitCode");
CREATE INDEX IF NOT EXISTS "ManufacturingKit_tenant_order_status_idx" ON "ManufacturingKit" ("tenantId", "manufacturingOrderId", "status");
CREATE INDEX IF NOT EXISTS "ManufacturingKit_tenant_plan_status_idx" ON "ManufacturingKit" ("tenantId", "supplyPlanId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingKitLine_kit_requirement_key" ON "ManufacturingKitLine" ("kitId", "supplyRequirementId");
CREATE INDEX IF NOT EXISTS "ManufacturingKitLine_tenant_kit_position_idx" ON "ManufacturingKitLine" ("tenantId", "kitId", "positionSnapshot");
CREATE INDEX IF NOT EXISTS "ManufacturingKitLine_tenant_requirement_idx" ON "ManufacturingKitLine" ("tenantId", "supplyRequirementId");
