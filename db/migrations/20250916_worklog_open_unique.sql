-- Garantiza como máximo un WorkLog abierto (ended_at IS NULL) por (tenant_id, work_order_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uniq_open_worklog_tenant_wo_user'
  ) THEN
    CREATE UNIQUE INDEX uniq_open_worklog_tenant_wo_user
      ON public."WorkLog" ("tenantId", "workOrderId", "userId")
      WHERE "endedAt" IS NULL;
  END IF;
END $$;


--Para revertir (si hiciera falta):
--DROP INDEX IF EXISTS public.uniq_open_worklog_tenant_wo_user;