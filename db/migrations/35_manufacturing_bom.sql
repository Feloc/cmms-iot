DO $$ BEGIN
  CREATE TYPE "ManufacturingBomRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED', 'SUPERSEDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SupplyType" AS ENUM ('STOCK', 'BUY', 'MAKE', 'SUBCONTRACT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufacturingBom" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingBom_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingBom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBom_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ManufacturingBomRevision" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "bomId" text NOT NULL,
  "sequence" integer NOT NULL,
  "revisionCode" text NOT NULL,
  "status" "ManufacturingBomRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "changeSummary" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "submittedAt" timestamp(3),
  "submittedByUserId" text,
  "reviewedAt" timestamp(3),
  "reviewedByUserId" text,
  "reviewComment" text,
  "releasedAt" timestamp(3),
  "releasedByUserId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingBomRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingBomRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomRevision_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "ManufacturingBom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomRevision_sequence_check" CHECK ("sequence" > 0)
);

CREATE TABLE IF NOT EXISTS "ManufacturingBomLine" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "bomRevisionId" text NOT NULL,
  "position" integer NOT NULL,
  "parentLineId" text,
  "level" integer NOT NULL DEFAULT 0,
  "inventoryItemId" text,
  "itemCode" text NOT NULL,
  "description" text NOT NULL,
  "quantityPerUnit" decimal(18,6) NOT NULL,
  "uom" text NOT NULL,
  "supplyType" "SupplyType" NOT NULL,
  "isOptional" boolean NOT NULL DEFAULT false,
  "criticality" "PartCriticality" NOT NULL DEFAULT 'MEDIUM',
  "drawingDocumentId" text,
  "drawingRevisionId" text,
  "materialSpecification" text,
  "manufacturer" text,
  "manufacturerPartNo" text,
  "preferredSupplier" text,
  "leadTimeDays" integer,
  "notes" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingBomLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManufacturingBomLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_bomRevisionId_fkey" FOREIGN KEY ("bomRevisionId") REFERENCES "ManufacturingBomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_parentLineId_fkey" FOREIGN KEY ("parentLineId") REFERENCES "ManufacturingBomLine"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_drawingDocumentId_fkey" FOREIGN KEY ("drawingDocumentId") REFERENCES "EngineeringDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_drawingRevisionId_fkey" FOREIGN KEY ("drawingRevisionId") REFERENCES "EngineeringDocumentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ManufacturingBomLine_position_check" CHECK ("position" > 0),
  CONSTRAINT "ManufacturingBomLine_level_check" CHECK ("level" >= 0),
  CONSTRAINT "ManufacturingBomLine_quantity_check" CHECK ("quantityPerUnit" > 0),
  CONSTRAINT "ManufacturingBomLine_lead_time_check" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0)
);

DO $$ BEGIN
  ALTER TABLE "ManufacturingBomRevision" ADD CONSTRAINT "ManufacturingBomRevision_sequence_check" CHECK ("sequence" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingBomLine" ADD CONSTRAINT "ManufacturingBomLine_position_check" CHECK ("position" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingBomLine" ADD CONSTRAINT "ManufacturingBomLine_level_check" CHECK ("level" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingBomLine" ADD CONSTRAINT "ManufacturingBomLine_quantity_check" CHECK ("quantityPerUnit" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManufacturingBomLine" ADD CONSTRAINT "ManufacturingBomLine_lead_time_check" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingBom_manufacturingOrderId_code_key" ON "ManufacturingBom"("manufacturingOrderId", "code");
CREATE INDEX IF NOT EXISTS "ManufacturingBom_tenantId_order_updatedAt_idx" ON "ManufacturingBom"("tenantId", "manufacturingOrderId", "updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingBomRevision_bomId_sequence_key" ON "ManufacturingBomRevision"("bomId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingBomRevision_bomId_revisionCode_key" ON "ManufacturingBomRevision"("bomId", "revisionCode");
CREATE INDEX IF NOT EXISTS "ManufacturingBomRevision_tenantId_bomId_status_idx" ON "ManufacturingBomRevision"("tenantId", "bomId", "status");
CREATE INDEX IF NOT EXISTS "ManufacturingBomRevision_tenantId_status_updatedAt_idx" ON "ManufacturingBomRevision"("tenantId", "status", "updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "ManufacturingBomLine_bomRevisionId_position_key" ON "ManufacturingBomLine"("bomRevisionId", "position");
CREATE INDEX IF NOT EXISTS "ManufacturingBomLine_tenant_revision_level_position_idx" ON "ManufacturingBomLine"("tenantId", "bomRevisionId", "level", "position");
CREATE INDEX IF NOT EXISTS "ManufacturingBomLine_tenant_inventoryItemId_idx" ON "ManufacturingBomLine"("tenantId", "inventoryItemId");
CREATE INDEX IF NOT EXISTS "ManufacturingBomLine_tenant_drawing_refs_idx" ON "ManufacturingBomLine"("tenantId", "drawingDocumentId", "drawingRevisionId");
