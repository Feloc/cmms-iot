BEGIN;

CREATE TABLE IF NOT EXISTS "Tool" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "tracking" TEXT NOT NULL CHECK ("tracking" IN ('UNIT', 'QUANTITY')),
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 1000000),
  "availableQty" INTEGER NOT NULL CHECK ("availableQty" >= 0),
  "maintenanceQty" INTEGER NOT NULL DEFAULT 0 CHECK ("maintenanceQty" >= 0),
  "damagedQty" INTEGER NOT NULL DEFAULT 0 CHECK ("damagedQty" >= 0),
  "retiredQty" INTEGER NOT NULL DEFAULT 0 CHECK ("retiredQty" >= 0),
  "brand" TEXT, "model" TEXT, "serialNumber" TEXT,
  "location" TEXT NOT NULL,
  "responsibleUserId" TEXT,
  "acquiredOn" DATE,
  "notes" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("availableQty" + "maintenanceQty" + "damagedQty" + "retiredQty" <= "quantity"),
  CHECK (("tracking" = 'UNIT' AND "quantity" = 1) OR ("tracking" = 'QUANTITY' AND "serialNumber" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "Tool_tenantId_id_key" ON "Tool" ("tenantId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "Tool_tenantId_code_key" ON "Tool" ("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Tool_tenantId_name_idx" ON "Tool" ("tenantId", "name");

CREATE TABLE IF NOT EXISTS "ToolLoan" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL, "toolId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL, "recipientName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
  "returnedQty" INTEGER NOT NULL DEFAULT 0 CHECK ("returnedQty" >= 0 AND "returnedQty" <= "quantity"),
  "destination" TEXT NOT NULL,
  "expectedReturnOn" DATE, "note" TEXT,
  "deliveredById" TEXT NOT NULL, "deliveredByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  CONSTRAINT "ToolLoan_tenantId_toolId_fkey" FOREIGN KEY ("tenantId", "toolId")
    REFERENCES "Tool"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ToolLoan_tenantId_toolId_createdAt_idx" ON "ToolLoan" ("tenantId", "toolId", "createdAt");
CREATE INDEX IF NOT EXISTS "ToolLoan_tenantId_recipientUserId_idx" ON "ToolLoan" ("tenantId", "recipientUserId");

CREATE TABLE IF NOT EXISTS "ToolEvent" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL, "toolId" TEXT NOT NULL,
  "action" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
  "note" TEXT, "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolEvent_tenantId_toolId_fkey" FOREIGN KEY ("tenantId", "toolId")
    REFERENCES "Tool"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ToolEvent_tenantId_toolId_createdAt_idx" ON "ToolEvent" ("tenantId", "toolId", "createdAt");

CREATE TABLE IF NOT EXISTS "ToolPhoto" (
  "id" TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "toolId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp')),
  "data" BYTEA NOT NULL CHECK (octet_length("data") <= 5242880),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ToolPhoto_tenantId_toolId_fkey" FOREIGN KEY ("tenantId", "toolId")
    REFERENCES "Tool"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ToolPhoto_tenantId_toolId_key" ON "ToolPhoto" ("tenantId", "toolId");

COMMIT;
