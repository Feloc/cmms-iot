DO $$ BEGIN
  CREATE TYPE "EngineeringReleaseStatus" AS ENUM ('DRAFT', 'RELEASED', 'SUPERSEDED', 'CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EngineeringRelease" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "manufacturingOrderId" text NOT NULL,
  "sequence" integer NOT NULL,
  "releaseCode" text NOT NULL,
  "status" "EngineeringReleaseStatus" NOT NULL DEFAULT 'DRAFT',
  "lockVersion" integer NOT NULL DEFAULT 1,
  "title" text NOT NULL,
  "notes" text,
  "bomRevisionId" text NOT NULL,
  "bomCodeSnapshot" text NOT NULL,
  "bomRevisionCodeSnapshot" text NOT NULL,
  "bomLineCountSnapshot" integer NOT NULL,
  "createdByUserId" text NOT NULL,
  "releasedAt" timestamp(3),
  "releasedByUserId" text,
  "releasedByName" text,
  "validationSnapshot" jsonb,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineeringRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringRelease_manufacturingOrderId_fkey" FOREIGN KEY ("manufacturingOrderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringRelease_bomRevisionId_fkey" FOREIGN KEY ("bomRevisionId") REFERENCES "ManufacturingBomRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EngineeringRelease_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "EngineeringRelease_lock_version_check" CHECK ("lockVersion" > 0),
  CONSTRAINT "EngineeringRelease_bom_line_count_check" CHECK ("bomLineCountSnapshot" >= 0)
);

CREATE TABLE IF NOT EXISTS "EngineeringReleaseDocument" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "releaseId" text NOT NULL,
  "documentRevisionId" text NOT NULL,
  "documentCodeSnapshot" text NOT NULL,
  "documentNameSnapshot" text NOT NULL,
  "disciplineSnapshot" "EngineeringDiscipline" NOT NULL,
  "revisionCodeSnapshot" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineeringReleaseDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EngineeringReleaseDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringReleaseDocument_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "EngineeringRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EngineeringReleaseDocument_documentRevisionId_fkey" FOREIGN KEY ("documentRevisionId") REFERENCES "EngineeringDocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

DO $$ BEGIN
  ALTER TABLE "EngineeringRelease" ADD CONSTRAINT "EngineeringRelease_sequence_check" CHECK ("sequence" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EngineeringRelease" ADD CONSTRAINT "EngineeringRelease_lock_version_check" CHECK ("lockVersion" > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EngineeringRelease" ADD CONSTRAINT "EngineeringRelease_bom_line_count_check" CHECK ("bomLineCountSnapshot" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringRelease_order_sequence_key" ON "EngineeringRelease"("manufacturingOrderId", "sequence");
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringRelease_order_code_key" ON "EngineeringRelease"("manufacturingOrderId", "releaseCode");
CREATE INDEX IF NOT EXISTS "EngineeringRelease_tenant_order_status_sequence_idx" ON "EngineeringRelease"("tenantId", "manufacturingOrderId", "status", "sequence" DESC);
CREATE INDEX IF NOT EXISTS "EngineeringRelease_tenant_status_releasedAt_idx" ON "EngineeringRelease"("tenantId", "status", "releasedAt" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineeringReleaseDocument_release_revision_key" ON "EngineeringReleaseDocument"("releaseId", "documentRevisionId");
CREATE INDEX IF NOT EXISTS "EngineeringReleaseDocument_tenant_release_idx" ON "EngineeringReleaseDocument"("tenantId", "releaseId");
CREATE INDEX IF NOT EXISTS "EngineeringReleaseDocument_tenant_revision_idx" ON "EngineeringReleaseDocument"("tenantId", "documentRevisionId");
