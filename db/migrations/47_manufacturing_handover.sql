ALTER TYPE "ManufacturingOrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED' BEFORE 'ON_HOLD';
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS "completedAt" timestamp(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "maintenanceTransferredAt" timestamp(3);

DO $$ BEGIN CREATE TYPE "ManufacturingHandoverStatus" AS ENUM ('DRAFT','READY_FOR_DELIVERY','CLOSED','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingHandoverDocumentType" AS ENUM ('AS_BUILT_MECHANICAL','AS_BUILT_ELECTRICAL','SOFTWARE_BACKUP','FAT_REPORT','SAT_REPORT','OPERATION_MANUAL','MAINTENANCE_MANUAL','CERTIFICATES','WARRANTY','SPARE_PARTS_LIST','TRAINING_RECORD','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingHandoverItemStatus" AS ENUM ('PENDING','PROVIDED','WAIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingHandover" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "manufacturingOrderId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL, "siteDeploymentId" text NOT NULL, "satExecutionId" text NOT NULL,
  "assetId" text NOT NULL, "handoverCode" text NOT NULL,
  "status" "ManufacturingHandoverStatus" NOT NULL DEFAULT 'DRAFT', "trainingRequired" boolean NOT NULL DEFAULT true,
  "notes" text, "lockVersion" integer NOT NULL DEFAULT 1, "readyAt" timestamp(3), "closedAt" timestamp(3),
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingHandover_values_check" CHECK ("lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingHandoverDocument" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "handoverId" text NOT NULL, "position" integer NOT NULL,
  "documentType" "ManufacturingHandoverDocumentType" NOT NULL, "name" text NOT NULL, "required" boolean NOT NULL DEFAULT true,
  "status" "ManufacturingHandoverItemStatus" NOT NULL DEFAULT 'PENDING', "reference" text, "url" text,
  "revision" text, "notes" text, "waiverReason" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "providedAt" timestamp(3), "providedByUserId" text, "providedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingHandoverDocument_values_check" CHECK ("position" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingHandoverTraining" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "handoverId" text NOT NULL, "topic" text NOT NULL,
  "deliveredAt" timestamp(3) NOT NULL, "durationHours" decimal(8,2) NOT NULL, "instructorName" text NOT NULL,
  "clientContactName" text NOT NULL, "attendeeCount" integer NOT NULL, "evidenceReference" text NOT NULL,
  "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingHandoverTraining_values_check" CHECK ("durationHours" > 0 AND "attendeeCount" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingHandoverSpare" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "handoverId" text NOT NULL, "itemCode" text,
  "description" text NOT NULL, "quantity" decimal(18,6) NOT NULL, "unit" text NOT NULL,
  "recommendedStock" decimal(18,6), "notes" text, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingHandoverSpare_values_check" CHECK ("quantity" > 0 AND ("recommendedStock" IS NULL OR "recommendedStock" >= 0))
);

CREATE TABLE IF NOT EXISTS "ManufacturingHandoverAcceptance" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "handoverId" text NOT NULL,
  "clientName" text NOT NULL, "clientRole" text NOT NULL, "clientCompany" text, "clientSignature" text NOT NULL,
  "comments" text, "deliveredByUserId" text NOT NULL, "deliveredByName" text NOT NULL,
  "deliveredByRole" text NOT NULL, "signedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_manufacturedUnitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_siteDeploymentId_fkey" FOREIGN KEY ("siteDeploymentId") REFERENCES "ManufacturingSiteDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_satExecutionId_fkey" FOREIGN KEY ("satExecutionId") REFERENCES "ManufacturingSatExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandover" ADD CONSTRAINT "ManufacturingHandover_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverDocument" ADD CONSTRAINT "ManufacturingHandoverDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverDocument" ADD CONSTRAINT "ManufacturingHandoverDocument_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManufacturingHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverTraining" ADD CONSTRAINT "ManufacturingHandoverTraining_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverTraining" ADD CONSTRAINT "ManufacturingHandoverTraining_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManufacturingHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverSpare" ADD CONSTRAINT "ManufacturingHandoverSpare_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverSpare" ADD CONSTRAINT "ManufacturingHandoverSpare_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManufacturingHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverAcceptance" ADD CONSTRAINT "ManufacturingHandoverAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingHandoverAcceptance" ADD CONSTRAINT "ManufacturingHandoverAcceptance_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "ManufacturingHandover"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandover_manufacturedUnitId_key" ON "ManufacturingHandover" ("manufacturedUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandover_siteDeploymentId_key" ON "ManufacturingHandover" ("siteDeploymentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandover_satExecutionId_key" ON "ManufacturingHandover" ("satExecutionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandover_assetId_key" ON "ManufacturingHandover" ("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandover_tenantId_handoverCode_key" ON "ManufacturingHandover" ("tenantId","handoverCode");
CREATE INDEX IF NOT EXISTS "ManufacturingHandover_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingHandover" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingHandover_tenantId_status_updatedAt_idx" ON "ManufacturingHandover" ("tenantId","status","updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandoverDocument_handoverId_position_key" ON "ManufacturingHandoverDocument" ("handoverId","position");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandoverDocument_handoverId_documentType_key" ON "ManufacturingHandoverDocument" ("handoverId","documentType");
CREATE INDEX IF NOT EXISTS "ManufacturingHandoverDocument_tenantId_handoverId_status_position_idx" ON "ManufacturingHandoverDocument" ("tenantId","handoverId","status","position");
CREATE INDEX IF NOT EXISTS "ManufacturingHandoverTraining_tenantId_handoverId_deliveredAt_idx" ON "ManufacturingHandoverTraining" ("tenantId","handoverId","deliveredAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingHandoverSpare_tenantId_handoverId_description_idx" ON "ManufacturingHandoverSpare" ("tenantId","handoverId","description");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingHandoverAcceptance_handoverId_key" ON "ManufacturingHandoverAcceptance" ("handoverId");
CREATE INDEX IF NOT EXISTS "ManufacturingHandoverAcceptance_tenantId_signedAt_idx" ON "ManufacturingHandoverAcceptance" ("tenantId","signedAt" DESC);
