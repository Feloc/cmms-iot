ALTER TYPE "ManufacturedUnitStatus" ADD VALUE IF NOT EXISTS 'COMMISSIONED' BEFORE 'CANCELED';
ALTER TYPE "ManufacturingSiteDeploymentStatus" ADD VALUE IF NOT EXISTS 'SAT_IN_PROGRESS' BEFORE 'CANCELED';
ALTER TYPE "ManufacturingSiteDeploymentStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED' BEFORE 'CANCELED';
ALTER TYPE "ManufacturingSiteDeploymentStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED_WITH_PENDING_ITEMS' BEFORE 'CANCELED';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "commissionedAt" timestamp(3);

DO $$ BEGIN CREATE TYPE "ManufacturingSatExecutionStatus" AS ENUM ('DRAFT','IN_PROGRESS','AWAITING_ACCEPTANCE','ACCEPTED','ACCEPTED_WITH_PENDING_ITEMS','REJECTED','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSatCaseResult" AS ENUM ('PENDING','PASS','FAIL','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSatResultType" AS ENUM ('BOOLEAN','NUMERIC','TEXT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSatDeviationStatus" AS ENUM ('OPEN','IN_REWORK','RESOLVED','ACCEPTED_AS_IS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSatDeviationSeverity" AS ENUM ('MINOR','MAJOR','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingSatAcceptanceDecision" AS ENUM ('ACCEPTED','ACCEPTED_WITH_PENDING_ITEMS','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingSatTemplate" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "code" text NOT NULL, "name" text NOT NULL,
  "description" text, "version" integer NOT NULL DEFAULT 1, "active" boolean NOT NULL DEFAULT true,
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSatTemplate_values_check" CHECK ("version" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatTemplateCase" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "templateId" text NOT NULL, "position" integer NOT NULL,
  "section" text, "name" text NOT NULL, "instructions" text, "acceptanceCriteria" text NOT NULL,
  "resultType" "ManufacturingSatResultType" NOT NULL DEFAULT 'BOOLEAN', "minimumValue" decimal(18,6),
  "maximumValue" decimal(18,6), "unit" text, "required" boolean NOT NULL DEFAULT true,
  "evidenceRequired" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSatTemplateCase_values_check" CHECK ("position" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue"))
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatExecution" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "manufacturingOrderId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL, "siteDeploymentId" text NOT NULL, "assemblyExecutionId" text NOT NULL,
  "assetId" text NOT NULL, "templateId" text, "sequence" integer NOT NULL, "executionCode" text NOT NULL,
  "templateCode" text NOT NULL, "templateName" text NOT NULL, "templateVersion" integer NOT NULL,
  "status" "ManufacturingSatExecutionStatus" NOT NULL DEFAULT 'DRAFT', "lockVersion" integer NOT NULL DEFAULT 1,
  "startedAt" timestamp(3), "submittedAt" timestamp(3), "decidedAt" timestamp(3), "commissionedAt" timestamp(3),
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSatExecution_values_check" CHECK ("sequence" >= 1 AND "templateVersion" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatCase" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL, "templateCaseId" text,
  "position" integer NOT NULL, "section" text, "name" text NOT NULL, "instructions" text,
  "acceptanceCriteria" text NOT NULL, "resultType" "ManufacturingSatResultType" NOT NULL,
  "minimumValue" decimal(18,6), "maximumValue" decimal(18,6), "unit" text,
  "required" boolean NOT NULL DEFAULT true, "evidenceRequired" boolean NOT NULL DEFAULT false,
  "result" "ManufacturingSatCaseResult" NOT NULL DEFAULT 'PENDING', "measuredValue" decimal(18,6),
  "observedValue" text, "notes" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "testedAt" timestamp(3), "testedByUserId" text, "testedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSatCase_values_check" CHECK ("position" >= 1 AND "lockVersion" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue"))
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatEvidence" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "satCaseId" text NOT NULL, "title" text NOT NULL,
  "reference" text, "url" text, "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatDeviation" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL, "satCaseId" text NOT NULL,
  "sequence" integer NOT NULL, "deviationCode" text NOT NULL, "title" text NOT NULL, "description" text NOT NULL,
  "severity" "ManufacturingSatDeviationSeverity" NOT NULL DEFAULT 'MAJOR',
  "status" "ManufacturingSatDeviationStatus" NOT NULL DEFAULT 'OPEN', "correctiveAction" text,
  "resolutionNotes" text, "responsibleUserId" text, "responsibleName" text, "dueAt" timestamp(3),
  "lockVersion" integer NOT NULL DEFAULT 1, "openedByUserId" text NOT NULL, "openedByName" text NOT NULL,
  "openedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedByUserId" text, "resolvedByName" text,
  "resolvedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingSatDeviation_values_check" CHECK ("sequence" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingSatAcceptance" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL,
  "decision" "ManufacturingSatAcceptanceDecision" NOT NULL, "comments" text,
  "clientName" text NOT NULL, "clientRole" text NOT NULL, "clientCompany" text,
  "clientSignature" text NOT NULL, "signedByUserId" text NOT NULL, "signedByName" text NOT NULL,
  "signedByRole" text NOT NULL, "signedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN ALTER TABLE "ManufacturingSatTemplate" ADD CONSTRAINT "ManufacturingSatTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatTemplateCase" ADD CONSTRAINT "ManufacturingSatTemplateCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatTemplateCase" ADD CONSTRAINT "ManufacturingSatTemplateCase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ManufacturingSatTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_manufacturedUnitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_siteDeploymentId_fkey" FOREIGN KEY ("siteDeploymentId") REFERENCES "ManufacturingSiteDeployment"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_assemblyExecutionId_fkey" FOREIGN KEY ("assemblyExecutionId") REFERENCES "AssemblyExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatExecution" ADD CONSTRAINT "ManufacturingSatExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ManufacturingSatTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatCase" ADD CONSTRAINT "ManufacturingSatCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatCase" ADD CONSTRAINT "ManufacturingSatCase_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingSatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatCase" ADD CONSTRAINT "ManufacturingSatCase_templateCaseId_fkey" FOREIGN KEY ("templateCaseId") REFERENCES "ManufacturingSatTemplateCase"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatEvidence" ADD CONSTRAINT "ManufacturingSatEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatEvidence" ADD CONSTRAINT "ManufacturingSatEvidence_satCaseId_fkey" FOREIGN KEY ("satCaseId") REFERENCES "ManufacturingSatCase"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatDeviation" ADD CONSTRAINT "ManufacturingSatDeviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatDeviation" ADD CONSTRAINT "ManufacturingSatDeviation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingSatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatDeviation" ADD CONSTRAINT "ManufacturingSatDeviation_satCaseId_fkey" FOREIGN KEY ("satCaseId") REFERENCES "ManufacturingSatCase"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatAcceptance" ADD CONSTRAINT "ManufacturingSatAcceptance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingSatAcceptance" ADD CONSTRAINT "ManufacturingSatAcceptance_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingSatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatTemplate_tenantId_code_version_key" ON "ManufacturingSatTemplate" ("tenantId","code","version");
CREATE INDEX IF NOT EXISTS "ManufacturingSatTemplate_tenantId_active_name_idx" ON "ManufacturingSatTemplate" ("tenantId","active","name");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatTemplateCase_templateId_position_key" ON "ManufacturingSatTemplateCase" ("templateId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingSatTemplateCase_tenantId_templateId_position_idx" ON "ManufacturingSatTemplateCase" ("tenantId","templateId","position");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatExecution_manufacturedUnitId_sequence_key" ON "ManufacturingSatExecution" ("manufacturedUnitId","sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatExecution_tenantId_executionCode_key" ON "ManufacturingSatExecution" ("tenantId","executionCode");
CREATE INDEX IF NOT EXISTS "ManufacturingSatExecution_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingSatExecution" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingSatExecution_tenantId_siteDeploymentId_createdAt_idx" ON "ManufacturingSatExecution" ("tenantId","siteDeploymentId","createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatCase_executionId_position_key" ON "ManufacturingSatCase" ("executionId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingSatCase_tenantId_executionId_result_position_idx" ON "ManufacturingSatCase" ("tenantId","executionId","result","position");
CREATE INDEX IF NOT EXISTS "ManufacturingSatEvidence_tenantId_satCaseId_createdAt_idx" ON "ManufacturingSatEvidence" ("tenantId","satCaseId","createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatDeviation_executionId_sequence_key" ON "ManufacturingSatDeviation" ("executionId","sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingSatDeviation_tenantId_deviationCode_key" ON "ManufacturingSatDeviation" ("tenantId","deviationCode");
CREATE INDEX IF NOT EXISTS "ManufacturingSatDeviation_tenantId_executionId_status_idx" ON "ManufacturingSatDeviation" ("tenantId","executionId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingSatDeviation_tenantId_satCaseId_status_idx" ON "ManufacturingSatDeviation" ("tenantId","satCaseId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingSatDeviation_tenantId_responsibleUserId_dueAt_idx" ON "ManufacturingSatDeviation" ("tenantId","responsibleUserId","dueAt");
CREATE INDEX IF NOT EXISTS "ManufacturingSatAcceptance_tenantId_executionId_signedAt_idx" ON "ManufacturingSatAcceptance" ("tenantId","executionId","signedAt" DESC);
