DO $$ BEGIN
  CREATE TYPE "ManufacturingInspectionStatus" AS ENUM ('PENDING', 'PARTIAL', 'QUARANTINED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ManufacturingInspectionDecisionType" AS ENUM ('ACCEPT', 'REJECT', 'QUARANTINE', 'ACCEPT_FROM_QUARANTINE', 'REJECT_FROM_QUARANTINE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ManufacturingSupplyDelivery' AND column_name = 'inspectionStatus'
  ) THEN
    ALTER TABLE "ManufacturingSupplyDelivery"
      ADD COLUMN "acceptedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
      ADD COLUMN "rejectedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
      ADD COLUMN "quarantinedQuantity" decimal(18,6) NOT NULL DEFAULT 0,
      ADD COLUMN "inspectionStatus" "ManufacturingInspectionStatus" NOT NULL DEFAULT 'PENDING',
      ADD COLUMN "lockVersion" integer NOT NULL DEFAULT 1;

    UPDATE "ManufacturingSupplyDelivery"
      SET "acceptedQuantity" = "quantity", "inspectionStatus" = 'CLOSED';
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyDelivery" ADD CONSTRAINT "ManufacturingSupplyDelivery_inspection_quantity_check" CHECK (
    "acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0 AND "quarantinedQuantity" >= 0
    AND "acceptedQuantity" + "rejectedQuantity" + "quarantinedQuantity" <= "quantity"
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyDelivery" ADD CONSTRAINT "ManufacturingSupplyDelivery_lock_check" CHECK ("lockVersion" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingInspectionDecision" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "supplyDeliveryId" text NOT NULL,
  "decisionType" "ManufacturingInspectionDecisionType" NOT NULL,
  "quantity" decimal(18,6) NOT NULL,
  "inspectedAt" timestamp(3) NOT NULL,
  "reference" text,
  "notes" text,
  "inspectedByUserId" text NOT NULL,
  "inspectedByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingInspectionDecision_quantity_check" CHECK ("quantity" > 0)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingInspectionDecision" ADD CONSTRAINT "ManufacturingInspectionDecision_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingInspectionDecision" ADD CONSTRAINT "ManufacturingInspectionDecision_deliveryId_fkey"
    FOREIGN KEY ("supplyDeliveryId") REFERENCES "ManufacturingSupplyDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ManufacturingInspectionDecision_tenant_delivery_inspected_idx"
  ON "ManufacturingInspectionDecision" ("tenantId", "supplyDeliveryId", "inspectedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingInspectionDecision_tenant_type_inspected_idx"
  ON "ManufacturingInspectionDecision" ("tenantId", "decisionType", "inspectedAt" DESC);
