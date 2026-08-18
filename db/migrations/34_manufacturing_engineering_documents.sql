DO $$ BEGIN
  CREATE TYPE "EngineeringDiscipline" AS ENUM ('MECHANICAL', 'ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'AUTOMATION', 'SOFTWARE', 'QUALITY', 'GENERAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EngineeringDocumentType" AS ENUM ('DRAWING', 'SCHEMATIC', 'SPECIFICATION', 'DATASHEET', 'PROGRAM', 'MANUAL', 'CALCULATION', 'PROCEDURE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EngineeringRevisionStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'RELEASED', 'OBSOLETE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "manufacturingOrderId" text;

-- El esquema base exige que cada adjunto tenga propietario. Al sumar nuevos
-- propietarios funcionales, la restricción debe conocerlos para no bloquear
-- evidencias de ensamble ni revisiones documentales de Manufactura.
ALTER TABLE "Attachment" DROP CONSTRAINT IF EXISTS "attachment_owner_not_null_ck";
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_owner_not_null_ck" CHECK (
  "workOrderId" IS NOT NULL OR
  "assetId" IS NOT NULL OR
  "assemblyActivityId" IS NOT NULL OR
  "manufacturingOrderId" IS NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_manufacturingOrderId_fkey"
    FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EngineeringDocument" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "discipline" "EngineeringDiscipline" NOT NULL,
  "documentType" "EngineeringDocumentType" NOT NULL,
  "systemName" text,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdByUserId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineeringDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringDocument_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "EngineeringDocumentRevision" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "documentId" text NOT NULL,
  "sequence" integer NOT NULL,
  "revisionCode" text NOT NULL,
  "status" "EngineeringRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "changeSummary" text NOT NULL,
  "fileAttachmentId" text NOT NULL,
  "sourceFilename" text NOT NULL,
  "fileSha256" text NOT NULL,
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
  CONSTRAINT "EngineeringDocumentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineeringDocumentRevision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringDocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "EngineeringDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringDocumentRevision_fileAttachmentId_fkey" FOREIGN KEY ("fileAttachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EngineeringDocumentRevision_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "EngineeringDocumentRevision_sha256_check" CHECK (length("fileSha256") = 64)
);

DO $$ BEGIN
  ALTER TABLE "EngineeringDocumentRevision" ADD CONSTRAINT "EngineeringDocumentRevision_sequence_check" CHECK ("sequence" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EngineeringDocumentRevision" ADD CONSTRAINT "EngineeringDocumentRevision_sha256_check" CHECK (length("fileSha256") = 64);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Attachment_tenantId_manufacturingOrderId_createdAt_idx" ON "Attachment"("tenantId", "manufacturingOrderId", "createdAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringDocument_manufacturingOrderId_code_key" ON "EngineeringDocument"("manufacturingOrderId", "code");
CREATE INDEX IF NOT EXISTS "EngineeringDocument_tenantId_manufacturingOrderId_discipline_idx" ON "EngineeringDocument"("tenantId", "manufacturingOrderId", "discipline");
CREATE INDEX IF NOT EXISTS "EngineeringDocument_tenantId_active_updatedAt_idx" ON "EngineeringDocument"("tenantId", "active", "updatedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringDocumentRevision_fileAttachmentId_key" ON "EngineeringDocumentRevision"("fileAttachmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringDocumentRevision_documentId_sequence_key" ON "EngineeringDocumentRevision"("documentId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringDocumentRevision_documentId_revisionCode_key" ON "EngineeringDocumentRevision"("documentId", "revisionCode");
CREATE INDEX IF NOT EXISTS "EngineeringDocumentRevision_tenantId_documentId_status_idx" ON "EngineeringDocumentRevision"("tenantId", "documentId", "status");
CREATE INDEX IF NOT EXISTS "EngineeringDocumentRevision_tenantId_status_updatedAt_idx" ON "EngineeringDocumentRevision"("tenantId", "status", "updatedAt" DESC);
