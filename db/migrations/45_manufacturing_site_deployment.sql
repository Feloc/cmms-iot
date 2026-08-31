ALTER TYPE "AssetStatus" ADD VALUE IF NOT EXISTS 'COMMISSIONING' BEFORE 'ACTIVE';

DO $$ BEGIN CREATE TYPE "ManufacturingSiteDeploymentStatus" AS ENUM ('PENDING_RECEPTION','RECEPTION_IN_PROGRESS','RECEPTION_BLOCKED','RECEIVED','INSTALLATION_PLANNED','INSTALLING','READY_FOR_SAT','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSiteReceiptCheckStatus" AS ENUM ('PENDING','PASSED','FAILED','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSiteReceiptDecision" AS ENUM ('ACCEPTED','ACCEPTED_WITH_OBSERVATIONS','BLOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingSiteDeployment" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL,
  "dispatchId" text NOT NULL,
  "assetId" text,
  "assemblyExecutionId" text,
  "deploymentCode" text NOT NULL,
  "status" "ManufacturingSiteDeploymentStatus" NOT NULL DEFAULT 'PENDING_RECEPTION',
  "lockVersion" integer NOT NULL DEFAULT 1,
  "destination" text,
  "deliveryAddress" text,
  "contactName" text,
  "contactPhone" text,
  "receiptDecision" "ManufacturingSiteReceiptDecision",
  "receivedAt" timestamp(3),
  "receivedByUserId" text,
  "receivedByName" text,
  "receptionNotes" text,
  "receptionEvidenceReference" text,
  "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSiteDeployment_values_check" CHECK ("lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSiteReceiptCheck" (
  "id" text PRIMARY KEY,
  "tenantId" text NOT NULL,
  "deploymentId" text NOT NULL,
  "position" integer NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "required" boolean NOT NULL DEFAULT true,
  "evidenceRequired" boolean NOT NULL DEFAULT false,
  "status" "ManufacturingSiteReceiptCheckStatus" NOT NULL DEFAULT 'PENDING',
  "evidenceReference" text,
  "notes" text,
  "lockVersion" integer NOT NULL DEFAULT 1,
  "completedAt" timestamp(3),
  "completedByUserId" text,
  "completedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSiteReceiptCheck_values_check" CHECK ("position" >= 1 AND "lockVersion" >= 1)
);

DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_manufacturedUnitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "ManufacturingDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteDeployment" ADD CONSTRAINT "ManufacturingSiteDeployment_assemblyExecutionId_fkey" FOREIGN KEY ("assemblyExecutionId") REFERENCES "AssemblyExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteReceiptCheck" ADD CONSTRAINT "ManufacturingSiteReceiptCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSiteReceiptCheck" ADD CONSTRAINT "ManufacturingSiteReceiptCheck_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "ManufacturingSiteDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_manufacturedUnitId_key" ON "ManufacturingSiteDeployment" ("manufacturedUnitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_dispatchId_key" ON "ManufacturingSiteDeployment" ("dispatchId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_assetId_key" ON "ManufacturingSiteDeployment" ("assetId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_assemblyExecutionId_key" ON "ManufacturingSiteDeployment" ("assemblyExecutionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_tenantId_deploymentCode_key" ON "ManufacturingSiteDeployment" ("tenantId","deploymentCode");
CREATE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingSiteDeployment" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingSiteDeployment_tenantId_status_updatedAt_idx" ON "ManufacturingSiteDeployment" ("tenantId","status","updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteReceiptCheck_deploymentId_position_key" ON "ManufacturingSiteReceiptCheck" ("deploymentId","position");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSiteReceiptCheck_deploymentId_code_key" ON "ManufacturingSiteReceiptCheck" ("deploymentId","code");
CREATE INDEX IF NOT EXISTS "ManufacturingSiteReceiptCheck_tenantId_deploymentId_status_position_idx" ON "ManufacturingSiteReceiptCheck" ("tenantId","deploymentId","status","position");
