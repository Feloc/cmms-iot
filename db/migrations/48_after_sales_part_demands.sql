DO $$ BEGIN
  CREATE TYPE "ManufacturingOrderType" AS ENUM ('EQUIPMENT','SPARE_PART','REWORK','PROTOTYPE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "InventoryMovementSource" ADD VALUE IF NOT EXISTS 'MANUFACTURING';

DO $$ BEGIN
  CREATE TYPE "AfterSalesPartDemandStatus" AS ENUM ('VALIDATED','SOURCING','IN_PRODUCTION','QUALITY_PENDING','READY','PARTIALLY_FULFILLED','FULFILLED','ON_HOLD','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AfterSalesReplacementReason" AS ENUM ('NORMAL_WEAR','PREMATURE_FAILURE','ACCIDENTAL_DAMAGE','DESIGN_DEFECT','TRANSPORT_DAMAGE','MISUSE','UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AfterSalesCoverageStatus" AS ENUM ('PENDING_REVIEW','WARRANTY_APPROVED','WARRANTY_REJECTED','CUSTOMER_BILLABLE','GOODWILL','INTERNAL_COST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ManufacturingOrder"
  ADD COLUMN IF NOT EXISTS "orderType" "ManufacturingOrderType" NOT NULL DEFAULT 'EQUIPMENT',
  ADD COLUMN IF NOT EXISTS "outputInventoryItemId" text;

DO $$ BEGIN
  ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_outputInventoryItemId_fkey"
    FOREIGN KEY ("outputInventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AfterSalesPartDemand" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "serviceOrderId" text NOT NULL,
  "serviceOrderPartId" text NOT NULL,
  "assetId" text NOT NULL,
  "inventoryItemId" text NOT NULL,
  "sourceManufacturingOrderId" text,
  "manufacturingOrderId" text,
  "status" "AfterSalesPartDemandStatus" NOT NULL DEFAULT 'VALIDATED',
  "replacementReason" "AfterSalesReplacementReason" NOT NULL DEFAULT 'UNKNOWN',
  "coverageStatus" "AfterSalesCoverageStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "supplyRoute" "SupplyType" NOT NULL,
  "requestedQuantity" decimal(18,6) NOT NULL,
  "fulfilledQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "installedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "requiredAt" timestamp(3),
  "notes" text,
  "holdReason" text,
  "canceledReason" text,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "updatedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AfterSalesPartDemand_values_check" CHECK (
    "requestedQuantity" > 0 AND
    "fulfilledQuantity" >= 0 AND
    "fulfilledQuantity" <= "requestedQuantity" AND
    "installedQuantity" >= 0 AND
    "installedQuantity" <= "requestedQuantity" AND
    "lockVersion" >= 1
  )
);

ALTER TABLE "ServiceOrderPart" ADD COLUMN IF NOT EXISTS "installedFromAfterSalesDemandId" text;

CREATE TABLE IF NOT EXISTS "ManufacturingOutputReceipt" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "inventoryItemId" text NOT NULL,
  "inventoryStockId" text NOT NULL,
  "quantity" decimal(18,6) NOT NULL,
  "warehouseSnapshot" text NOT NULL,
  "binLocationSnapshot" text,
  "reference" text,
  "notes" text,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingOutputReceipt_quantity_check" CHECK ("quantity" > 0)
);

DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_serviceOrderPartId_fkey" FOREIGN KEY ("serviceOrderPartId") REFERENCES "ServiceOrderPart"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_sourceManufacturingOrderId_fkey" FOREIGN KEY ("sourceManufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "AfterSalesPartDemand" ADD CONSTRAINT "AfterSalesPartDemand_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ServiceOrderPart" ADD CONSTRAINT "ServiceOrderPart_installedFromAfterSalesDemandId_fkey" FOREIGN KEY ("installedFromAfterSalesDemandId") REFERENCES "AfterSalesPartDemand"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingOutputReceipt" ADD CONSTRAINT "ManufacturingOutputReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingOutputReceipt" ADD CONSTRAINT "ManufacturingOutputReceipt_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingOutputReceipt" ADD CONSTRAINT "ManufacturingOutputReceipt_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingOutputReceipt" ADD CONSTRAINT "ManufacturingOutputReceipt_inventoryStockId_fkey" FOREIGN KEY ("inventoryStockId") REFERENCES "InventoryStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AfterSalesPartDemand_serviceOrderPartId_key" ON "AfterSalesPartDemand" ("serviceOrderPartId");
CREATE INDEX IF NOT EXISTS "AfterSalesPartDemand_tenantId_serviceOrderId_status_idx" ON "AfterSalesPartDemand" ("tenantId","serviceOrderId","status");
CREATE INDEX IF NOT EXISTS "AfterSalesPartDemand_tenantId_assetId_status_requiredAt_idx" ON "AfterSalesPartDemand" ("tenantId","assetId","status","requiredAt");
CREATE INDEX IF NOT EXISTS "AfterSalesPartDemand_tenantId_manufacturingOrderId_idx" ON "AfterSalesPartDemand" ("tenantId","manufacturingOrderId");
CREATE INDEX IF NOT EXISTS "AfterSalesPartDemand_tenantId_sourceManufacturingOrderId_idx" ON "AfterSalesPartDemand" ("tenantId","sourceManufacturingOrderId");
CREATE INDEX IF NOT EXISTS "AfterSalesPartDemand_tenantId_inventoryItemId_status_idx" ON "AfterSalesPartDemand" ("tenantId","inventoryItemId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_orderType_status_updatedAt_idx" ON "ManufacturingOrder" ("tenantId","orderType","status","updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_outputInventoryItemId_idx" ON "ManufacturingOrder" ("tenantId","outputInventoryItemId");
CREATE INDEX IF NOT EXISTS "ServiceOrderPart_tenantId_installedFromAfterSalesDemandId_idx" ON "ServiceOrderPart" ("tenantId","installedFromAfterSalesDemandId");
CREATE INDEX IF NOT EXISTS "ManufacturingOutputReceipt_tenantId_manufacturingOrderId_createdAt_idx" ON "ManufacturingOutputReceipt" ("tenantId","manufacturingOrderId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingOutputReceipt_tenantId_inventoryItemId_createdAt_idx" ON "ManufacturingOutputReceipt" ("tenantId","inventoryItemId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingOutputReceipt_tenantId_inventoryStockId_createdAt_idx" ON "ManufacturingOutputReceipt" ("tenantId","inventoryStockId","createdAt" DESC);
