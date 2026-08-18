DO $$ BEGIN
  CREATE TYPE "ManufacturingOrderStatus" AS ENUM ('DRAFT', 'ENGINEERING', 'RELEASED', 'ON_HOLD', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ManufacturedUnitStatus" AS ENUM ('PLANNED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ManufacturingMemberFunction" AS ENUM ('RESPONSIBLE', 'ENGINEERING', 'REVIEWER', 'OBSERVER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingNumberSequence" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "year" integer NOT NULL,
  "lastValue" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingNumberSequence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingNumberSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingNumberSequence_year_check" CHECK ("year" >= 2000),
  CONSTRAINT "ManufacturingNumberSequence_lastValue_check" CHECK ("lastValue" >= 0)
);

CREATE TABLE IF NOT EXISTS "ManufacturingOrder" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "number" text NOT NULL,
  "status" "ManufacturingOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "statusBeforeHold" "ManufacturingOrderStatus",
  "version" integer NOT NULL DEFAULT 1,
  "projectName" text NOT NULL,
  "productCode" text,
  "productName" text NOT NULL,
  "model" text,
  "quantity" integer NOT NULL DEFAULT 1,
  "priority" "WorkOrderPriority",
  "customerName" text,
  "customerReference" text,
  "commercialReference" text,
  "destination" text,
  "description" text,
  "requestedDeliveryAt" timestamp(3),
  "plannedStartAt" timestamp(3),
  "plannedEndAt" timestamp(3),
  "responsibleUserId" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "holdReason" text,
  "canceledReason" text,
  "releasedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingOrder_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingOrder_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "ManufacturingOrder_version_check" CHECK ("version" > 0),
  CONSTRAINT "ManufacturingOrder_dates_check" CHECK ("plannedStartAt" IS NULL OR "plannedEndAt" IS NULL OR "plannedEndAt" >= "plannedStartAt"),
  CONSTRAINT "ManufacturingOrder_previous_status_check" CHECK ("statusBeforeHold" IS NULL OR "statusBeforeHold" NOT IN ('ON_HOLD', 'CANCELED'))
);

CREATE TABLE IF NOT EXISTS "ManufacturedUnit" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "unitNumber" integer NOT NULL,
  "serialNumber" text,
  "internalCode" text,
  "status" "ManufacturedUnitStatus" NOT NULL DEFAULT 'PLANNED',
  "assetId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturedUnit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturedUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedUnit_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedUnit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturedUnit_unitNumber_check" CHECK ("unitNumber" > 0)
);

CREATE TABLE IF NOT EXISTS "ManufacturingOrderMember" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "userId" text NOT NULL,
  "function" "ManufacturingMemberFunction" NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingOrderMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingOrderMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingOrderMember_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingOrderMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ManufacturingAuditEvent" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "action" text NOT NULL,
  "summary" text NOT NULL,
  "beforeData" jsonb,
  "afterData" jsonb,
  "metadata" jsonb,
  "actorUserId" text NOT NULL,
  "actorName" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingAuditEvent_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- En producción Prisma sincroniza el esquema antes de ejecutar estas migraciones
-- SQL. Los CHECK deben agregarse también cuando las tablas ya fueron creadas.
DO $$ BEGIN
  ALTER TABLE "ManufacturingNumberSequence" ADD CONSTRAINT "ManufacturingNumberSequence_year_check" CHECK ("year" >= 2000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingNumberSequence" ADD CONSTRAINT "ManufacturingNumberSequence_lastValue_check" CHECK ("lastValue" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_quantity_check" CHECK ("quantity" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_version_check" CHECK ("version" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_dates_check" CHECK ("plannedStartAt" IS NULL OR "plannedEndAt" IS NULL OR "plannedEndAt" >= "plannedStartAt");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_previous_status_check" CHECK ("statusBeforeHold" IS NULL OR "statusBeforeHold" NOT IN ('ON_HOLD', 'CANCELED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufacturedUnit" ADD CONSTRAINT "ManufacturedUnit_unitNumber_check" CHECK ("unitNumber" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingNumberSequence_tenantId_year_key" ON "ManufacturingNumberSequence"("tenantId", "year");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_number_key" ON "ManufacturingOrder"("tenantId", "number");
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_status_updatedAt_idx" ON "ManufacturingOrder"("tenantId", "status", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_responsibleUserId_status_idx" ON "ManufacturingOrder"("tenantId", "responsibleUserId", "status");
CREATE INDEX IF NOT EXISTS "ManufacturingOrder_tenantId_requestedDeliveryAt_idx" ON "ManufacturingOrder"("tenantId", "requestedDeliveryAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturedUnit_manufacturingOrderId_unitNumber_key" ON "ManufacturedUnit"("manufacturingOrderId", "unitNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturedUnit_tenantId_serialNumber_key" ON "ManufacturedUnit"("tenantId", "serialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturedUnit_assetId_key" ON "ManufacturedUnit"("assetId");
CREATE INDEX IF NOT EXISTS "ManufacturedUnit_tenantId_manufacturingOrderId_status_idx" ON "ManufacturedUnit"("tenantId", "manufacturingOrderId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingOrderMember_manufacturingOrderId_userId_function_key" ON "ManufacturingOrderMember"("manufacturingOrderId", "userId", "function");
CREATE INDEX IF NOT EXISTS "ManufacturingOrderMember_tenantId_userId_function_idx" ON "ManufacturingOrderMember"("tenantId", "userId", "function");
CREATE INDEX IF NOT EXISTS "ManufacturingAuditEvent_tenantId_manufacturingOrderId_createdAt_idx" ON "ManufacturingAuditEvent"("tenantId", "manufacturingOrderId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ManufacturingAuditEvent_tenantId_entityType_entityId_idx" ON "ManufacturingAuditEvent"("tenantId", "entityType", "entityId");
