ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "assemblyActivityId" text;

DO $$ BEGIN
  ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assemblyActivityId_fkey"
    FOREIGN KEY ("assemblyActivityId") REFERENCES "AssemblyActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Attachment_tenantId_assemblyActivityId_createdAt_idx"
  ON "Attachment"("tenantId", "assemblyActivityId", "createdAt" DESC);
