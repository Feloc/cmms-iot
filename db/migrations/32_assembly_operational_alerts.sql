CREATE TABLE IF NOT EXISTS "AssemblyOperationalAlert" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "executionId" text NOT NULL,
  "activityId" text,
  "fingerprint" text NOT NULL,
  "code" text NOT NULL,
  "severity" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "message" text NOT NULL,
  "assignedUserId" text,
  "acknowledgedAt" timestamp(3),
  "acknowledgedById" text,
  "acknowledgedByName" text,
  "resolvedAt" timestamp(3),
  "firstDetectedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastDetectedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "escalationLevel" integer NOT NULL DEFAULT 0,
  "escalatedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssemblyOperationalAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssemblyOperationalAlert_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyOperationalAlert_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AssemblyExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AssemblyOperationalAlert_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "AssemblyActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssemblyOperationalAlert_fingerprint_key"
  ON "AssemblyOperationalAlert"("fingerprint");
CREATE INDEX IF NOT EXISTS "AssemblyOperationalAlert_tenantId_status_escalationLevel_firstDetectedAt_idx"
  ON "AssemblyOperationalAlert"("tenantId", "status", "escalationLevel", "firstDetectedAt");
CREATE INDEX IF NOT EXISTS "AssemblyOperationalAlert_tenantId_assignedUserId_status_idx"
  ON "AssemblyOperationalAlert"("tenantId", "assignedUserId", "status");
CREATE INDEX IF NOT EXISTS "AssemblyOperationalAlert_executionId_activityId_code_idx"
  ON "AssemblyOperationalAlert"("executionId", "activityId", "code");
