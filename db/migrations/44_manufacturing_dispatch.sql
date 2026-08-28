DO $$ BEGIN CREATE TYPE "ManufacturingDispatchStatus" AS ENUM ('DRAFT','PREPARING','READY','AUTHORIZED','DISPATCHED','DELIVERED','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingDispatchChecklistStatus" AS ENUM ('PENDING','COMPLETED','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingDispatchPackageType" AS ENUM ('CRATE','PALLET','BOX','LOOSE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingDispatchDocumentType" AS ENUM ('PACKING_LIST','TRANSPORT_DOCUMENT','COMMERCIAL_INVOICE','INSURANCE','CERTIFICATE','MANUAL','FAT_REPORT','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingDispatch" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "manufacturingOrderId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL, "fatExecutionId" text NOT NULL, "dispatchCode" text NOT NULL,
  "status" "ManufacturingDispatchStatus" NOT NULL DEFAULT 'DRAFT', "lockVersion" integer NOT NULL DEFAULT 1,
  "serialNumberSnapshot" text, "destination" text, "deliveryAddress" text, "contactName" text, "contactPhone" text,
  "responsibleUserId" text NOT NULL, "responsibleName" text NOT NULL, "carrierName" text, "carrierReference" text,
  "driverName" text, "vehiclePlate" text, "trackingNumber" text, "plannedDispatchAt" timestamp(3),
  "authorizedAt" timestamp(3), "authorizedByUserId" text, "authorizedByName" text, "authorizedByRole" text,
  "dispatchedAt" timestamp(3), "dispatchedByUserId" text, "dispatchedByName" text,
  "deliveredAt" timestamp(3), "receivedByName" text, "deliveryProofReference" text,
  "canceledAt" timestamp(3), "canceledReason" text, "notes" text,
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingDispatch_values_check" CHECK ("lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingDispatchChecklistItem" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "dispatchId" text NOT NULL, "position" integer NOT NULL,
  "name" text NOT NULL, "description" text, "required" boolean NOT NULL DEFAULT true,
  "evidenceRequired" boolean NOT NULL DEFAULT false,
  "status" "ManufacturingDispatchChecklistStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceReference" text, "notes" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "completedAt" timestamp(3), "completedByUserId" text, "completedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingDispatchChecklistItem_values_check" CHECK ("position" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingDispatchPackage" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "dispatchId" text NOT NULL, "sequence" integer NOT NULL,
  "packageCode" text NOT NULL, "packageType" "ManufacturingDispatchPackageType" NOT NULL,
  "description" text NOT NULL, "lengthCm" decimal(18,3), "widthCm" decimal(18,3), "heightCm" decimal(18,3),
  "netWeightKg" decimal(18,3), "grossWeightKg" decimal(18,3) NOT NULL, "serialNumber" text,
  "sealNumber" text, "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingDispatchPackage_values_check" CHECK (
    "sequence" >= 1 AND "grossWeightKg" > 0 AND ("netWeightKg" IS NULL OR ("netWeightKg" > 0 AND "netWeightKg" <= "grossWeightKg"))
    AND ("lengthCm" IS NULL OR "lengthCm" > 0) AND ("widthCm" IS NULL OR "widthCm" > 0) AND ("heightCm" IS NULL OR "heightCm" > 0)
  )
);

CREATE TABLE IF NOT EXISTS "ManufacturingDispatchDocument" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "dispatchId" text NOT NULL,
  "documentType" "ManufacturingDispatchDocumentType" NOT NULL, "title" text NOT NULL,
  "reference" text, "url" text, "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN ALTER TABLE "ManufacturingDispatch" ADD CONSTRAINT "ManufacturingDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatch" ADD CONSTRAINT "ManufacturingDispatch_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatch" ADD CONSTRAINT "ManufacturingDispatch_manufacturedUnitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatch" ADD CONSTRAINT "ManufacturingDispatch_fatExecutionId_fkey" FOREIGN KEY ("fatExecutionId") REFERENCES "ManufacturingFatExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchChecklistItem" ADD CONSTRAINT "ManufacturingDispatchChecklistItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchChecklistItem" ADD CONSTRAINT "ManufacturingDispatchChecklistItem_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ManufacturingDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchPackage" ADD CONSTRAINT "ManufacturingDispatchPackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchPackage" ADD CONSTRAINT "ManufacturingDispatchPackage_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ManufacturingDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchDocument" ADD CONSTRAINT "ManufacturingDispatchDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingDispatchDocument" ADD CONSTRAINT "ManufacturingDispatchDocument_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ManufacturingDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatch_manufacturedUnitId_key" ON "ManufacturingDispatch" ("manufacturedUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatch_fatExecutionId_key" ON "ManufacturingDispatch" ("fatExecutionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatch_tenantId_dispatchCode_key" ON "ManufacturingDispatch" ("tenantId","dispatchCode");
CREATE INDEX IF NOT EXISTS "ManufacturingDispatch_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingDispatch" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingDispatch_tenantId_status_plannedDispatchAt_idx" ON "ManufacturingDispatch" ("tenantId","status","plannedDispatchAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchChecklistItem_dispatchId_position_key" ON "ManufacturingDispatchChecklistItem" ("dispatchId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingDispatchChecklistItem_tenantId_dispatchId_status_position_idx" ON "ManufacturingDispatchChecklistItem" ("tenantId","dispatchId","status","position");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchPackage_dispatchId_sequence_key" ON "ManufacturingDispatchPackage" ("dispatchId","sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingDispatchPackage_tenantId_packageCode_key" ON "ManufacturingDispatchPackage" ("tenantId","packageCode");
CREATE INDEX IF NOT EXISTS "ManufacturingDispatchPackage_tenantId_dispatchId_sequence_idx" ON "ManufacturingDispatchPackage" ("tenantId","dispatchId","sequence");
CREATE INDEX IF NOT EXISTS "ManufacturingDispatchDocument_tenantId_dispatchId_documentType_createdAt_idx" ON "ManufacturingDispatchDocument" ("tenantId","dispatchId","documentType","createdAt" DESC);
