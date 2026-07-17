DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceOrderIssueNoteStage') THEN
    CREATE TYPE "public"."ServiceOrderIssueNoteStage" AS ENUM ('PENDING', 'EXECUTED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."ServiceOrderIssueNote" (
  "id" text NOT NULL,
  "tenantId" text NOT NULL,
  "workOrderId" text NOT NULL,
  "noteId" text NOT NULL,
  "text" text NOT NULL,
  "stage" "public"."ServiceOrderIssueNoteStage" NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" text,
  "createdByName" text,
  "executedAt" timestamp(3) without time zone,
  "executedByUserId" text,
  "executedByName" text,
  "sourceServiceOrderId" text,
  "sourceIssueNoteId" text,
  "sourceRecordId" text,
  "executedServiceOrderId" text,
  "executedIssueNoteId" text,
  "executedRecordId" text,
  "copiedAt" timestamp(3) without time zone,
  "copiedReason" text,
  "updatedAt" timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOrderIssueNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOrderIssueNote_tenantId_workOrderId_noteId_key" UNIQUE ("tenantId", "workOrderId", "noteId"),
  CONSTRAINT "ServiceOrderIssueNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderIssueNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderIssueNote_sourceServiceOrderId_fkey" FOREIGN KEY ("sourceServiceOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ServiceOrderIssueNote_executedServiceOrderId_fkey" FOREIGN KEY ("executedServiceOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "public"."ServiceOrderIssueNote" (
  "id", "tenantId", "workOrderId", "noteId", "text", "stage",
  "createdAt", "createdByUserId", "createdByName",
  "executedAt", "executedByUserId", "executedByName",
  "sourceServiceOrderId", "sourceIssueNoteId",
  "executedServiceOrderId", "executedIssueNoteId",
  "copiedAt", "copiedReason", "updatedAt"
)
SELECT
  work_order."id" || ':' || note.value->>'id',
  work_order."tenantId",
  work_order."id",
  note.value->>'id',
  btrim(note.value->>'text'),
  CASE WHEN upper(COALESCE(note.value->>'stage', 'PENDING')) = 'EXECUTED'
    THEN 'EXECUTED'::"public"."ServiceOrderIssueNoteStage"
    ELSE 'PENDING'::"public"."ServiceOrderIssueNoteStage"
  END,
  CASE WHEN COALESCE(note.value->>'createdAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
    THEN (note.value->>'createdAt')::timestamp
    ELSE work_order."createdAt"
  END,
  NULLIF(note.value->>'createdByUserId', ''),
  NULLIF(note.value->>'createdByName', ''),
  CASE WHEN COALESCE(note.value->>'executedAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
    THEN (note.value->>'executedAt')::timestamp
    ELSE NULL
  END,
  NULLIF(note.value->>'executedByUserId', ''),
  NULLIF(note.value->>'executedByName', ''),
  source_order."id",
  CASE WHEN source_order."id" IS NOT NULL THEN NULLIF(note.value->>'sourceIssueNoteId', '') ELSE NULL END,
  executed_order."id",
  CASE WHEN executed_order."id" IS NOT NULL THEN NULLIF(note.value->>'executedIssueNoteId', '') ELSE NULL END,
  CASE WHEN COALESCE(note.value->>'copiedAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
    THEN (note.value->>'copiedAt')::timestamp
    ELSE NULL
  END,
  NULLIF(note.value->>'copiedReason', ''),
  CURRENT_TIMESTAMP
FROM "public"."WorkOrder" AS work_order
CROSS JOIN LATERAL (
  SELECT DISTINCT ON (entry.value->>'id') entry.value
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(work_order."formData"->'issueNotes') = 'array' THEN work_order."formData"->'issueNotes'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS entry(value, ordinal)
  WHERE NULLIF(entry.value->>'id', '') IS NOT NULL
    AND NULLIF(btrim(entry.value->>'text'), '') IS NOT NULL
  ORDER BY entry.value->>'id', entry.ordinal DESC
) AS note(value)
LEFT JOIN "public"."WorkOrder" AS source_order
  ON source_order."id" = NULLIF(note.value->>'sourceServiceOrderId', '')
  AND source_order."tenantId" = work_order."tenantId"
LEFT JOIN "public"."WorkOrder" AS executed_order
  ON executed_order."id" = NULLIF(note.value->>'executedServiceOrderId', '')
  AND executed_order."tenantId" = work_order."tenantId"
WHERE work_order."kind" = 'SERVICE_ORDER'
ON CONFLICT ("id") DO UPDATE SET
  "text" = EXCLUDED."text",
  "stage" = EXCLUDED."stage",
  "createdAt" = EXCLUDED."createdAt",
  "createdByUserId" = EXCLUDED."createdByUserId",
  "createdByName" = EXCLUDED."createdByName",
  "executedAt" = EXCLUDED."executedAt",
  "executedByUserId" = EXCLUDED."executedByUserId",
  "executedByName" = EXCLUDED."executedByName",
  "sourceServiceOrderId" = EXCLUDED."sourceServiceOrderId",
  "sourceIssueNoteId" = EXCLUDED."sourceIssueNoteId",
  "executedServiceOrderId" = EXCLUDED."executedServiceOrderId",
  "executedIssueNoteId" = EXCLUDED."executedIssueNoteId",
  "copiedAt" = EXCLUDED."copiedAt",
  "copiedReason" = EXCLUDED."copiedReason",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "public"."ServiceOrderIssueNote" AS note
SET "sourceRecordId" = source_note."id"
FROM "public"."ServiceOrderIssueNote" AS source_note
WHERE note."sourceServiceOrderId" = source_note."workOrderId"
  AND note."sourceIssueNoteId" = source_note."noteId"
  AND note."tenantId" = source_note."tenantId";

UPDATE "public"."ServiceOrderIssueNote" AS note
SET "executedRecordId" = executed_note."id"
FROM "public"."ServiceOrderIssueNote" AS executed_note
WHERE note."executedServiceOrderId" = executed_note."workOrderId"
  AND note."executedIssueNoteId" = executed_note."noteId"
  AND note."tenantId" = executed_note."tenantId";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderIssueNote_sourceRecordId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderIssueNote"
      ADD CONSTRAINT "ServiceOrderIssueNote_sourceRecordId_fkey"
      FOREIGN KEY ("sourceRecordId") REFERENCES "public"."ServiceOrderIssueNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOrderIssueNote_executedRecordId_fkey') THEN
    ALTER TABLE "public"."ServiceOrderIssueNote"
      ADD CONSTRAINT "ServiceOrderIssueNote_executedRecordId_fkey"
      FOREIGN KEY ("executedRecordId") REFERENCES "public"."ServiceOrderIssueNote"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_workOrderId_stage_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "workOrderId", "stage");
CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_sourceServiceOrderId_sourceIssueNoteId_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "sourceServiceOrderId", "sourceIssueNoteId");
CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_sourceRecordId_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "sourceRecordId");
CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_executedServiceOrderId_executedIssueNoteId_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "executedServiceOrderId", "executedIssueNoteId");
CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_executedRecordId_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "executedRecordId");
CREATE INDEX IF NOT EXISTS "ServiceOrderIssueNote_tenantId_stage_createdAt_idx"
  ON "public"."ServiceOrderIssueNote" ("tenantId", "stage", "createdAt" DESC);
