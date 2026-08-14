DO $$ BEGIN
  ALTER TYPE "ServiceOrderType" ADD VALUE IF NOT EXISTS 'MONTAJE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssemblyExecutionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssemblyActivityStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AssemblyTemplate" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "brand" text,
  "model" text,
  "version" integer NOT NULL DEFAULT 1,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyTemplate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AssemblyTemplateStep" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "templateId" text NOT NULL,
  "position" integer NOT NULL,
  "phase" text,
  "name" text NOT NULL,
  "instructions" text,
  "estimatedMinutes" integer NOT NULL,
  "plannedTechnicians" integer NOT NULL DEFAULT 1,
  "required" boolean NOT NULL DEFAULT true,
  "evidenceRequired" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyTemplateStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyTemplateStep_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssemblyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AssemblyExecution" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "workOrderId" text NOT NULL,
  "templateId" text,
  "templateCode" text NOT NULL,
  "templateName" text NOT NULL,
  "templateVersion" integer NOT NULL,
  "status" "AssemblyExecutionStatus" NOT NULL DEFAULT 'PLANNED',
  "plannedMinutes" integer NOT NULL,
  "plannedLaborMinutes" integer NOT NULL,
  "startedAt" timestamp(3),
  "completedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyExecution_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyExecution_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AssemblyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AssemblyActivity" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "executionId" text NOT NULL,
  "templateStepId" text,
  "position" integer NOT NULL,
  "phase" text,
  "name" text NOT NULL,
  "instructions" text,
  "estimatedMinutes" integer NOT NULL,
  "plannedTechnicians" integer NOT NULL DEFAULT 1,
  "required" boolean NOT NULL DEFAULT true,
  "evidenceRequired" boolean NOT NULL DEFAULT false,
  "status" "AssemblyActivityStatus" NOT NULL DEFAULT 'PENDING',
  "progressPercent" integer NOT NULL DEFAULT 0,
  "assignedUserId" text,
  "notes" text,
  "blockedReason" text,
  "startedAt" timestamp(3),
  "completedAt" timestamp(3),
  "completedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyActivity_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AssemblyExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyActivity_templateStepId_fkey" FOREIGN KEY ("templateStepId") REFERENCES "AssemblyTemplateStep"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "WorkLog" ADD COLUMN IF NOT EXISTS "assemblyActivityId" text;
DO $$ BEGIN
  ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_assemblyActivityId_fkey"
    FOREIGN KEY ("assemblyActivityId") REFERENCES "AssemblyActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyTemplate_tenantId_code_version_key" ON "AssemblyTemplate"("tenantId", "code", "version");
CREATE INDEX IF NOT EXISTS "AssemblyTemplate_tenantId_active_name_idx" ON "AssemblyTemplate"("tenantId", "active", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyTemplateStep_templateId_position_key" ON "AssemblyTemplateStep"("templateId", "position");
CREATE INDEX IF NOT EXISTS "AssemblyTemplateStep_tenantId_templateId_position_idx" ON "AssemblyTemplateStep"("tenantId", "templateId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyExecution_workOrderId_key" ON "AssemblyExecution"("workOrderId");
CREATE INDEX IF NOT EXISTS "AssemblyExecution_tenantId_status_updatedAt_idx" ON "AssemblyExecution"("tenantId", "status", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "AssemblyExecution_tenantId_templateId_idx" ON "AssemblyExecution"("tenantId", "templateId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyActivity_executionId_position_key" ON "AssemblyActivity"("executionId", "position");
CREATE INDEX IF NOT EXISTS "AssemblyActivity_tenantId_executionId_position_idx" ON "AssemblyActivity"("tenantId", "executionId", "position");
CREATE INDEX IF NOT EXISTS "AssemblyActivity_tenantId_status_idx" ON "AssemblyActivity"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "WorkLog_tenantId_assemblyActivityId_idx" ON "WorkLog"("tenantId", "assemblyActivityId");
