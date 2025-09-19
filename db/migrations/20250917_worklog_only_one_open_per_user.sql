-- Quitar índice anterior si existía (opcional)
DROP INDEX IF EXISTS public.uniq_open_worklog_tenant_wo_user;

-- Un (1) log abierto por (tenantId, userId) en todo el sistema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uniq_open_worklog_tenant_user'
  ) THEN
    CREATE UNIQUE INDEX uniq_open_worklog_tenant_user
      ON public."WorkLog" ("tenantId", "userId")
      WHERE "endedAt" IS NULL;
  END IF;
END $$;
