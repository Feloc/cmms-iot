DO $$ BEGIN
  CREATE TYPE "ManufacturingStockReservationStatus" AS ENUM ('ACTIVE', 'PARTIAL', 'ISSUED', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingStockReservation" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "supplyRequirementId" text NOT NULL,
  "inventoryItemId" text NOT NULL,
  "inventoryStockId" text NOT NULL,
  "status" "ManufacturingStockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reservedQuantity" decimal(18,6) NOT NULL,
  "issuedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "releasedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "warehouseSnapshot" text,
  "binLocationSnapshot" text,
  "notes" text,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedByUserId" text,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingStockReservation_quantities_check" CHECK (
    "reservedQuantity" > 0 AND "issuedQuantity" >= 0 AND "releasedQuantity" >= 0
    AND "issuedQuantity" + "releasedQuantity" <= "reservedQuantity"
  ),
  CONSTRAINT "ManufacturingStockReservation_lockVersion_check" CHECK ("lockVersion" >= 1)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingStockReservation" ADD CONSTRAINT "ManufacturingStockReservation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingStockReservation" ADD CONSTRAINT "ManufacturingStockReservation_supplyRequirementId_fkey"
    FOREIGN KEY ("supplyRequirementId") REFERENCES "ManufacturingSupplyRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingStockReservation" ADD CONSTRAINT "ManufacturingStockReservation_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingStockReservation" ADD CONSTRAINT "ManufacturingStockReservation_inventoryStockId_fkey"
    FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ManufacturingStockReservation_tenant_requirement_status_created_idx"
  ON "ManufacturingStockReservation" ("tenantId", "supplyRequirementId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ManufacturingStockReservation_tenant_stock_status_idx"
  ON "ManufacturingStockReservation" ("tenantId", "inventoryStockId", "status");
CREATE INDEX IF NOT EXISTS "ManufacturingStockReservation_tenant_item_status_idx"
  ON "ManufacturingStockReservation" ("tenantId", "inventoryItemId", "status");
