DO $$ BEGIN
  CREATE TYPE "ManufacturingSupplyRequestStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'PARTIAL', 'COMPLETED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingSupplyRequest" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "supplyRequirementId" text NOT NULL,
  "sequence" integer NOT NULL,
  "requestCode" text NOT NULL,
  "requestType" "SupplyType" NOT NULL,
  "status" "ManufacturingSupplyRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedQuantity" decimal(18,6) NOT NULL,
  "deliveredQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "canceledQuantity" decimal(18,6) NOT NULL DEFAULT 0,
  "supplierOrResponsible" text,
  "externalReference" text,
  "promisedAt" timestamp(3),
  "notes" text,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "requestedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" timestamp(3),
  "canceledAt" timestamp(3),
  "updatedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSupplyRequest_quantity_check" CHECK (
    "requestedQuantity" > 0 AND "deliveredQuantity" >= 0 AND "canceledQuantity" >= 0
    AND "deliveredQuantity" + "canceledQuantity" <= "requestedQuantity"
  ),
  CONSTRAINT "ManufacturingSupplyRequest_type_check" CHECK ("requestType" IN ('BUY', 'MAKE', 'SUBCONTRACT')),
  CONSTRAINT "ManufacturingSupplyRequest_sequence_check" CHECK ("sequence" >= 1),
  CONSTRAINT "ManufacturingSupplyRequest_lock_check" CHECK ("lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSupplyDelivery" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "supplyRequestId" text NOT NULL,
  "quantity" decimal(18,6) NOT NULL,
  "deliveredAt" timestamp(3) NOT NULL,
  "reference" text,
  "notes" text,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSupplyDelivery_quantity_check" CHECK ("quantity" > 0)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyRequest" ADD CONSTRAINT "ManufacturingSupplyRequest_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyRequest" ADD CONSTRAINT "ManufacturingSupplyRequest_supplyRequirementId_fkey"
    FOREIGN KEY ("supplyRequirementId") REFERENCES "ManufacturingSupplyRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyDelivery" ADD CONSTRAINT "ManufacturingSupplyDelivery_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingSupplyDelivery" ADD CONSTRAINT "ManufacturingSupplyDelivery_supplyRequestId_fkey"
    FOREIGN KEY ("supplyRequestId") REFERENCES "ManufacturingSupplyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSupplyRequest_supplyRequirementId_sequence_key"
  ON "ManufacturingSupplyRequest" ("supplyRequirementId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSupplyRequest_tenantId_requestCode_key"
  ON "ManufacturingSupplyRequest" ("tenantId", "requestCode");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyRequest_tenantId_requestType_status_promisedAt_idx"
  ON "ManufacturingSupplyRequest" ("tenantId", "requestType", "status", "promisedAt");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyRequest_tenantId_supplyRequirementId_status_idx"
  ON "ManufacturingSupplyRequest" ("tenantId", "supplyRequirementId", "status");
CREATE INDEX IF NOT EXISTS "ManufacturingSupplyDelivery_tenantId_supplyRequestId_deliveredAt_idx"
  ON "ManufacturingSupplyDelivery" ("tenantId", "supplyRequestId", "deliveredAt" DESC);
