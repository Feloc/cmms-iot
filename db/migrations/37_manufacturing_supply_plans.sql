DO $$ BEGIN
  CREATE TYPE "ManufacturingSupplyPlanStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'COMPLETED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ManufacturingSupplyRequirementStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PARTIAL', 'FULFILLED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingSupplyPlan" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "engineeringReleaseId" text NOT NULL,
  "status" "ManufacturingSupplyPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "lockVersion" integer NOT NULL DEFAULT 1,
  "releaseCodeSnapshot" text NOT NULL,
  "bomCodeSnapshot" text NOT NULL,
  "bomRevisionCodeSnapshot" text NOT NULL,
  "orderQuantitySnapshot" integer NOT NULL,
  "generatedByUserId" text NOT NULL,
  "generatedByName" text NOT NULL,
  "generatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSupplyPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingSupplyPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyPlan_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyPlan_engineeringReleaseId_fkey" FOREIGN KEY ("engineeringReleaseId") REFERENCES "EngineeringRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyPlan_lock_version_check" CHECK ("lockVersion" > 0),
  CONSTRAINT "ManufacturingSupplyPlan_order_quantity_check" CHECK ("orderQuantitySnapshot" > 0)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSupplyRequirement" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "supplyPlanId" text NOT NULL,
  "bomLineId" text NOT NULL,
  "inventoryItemId" text,
  "positionSnapshot" integer NOT NULL,
  "levelSnapshot" integer NOT NULL,
  "itemCodeSnapshot" text NOT NULL,
  "descriptionSnapshot" text NOT NULL,
  "uomSnapshot" text NOT NULL,
  "quantityPerUnitSnapshot" decimal(18,6) NOT NULL,
  "orderQuantitySnapshot" integer NOT NULL,
  "requiredQuantity" decimal(18,6) NOT NULL,
  "isOptionalSnapshot" boolean NOT NULL,
  "included" boolean NOT NULL,
  "engineeringSupplyType" "SupplyType" NOT NULL,
  "plannedSupplyType" "SupplyType" NOT NULL,
  "criticalitySnapshot" "PartCriticality" NOT NULL,
  "stockOnHandSnapshot" decimal(18,6) NOT NULL,
  "stockReservedSnapshot" decimal(18,6) NOT NULL,
  "stockAvailableSnapshot" decimal(18,6) NOT NULL,
  "stockCoveredQuantity" decimal(18,6) NOT NULL,
  "plannedQuantity" decimal(18,6) NOT NULL,
  "fulfilledQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "status" "ManufacturingSupplyRequirementStatus" NOT NULL DEFAULT 'OPEN',
  "supplier" text,
  "externalReference" text,
  "expectedAt" timestamp(3),
  "notes" text,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "updatedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSupplyRequirement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingSupplyRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyRequirement_supplyPlanId_fkey" FOREIGN KEY ("supplyPlanId") REFERENCES "ManufacturingSupplyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyRequirement_bomLineId_fkey" FOREIGN KEY ("bomLineId") REFERENCES "ManufacturingBomLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyRequirement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingSupplyRequirement_quantities_check" CHECK (
    "quantityPerUnitSnapshot" > 0 AND "orderQuantitySnapshot" > 0 AND "requiredQuantity" > 0 AND
    "stockOnHandSnapshot" >= 0 AND "stockReservedSnapshot" >= 0 AND "stockAvailableSnapshot" >= 0 AND
    "stockCoveredQuantity" >= 0 AND "plannedQuantity" >= 0 AND "fulfilledQuantity" >= 0
  ),
  CONSTRAINT "ManufacturingSupplyRequirement_structure_check" CHECK ("positionSnapshot" > 0 AND "levelSnapshot" >= 0),
  CONSTRAINT "ManufacturingSupplyRequirement_lock_version_check" CHECK ("lockVersion" > 0)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyPlan" ADD CONSTRAINT "ManufacturingSupplyPlan_lock_version_check" CHECK ("lockVersion" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyPlan" ADD CONSTRAINT "ManufacturingSupplyPlan_order_quantity_check" CHECK ("orderQuantitySnapshot" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyRequirement" ADD CONSTRAINT "ManufacturingSupplyRequirement_quantities_check" CHECK (
    "quantityPerUnitSnapshot" > 0 AND "orderQuantitySnapshot" > 0 AND "requiredQuantity" > 0 AND
    "stockOnHandSnapshot" >= 0 AND "stockReservedSnapshot" >= 0 AND "stockAvailableSnapshot" >= 0 AND
    "stockCoveredQuantity" >= 0 AND "plannedQuantity" >= 0 AND "fulfilledQuantity" >= 0
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyRequirement" ADD CONSTRAINT "ManufacturingSupplyRequirement_structure_check" CHECK ("positionSnapshot" > 0 AND "levelSnapshot" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyRequirement" ADD CONSTRAINT "ManufacturingSupplyRequirement_lock_version_check" CHECK ("lockVersion" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSupplyPlan_engineeringReleaseId_key" ON "ManufacturingSupplyPlan"("engineeringReleaseId");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyPlan_tenant_order_status_generated_idx" ON "ManufacturingSupplyPlan"("tenantId", "manufacturingOrderId", "status", "generatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyPlan_tenant_status_updated_idx" ON "ManufacturingSupplyPlan"("tenantId", "status", "updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSupplyRequirement_plan_line_key" ON "ManufacturingSupplyRequirement"("supplyPlanId", "bomLineId");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyRequirement_tenant_plan_status_pos_idx" ON "ManufacturingSupplyRequirement"("tenantId", "supplyPlanId", "status", "positionSnapshot");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyRequirement_tenant_type_status_expected_idx" ON "ManufacturingSupplyRequirement"("tenantId", "plannedSupplyType", "status", "expectedAt");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyRequirement_tenant_inventory_status_idx" ON "ManufacturingSupplyRequirement"("tenantId", "inventoryItemId", "status");
