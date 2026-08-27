DO $$ BEGIN CREATE TYPE "ManufacturingFatExecutionStatus" AS ENUM ('DRAFT','IN_PROGRESS','AWAITING_APPROVAL','APPROVED','REJECTED','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingFatCaseResult" AS ENUM ('PENDING','PASS','FAIL','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingFatResultType" AS ENUM ('BOOLEAN','NUMERIC','TEXT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingFatDeviationStatus" AS ENUM ('OPEN','IN_REWORK','RESOLVED','ACCEPTED_AS_IS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingFatApprovalDecision" AS ENUM ('APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingFatTemplate" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "code" text NOT NULL, "name" text NOT NULL,
  "description" text, "version" integer NOT NULL DEFAULT 1, "active" boolean NOT NULL DEFAULT true,
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingFatTemplate_values_check" CHECK ("version" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatTemplateCase" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "templateId" text NOT NULL, "position" integer NOT NULL,
  "section" text, "name" text NOT NULL, "instructions" text, "acceptanceCriteria" text NOT NULL,
  "resultType" "ManufacturingFatResultType" NOT NULL DEFAULT 'BOOLEAN',
  "minimumValue" decimal(18,6), "maximumValue" decimal(18,6), "unit" text,
  "required" boolean NOT NULL DEFAULT true, "evidenceRequired" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingFatTemplateCase_values_check" CHECK (
    "position" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue")
  )
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatExecution" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "manufacturingOrderId" text NOT NULL,
  "manufacturedUnitId" text NOT NULL, "assemblyExecutionId" text NOT NULL, "templateId" text,
  "sequence" integer NOT NULL, "executionCode" text NOT NULL, "templateCode" text NOT NULL,
  "templateName" text NOT NULL, "templateVersion" integer NOT NULL,
  "status" "ManufacturingFatExecutionStatus" NOT NULL DEFAULT 'DRAFT', "lockVersion" integer NOT NULL DEFAULT 1,
  "startedAt" timestamp(3), "submittedAt" timestamp(3), "decidedAt" timestamp(3),
  "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingFatExecution_values_check" CHECK ("sequence" >= 1 AND "templateVersion" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatCase" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL, "templateCaseId" text,
  "position" integer NOT NULL, "section" text, "name" text NOT NULL, "instructions" text,
  "acceptanceCriteria" text NOT NULL, "resultType" "ManufacturingFatResultType" NOT NULL,
  "minimumValue" decimal(18,6), "maximumValue" decimal(18,6), "unit" text,
  "required" boolean NOT NULL DEFAULT true, "evidenceRequired" boolean NOT NULL DEFAULT false,
  "result" "ManufacturingFatCaseResult" NOT NULL DEFAULT 'PENDING', "measuredValue" decimal(18,6),
  "observedValue" text, "notes" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "testedAt" timestamp(3), "testedByUserId" text, "testedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingFatCase_values_check" CHECK (
    "position" >= 1 AND "lockVersion" >= 1 AND ("minimumValue" IS NULL OR "maximumValue" IS NULL OR "minimumValue" <= "maximumValue")
  )
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatEvidence" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "fatCaseId" text NOT NULL, "title" text NOT NULL,
  "reference" text, "url" text, "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatDeviation" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL, "fatCaseId" text NOT NULL,
  "sequence" integer NOT NULL, "deviationCode" text NOT NULL, "title" text NOT NULL, "description" text NOT NULL,
  "status" "ManufacturingFatDeviationStatus" NOT NULL DEFAULT 'OPEN', "correctiveAction" text,
  "resolutionNotes" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "openedByUserId" text NOT NULL, "openedByName" text NOT NULL, "openedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedByUserId" text, "resolvedByName" text, "resolvedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingFatDeviation_values_check" CHECK ("sequence" >= 1 AND "lockVersion" >= 1)
);

CREATE TABLE IF NOT EXISTS "ManufacturingFatApproval" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL,
  "decision" "ManufacturingFatApprovalDecision" NOT NULL, "comments" text,
  "signedByUserId" text NOT NULL, "signedByName" text NOT NULL, "signedByRole" text NOT NULL,
  "signedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN ALTER TABLE "ManufacturingFatTemplate" ADD CONSTRAINT "ManufacturingFatTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatTemplateCase" ADD CONSTRAINT "ManufacturingFatTemplateCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatTemplateCase" ADD CONSTRAINT "ManufacturingFatTemplateCase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ManufacturingFatTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatExecution" ADD CONSTRAINT "ManufacturingFatExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatExecution" ADD CONSTRAINT "ManufacturingFatExecution_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatExecution" ADD CONSTRAINT "ManufacturingFatExecution_manufacturedUnitId_fkey" FOREIGN KEY ("manufacturedUnitId") REFERENCES "ManufacturedUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatExecution" ADD CONSTRAINT "ManufacturingFatExecution_assemblyExecutionId_fkey" FOREIGN KEY ("assemblyExecutionId") REFERENCES "ManufacturingAssemblyExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatExecution" ADD CONSTRAINT "ManufacturingFatExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ManufacturingFatTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingFatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatCase" ADD CONSTRAINT "ManufacturingFatCase_templateCaseId_fkey" FOREIGN KEY ("templateCaseId") REFERENCES "ManufacturingFatTemplateCase"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatEvidence" ADD CONSTRAINT "ManufacturingFatEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatEvidence" ADD CONSTRAINT "ManufacturingFatEvidence_fatCaseId_fkey" FOREIGN KEY ("fatCaseId") REFERENCES "ManufacturingFatCase"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatDeviation" ADD CONSTRAINT "ManufacturingFatDeviation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatDeviation" ADD CONSTRAINT "ManufacturingFatDeviation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingFatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatDeviation" ADD CONSTRAINT "ManufacturingFatDeviation_fatCaseId_fkey" FOREIGN KEY ("fatCaseId") REFERENCES "ManufacturingFatCase"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatApproval" ADD CONSTRAINT "ManufacturingFatApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingFatApproval" ADD CONSTRAINT "ManufacturingFatApproval_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingFatExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatTemplate_tenantId_code_version_key" ON "ManufacturingFatTemplate" ("tenantId","code","version");
CREATE INDEX IF NOT EXISTS "ManufacturingFatTemplate_tenantId_active_name_idx" ON "ManufacturingFatTemplate" ("tenantId","active","name");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatTemplateCase_templateId_position_key" ON "ManufacturingFatTemplateCase" ("templateId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingFatTemplateCase_tenantId_templateId_position_idx" ON "ManufacturingFatTemplateCase" ("tenantId","templateId","position");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatExecution_manufacturedUnitId_sequence_key" ON "ManufacturingFatExecution" ("manufacturedUnitId","sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatExecution_tenantId_executionCode_key" ON "ManufacturingFatExecution" ("tenantId","executionCode");
CREATE INDEX IF NOT EXISTS "ManufacturingFatExecution_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingFatExecution" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingFatExecution_tenantId_manufacturedUnitId_createdAt_idx" ON "ManufacturingFatExecution" ("tenantId","manufacturedUnitId","createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatCase_executionId_position_key" ON "ManufacturingFatCase" ("executionId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingFatCase_tenantId_executionId_result_position_idx" ON "ManufacturingFatCase" ("tenantId","executionId","result","position");
CREATE INDEX IF NOT EXISTS "ManufacturingFatEvidence_tenantId_fatCaseId_createdAt_idx" ON "ManufacturingFatEvidence" ("tenantId","fatCaseId","createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatDeviation_executionId_sequence_key" ON "ManufacturingFatDeviation" ("executionId","sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingFatDeviation_tenantId_deviationCode_key" ON "ManufacturingFatDeviation" ("tenantId","deviationCode");
CREATE INDEX IF NOT EXISTS "ManufacturingFatDeviation_tenantId_executionId_status_idx" ON "ManufacturingFatDeviation" ("tenantId","executionId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingFatDeviation_tenantId_fatCaseId_status_idx" ON "ManufacturingFatDeviation" ("tenantId","fatCaseId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingFatApproval_tenantId_executionId_signedAt_idx" ON "ManufacturingFatApproval" ("tenantId","executionId","signedAt" DESC);
