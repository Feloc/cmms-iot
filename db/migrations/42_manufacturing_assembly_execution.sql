DO $$ BEGIN CREATE TYPE "ManufacturingAssemblyExecutionStatus" AS ENUM ('PLANNED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ManufacturingAssemblyOperationStatus" AS ENUM ('PENDING','IN_PROGRESS','PAUSED','BLOCKED','COMPLETED','NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingAssemblyExecution" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "manufacturingOrderId" text NOT NULL, "kitId" text NOT NULL,
  "templateId" text, "executionCode" text NOT NULL, "templateCode" text NOT NULL, "templateName" text NOT NULL,
  "templateVersion" integer NOT NULL, "status" "ManufacturingAssemblyExecutionStatus" NOT NULL DEFAULT 'PLANNED',
  "lockVersion" integer NOT NULL DEFAULT 1, "plannedMinutes" integer NOT NULL, "startedAt" timestamp(3),
  "completedAt" timestamp(3), "heldAt" timestamp(3), "holdReason" text, "createdByUserId" text NOT NULL,
  "createdByName" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingAssemblyExecution_values_check" CHECK ("lockVersion" >= 1 AND "plannedMinutes" > 0)
);

CREATE TABLE IF NOT EXISTS "ManufacturingAssemblyOperation" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "executionId" text NOT NULL, "templateStepId" text,
  "position" integer NOT NULL, "phase" text, "name" text NOT NULL, "instructions" text, "estimatedMinutes" integer NOT NULL,
  "plannedTechnicians" integer NOT NULL DEFAULT 1, "dependsOnPositions" jsonb NOT NULL DEFAULT '[]',
  "required" boolean NOT NULL DEFAULT true, "evidenceRequired" boolean NOT NULL DEFAULT false,
  "status" "ManufacturingAssemblyOperationStatus" NOT NULL DEFAULT 'PENDING', "progressPercent" integer NOT NULL DEFAULT 0,
  "assignedUserId" text, "assignedUserName" text, "notes" text, "blockedReason" text, "lockVersion" integer NOT NULL DEFAULT 1,
  "startedAt" timestamp(3), "completedAt" timestamp(3), "completedByUserId" text, "completedByName" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingAssemblyOperation_values_check" CHECK (
    "position" >= 1 AND "estimatedMinutes" > 0 AND "plannedTechnicians" > 0 AND "progressPercent" BETWEEN 0 AND 100 AND "lockVersion" >= 1
  )
);

CREATE TABLE IF NOT EXISTS "ManufacturingAssemblyTimeLog" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "operationId" text NOT NULL, "userId" text NOT NULL,
  "userName" text NOT NULL, "startedAt" timestamp(3) NOT NULL, "endedAt" timestamp(3), "note" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingAssemblyTimeLog_dates_check" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);

CREATE TABLE IF NOT EXISTS "ManufacturingAssemblyEvidence" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "operationId" text NOT NULL, "title" text NOT NULL,
  "reference" text, "url" text, "notes" text, "createdByUserId" text NOT NULL, "createdByName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ManufacturingAssemblyConsumption" (
  "id" text PRIMARY KEY, "tenantId" text NOT NULL, "operationId" text NOT NULL, "kitLineId" text NOT NULL,
  "quantity" decimal(18,6) NOT NULL, "notes" text, "consumedByUserId" text NOT NULL, "consumedByName" text NOT NULL,
  "consumedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingAssemblyConsumption_quantity_check" CHECK ("quantity" > 0)
);

DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyExecution" ADD CONSTRAINT "ManufacturingAssemblyExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyExecution" ADD CONSTRAINT "ManufacturingAssemblyExecution_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyExecution" ADD CONSTRAINT "ManufacturingAssemblyExecution_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "ManufacturingKit"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyExecution" ADD CONSTRAINT "ManufacturingAssemblyExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssemblyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyOperation" ADD CONSTRAINT "ManufacturingAssemblyOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyOperation" ADD CONSTRAINT "ManufacturingAssemblyOperation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ManufacturingAssemblyExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyOperation" ADD CONSTRAINT "ManufacturingAssemblyOperation_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "AssemblyTemplateStep"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyTimeLog" ADD CONSTRAINT "ManufacturingAssemblyTimeLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyTimeLog" ADD CONSTRAINT "ManufacturingAssemblyTimeLog_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ManufacturingAssemblyOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyEvidence" ADD CONSTRAINT "ManufacturingAssemblyEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyEvidence" ADD CONSTRAINT "ManufacturingAssemblyEvidence_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ManufacturingAssemblyOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyConsumption" ADD CONSTRAINT "ManufacturingAssemblyConsumption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyConsumption" ADD CONSTRAINT "ManufacturingAssemblyConsumption_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ManufacturingAssemblyOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ManufacturingAssemblyConsumption" ADD CONSTRAINT "ManufacturingAssemblyConsumption_kitLineId_fkey" FOREIGN KEY ("kitLineId") REFERENCES "ManufacturingKitLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingAssemblyExecution_kitId_key" ON "ManufacturingAssemblyExecution" ("kitId");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingAssemblyExecution_tenantId_executionCode_key" ON "ManufacturingAssemblyExecution" ("tenantId","executionCode");
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyExecution_tenantId_manufacturingOrderId_status_idx" ON "ManufacturingAssemblyExecution" ("tenantId","manufacturingOrderId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyExecution_tenantId_status_updatedAt_idx" ON "ManufacturingAssemblyExecution" ("tenantId","status","updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingAssemblyOperation_executionId_position_key" ON "ManufacturingAssemblyOperation" ("executionId","position");
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyOperation_tenantId_executionId_status_position_idx" ON "ManufacturingAssemblyOperation" ("tenantId","executionId","status","position");
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyOperation_tenantId_assignedUserId_status_idx" ON "ManufacturingAssemblyOperation" ("tenantId","assignedUserId","status");
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyTimeLog_tenantId_operationId_startedAt_idx" ON "ManufacturingAssemblyTimeLog" ("tenantId","operationId","startedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyTimeLog_tenantId_userId_startedAt_idx" ON "ManufacturingAssemblyTimeLog" ("tenantId","userId","startedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingAssemblyTimeLog_one_open_per_operation" ON "ManufacturingAssemblyTimeLog" ("operationId") WHERE "endedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyEvidence_tenantId_operationId_createdAt_idx" ON "ManufacturingAssemblyEvidence" ("tenantId","operationId","createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyConsumption_tenantId_operationId_consumedAt_idx" ON "ManufacturingAssemblyConsumption" ("tenantId","operationId","consumedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingAssemblyConsumption_tenantId_kitLineId_idx" ON "ManufacturingAssemblyConsumption" ("tenantId","kitLineId");
