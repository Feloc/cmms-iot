BEGIN;

CREATE TABLE IF NOT EXISTS "Quotation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerTaxId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "previousStatus" TEXT,
    "coordinatorId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "dueAt" TIMESTAMP(3),
    "assetId" TEXT,
    "currentRevision" INTEGER NOT NULL DEFAULT 0,
    "approvedRevision" INTEGER,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'UND',
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "approvedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "orderedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "receivedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "executedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "invoicedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "dispatchedQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "deliveredQty" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "inventoryItemId" TEXT,
    "serviceOrderId" TEXT,
    "manufacturingOrderId" TEXT,

    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "terms" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "leadDays" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "evidenceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "supplier" TEXT,
    "sourceDocumentId" TEXT,
    "amount" DECIMAL(18,2),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "revision" INTEGER,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "QuotationAccessEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "before" TEXT[],
    "after" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationAccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Quotation_tenantId_status_dueAt_idx" ON "Quotation"("tenantId", "status", "dueAt");

CREATE INDEX IF NOT EXISTS "Quotation_tenantId_responsibleId_updatedAt_idx" ON "Quotation"("tenantId", "responsibleId", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_tenantId_id_key" ON "Quotation"("tenantId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "Quotation_tenantId_code_key" ON "Quotation"("tenantId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationLine_tenantId_quotationId_id_key" ON "QuotationLine"("tenantId", "quotationId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationLine_quotationId_position_key" ON "QuotationLine"("quotationId", "position");

CREATE INDEX IF NOT EXISTS "QuotationRevision_tenantId_quotationId_idx" ON "QuotationRevision"("tenantId", "quotationId");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationRevision_quotationId_number_key" ON "QuotationRevision"("quotationId", "number");

CREATE INDEX IF NOT EXISTS "QuotationOffer_tenantId_quotationId_lineId_idx" ON "QuotationOffer"("tenantId", "quotationId", "lineId");

CREATE INDEX IF NOT EXISTS "QuotationDocument_tenantId_quotationId_createdAt_idx" ON "QuotationDocument"("tenantId", "quotationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationDocument_tenantId_quotationId_id_key" ON "QuotationDocument"("tenantId", "quotationId", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationDocument_tenantId_quotationId_kind_reference_key" ON "QuotationDocument"("tenantId", "quotationId", "kind", "reference");

CREATE INDEX IF NOT EXISTS "QuotationAttachment_tenantId_quotationId_createdAt_idx" ON "QuotationAttachment"("tenantId", "quotationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationAttachment_tenantId_quotationId_id_key" ON "QuotationAttachment"("tenantId", "quotationId", "id");

CREATE INDEX IF NOT EXISTS "QuotationEvent_tenantId_quotationId_createdAt_idx" ON "QuotationEvent"("tenantId", "quotationId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationAccess_tenantId_userId_key" ON "QuotationAccess"("tenantId", "userId");

CREATE INDEX IF NOT EXISTS "QuotationAccessEvent_tenantId_createdAt_idx" ON "QuotationAccessEvent"("tenantId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quotation_tenantId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationRevision_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationRevision" ADD CONSTRAINT "QuotationRevision_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationOffer_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationOffer" ADD CONSTRAINT "QuotationOffer_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationOffer_tenantId_quotationId_lineId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationOffer" ADD CONSTRAINT "QuotationOffer_tenantId_quotationId_lineId_fkey" FOREIGN KEY ("tenantId", "quotationId", "lineId") REFERENCES "QuotationLine"("tenantId", "quotationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationDocument_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationDocument" ADD CONSTRAINT "QuotationDocument_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationAttachment_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationAttachment" ADD CONSTRAINT "QuotationAttachment_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationEvent_tenantId_quotationId_fkey' AND connamespace = current_schema()::regnamespace) THEN
    ALTER TABLE "QuotationEvent" ADD CONSTRAINT "QuotationEvent_tenantId_quotationId_fkey" FOREIGN KEY ("tenantId", "quotationId") REFERENCES "Quotation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Quotation_status_check' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_status_check" CHECK ("status" IN ('REQUESTED','SOURCING','QUOTING','AWAITING_APPROVAL','FULFILLMENT','ON_HOLD','CLOSED','REJECTED','CANCELED') AND "version" > 0);
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_balances_check' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_balances_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "taxPct" BETWEEN 0 AND 100 AND "approvedQty" BETWEEN 0 AND "quantity" AND "orderedQty" BETWEEN 0 AND "approvedQty" AND "receivedQty" BETWEEN 0 AND "approvedQty" AND "executedQty" BETWEEN 0 AND "approvedQty" AND "invoicedQty" BETWEEN 0 AND "approvedQty" AND "dispatchedQty" BETWEEN 0 AND "invoicedQty" AND "deliveredQty" BETWEEN 0 AND "dispatchedQty" AND (("kind" = 'SERVICE' AND "route" = 'SERVICE') OR ("kind" = 'PART' AND "route" IN ('BUY','MAKE','STOCK'))));
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationAttachment_size_check' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationAttachment" ADD CONSTRAINT "QuotationAttachment_size_check" CHECK ("size" BETWEEN 1 AND 10485760);
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationRevision_evidence_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationRevision" ADD CONSTRAINT "QuotationRevision_evidence_fkey" FOREIGN KEY ("tenantId","quotationId","evidenceId") REFERENCES "QuotationAttachment"("tenantId","quotationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationOffer_evidence_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationOffer" ADD CONSTRAINT "QuotationOffer_evidence_fkey" FOREIGN KEY ("tenantId","quotationId","evidenceId") REFERENCES "QuotationAttachment"("tenantId","quotationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationDocument_evidence_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationDocument" ADD CONSTRAINT "QuotationDocument_evidence_fkey" FOREIGN KEY ("tenantId","quotationId","evidenceId") REFERENCES "QuotationAttachment"("tenantId","quotationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationLine_manufacturingOrderId_unique" ON "QuotationLine" ("tenantId","manufacturingOrderId") WHERE "manufacturingOrderId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "QuotationOffer_selected_unique" ON "QuotationOffer" ("tenantId","quotationId","lineId") WHERE "selected";
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_inventoryItem_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_inventoryItem_fkey" FOREIGN KEY ("tenantId","inventoryItemId") REFERENCES "InventoryItem"("tenantId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_serviceOrder_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_serviceOrder_fkey" FOREIGN KEY ("tenantId","serviceOrderId") REFERENCES "WorkOrder"("tenantId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_manufacturingOrder_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_manufacturingOrder_fkey" FOREIGN KEY ("tenantId","manufacturingOrderId") REFERENCES "ManufacturingOrder"("tenantId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationDocument_source_fkey' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationDocument" ADD CONSTRAINT "QuotationDocument_source_fkey" FOREIGN KEY ("tenantId","quotationId","sourceDocumentId") REFERENCES "QuotationDocument"("tenantId","quotationId","id") ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationLine_fulfillment_check' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_fulfillment_check" CHECK ("invoicedQty" <= CASE WHEN "kind" = 'PART' THEN "receivedQty" ELSE "executedQty" END AND ("route" NOT IN ('BUY','MAKE') OR "receivedQty" <= "orderedQty"));
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuotationOffer_values_check' AND connamespace = current_schema()::regnamespace) THEN
 ALTER TABLE "QuotationOffer" ADD CONSTRAINT "QuotationOffer_values_check" CHECK ("unitCost" >= 0 AND "leadDays" BETWEEN 0 AND 3650);
 END IF;
END $$;


COMMIT;
