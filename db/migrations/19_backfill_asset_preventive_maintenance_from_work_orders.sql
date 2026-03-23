INSERT INTO "public"."AssetPreventiveMaintenance" (
  "id",
  "tenantId",
  "assetId",
  "pmPlanId",
  "workOrderId",
  "source",
  "executedAt",
  "note",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'wo:' || w."id" AS "id",
  w."tenantId",
  a."id" AS "assetId",
  w."pmPlanId",
  w."id" AS "workOrderId",
  'WORK_ORDER'::"public"."PreventiveMaintenanceSource" AS "source",
  COALESCE(w."deliveredAt", w."completedAt", w."updatedAt", w."dueDate", w."createdAt") AS "executedAt",
  NULL AS "note",
  NULL AS "createdByUserId",
  COALESCE(w."completedAt", w."deliveredAt", w."createdAt", CURRENT_TIMESTAMP) AS "createdAt",
  COALESCE(w."updatedAt", w."completedAt", w."deliveredAt", CURRENT_TIMESTAMP) AS "updatedAt"
FROM "public"."WorkOrder" w
JOIN "public"."Asset" a
  ON a."tenantId" = w."tenantId"
 AND a."code" = w."assetCode"
WHERE w."kind" = 'SERVICE_ORDER'::"public"."WorkOrderKind"
  AND w."serviceOrderType" = 'PREVENTIVO'::"public"."ServiceOrderType"
  AND w."status" IN ('COMPLETED'::"public"."WorkOrderStatus", 'CLOSED'::"public"."WorkOrderStatus")
  AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt", w."dueDate", w."createdAt") IS NOT NULL
ON CONFLICT ("workOrderId") DO UPDATE
SET
  "tenantId" = EXCLUDED."tenantId",
  "assetId" = EXCLUDED."assetId",
  "pmPlanId" = EXCLUDED."pmPlanId",
  "source" = EXCLUDED."source",
  "executedAt" = EXCLUDED."executedAt",
  "updatedAt" = CURRENT_TIMESTAMP;
