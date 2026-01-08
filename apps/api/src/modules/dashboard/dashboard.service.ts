import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma, WorkOrderStatus } from '@prisma/client';

type SummaryArgs = {
  tenantId: string;
  days?: number;
  from?: string;
  to?: string;
};

const FINAL_STATUSES: WorkOrderStatus[] = ['COMPLETED', 'CLOSED', 'CANCELED'];

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function parseRange(args: SummaryArgs) {
  const now = new Date();
  let to = args.to ? new Date(args.to) : now;
  if (Number.isNaN(to.getTime())) to = now;

  const days = args.days ? clampInt(args.days, 1, 365) : 30;

  let from = args.from ? new Date(args.from) : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime())) from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  // normaliza: from siempre < to
  if (from.getTime() >= to.getTime()) {
    from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  }

  return { from, to, days };
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async summary(args: SummaryArgs) {
    const { tenantId } = args;
    const { from, to, days } = parseRange(args);

    // --- Assets ---
    const [assetsTotal, assetsByStatusRows, assetsByCritRows] = await Promise.all([
      this.prisma.asset.count({ where: { tenantId } }),
      this.prisma.asset.groupBy({ by: ['status'], where: { tenantId }, _count: { id: true } }),
      this.prisma.asset.groupBy({ by: ['criticality'], where: { tenantId }, _count: { id: true } }),
    ]);

    const assetsByStatus: Record<string, number> = {};
    for (const r of assetsByStatusRows) assetsByStatus[r.status] = r._count.id;

    const assetsByCriticality: Record<string, number> = {};
    for (const r of assetsByCritRows) assetsByCriticality[r.criticality] = r._count.id;

    const criticalHigh = assetsByCriticality['HIGH'] ?? 0;

    // Activos con SO abiertas (conteo de assetCode únicos con backlog)
    const assetsWithOpenSORows = await this.prisma.workOrder.findMany({
      where: { tenantId, kind: 'SERVICE_ORDER', status: { notIn: FINAL_STATUSES } },
      select: { assetCode: true },
      distinct: ['assetCode'],
      take: 10000,
    });
    const assetsWithOpenServiceOrders = assetsWithOpenSORows.length;

    const topAssetsByOpenSO = await this.prisma.workOrder.groupBy({
      by: ['assetCode'],
      where: { tenantId, kind: 'SERVICE_ORDER', status: { notIn: FINAL_STATUSES } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const topAssetsByOpenAlerts = await this.prisma.alert.groupBy({
      by: ['assetCode'],
      where: { tenantId, status: 'OPEN' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    // --- Alerts ---
    const [alertsOpen, recentAlerts] = await Promise.all([
      this.prisma.alert.count({ where: { tenantId, status: 'OPEN' } }),
      this.prisma.alert.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, kind: true, assetCode: true, sensor: true, message: true, status: true, createdAt: true },
      }),
    ]);

    // --- Service / Backlog ---
    const backlogByStatusRows = await this.prisma.workOrder.groupBy({
      by: ['status'],
      where: { tenantId, kind: 'SERVICE_ORDER', status: { notIn: FINAL_STATUSES } },
      _count: { id: true },
      orderBy: { status: 'asc' },
    });
    const backlogByStatus: Record<string, number> = {};
    for (const r of backlogByStatusRows) backlogByStatus[r.status] = r._count.id;

    const backlogTotal = Object.values(backlogByStatus).reduce((a, b) => a + b, 0);

    const overdue = await this.prisma.workOrder.count({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        status: { notIn: FINAL_STATUSES },
        dueDate: { lt: new Date() },
      },
    });

    const unassigned = await this.prisma.workOrder.count({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        status: { notIn: FINAL_STATUSES },
        assignments: { none: { state: 'ACTIVE' } },
      },
    });

    // Tendencias (creadas/cerradas) en el rango
    const trendCreated = await this.prisma.$queryRaw<{ day: string; count: number }[]>(
      Prisma.sql`
        SELECT date_trunc('day',"createdAt")::date AS day,
               COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to}
        GROUP BY day
        ORDER BY day ASC;
      `
    );

    const trendClosed = await this.prisma.$queryRaw<{ day: string; count: number }[]>(
      Prisma.sql`
        SELECT date_trunc('day', COALESCE("deliveredAt","completedAt","updatedAt"))::date AS day,
               COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "status" IN ('COMPLETED','CLOSED')
          AND COALESCE("deliveredAt","completedAt","updatedAt") >= ${from}
          AND COALESCE("deliveredAt","completedAt","updatedAt") < ${to}
        GROUP BY day
        ORDER BY day ASC;
      `
    );

    const [{ count: createdInRange } = { count: 0 }] = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "createdAt" >= ${from}
          AND "createdAt" < ${to};
      `
    );

    const [{ count: closedInRange } = { count: 0 }] = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "status" IN ('COMPLETED','CLOSED')
          AND COALESCE("deliveredAt","completedAt","updatedAt") >= ${from}
          AND COALESCE("deliveredAt","completedAt","updatedAt") < ${to};
      `
    );

    const [{ avgSeconds } = { avgSeconds: null as number | null }] = await this.prisma.$queryRaw<
      { avgSeconds: number | null }[]
    >(
      Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (COALESCE("deliveredAt","completedAt","updatedAt") - "createdAt")))::float AS "avgSeconds"
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "status" IN ('COMPLETED','CLOSED')
          AND COALESCE("deliveredAt","completedAt","updatedAt") >= ${from}
          AND COALESCE("deliveredAt","completedAt","updatedAt") < ${to};
      `
    );
    const mttrHours = avgSeconds == null ? null : Math.round((avgSeconds / 3600) * 10) / 10;

    // Workload por técnico (asignaciones activas en backlog)
    const assignments = await this.prisma.wOAssignment.groupBy({
      by: ['userId'],
      where: {
        tenantId,
        state: 'ACTIVE',
        role: 'TECHNICIAN',
        workOrder: {
          kind: 'SERVICE_ORDER',
          status: { notIn: FINAL_STATUSES },
        },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const userIds = assignments.map(a => a.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userMap = new Map(users.map(u => [u.id, u.name]));

    const technicianWorkload = assignments.map(a => ({
      userId: a.userId,
      name: userMap.get(a.userId) ?? 'Sin nombre',
      openAssigned: a._count.id,
    }));


    // Desempeño por técnico (órdenes cerradas en el rango + horas trabajadas)
    const round = (n: number, digits = 1) => {
      const f = Math.pow(10, digits);
      return Math.round(n * f) / f;
    };

    type TechPerfRow = {
      userId: string;
      name: string;
      closedCount: number;
      avgCycleSeconds: number | null;
      avgResponseSeconds: number | null;
      dueCount: number;
      onTimeCount: number;
      workSeconds: number | null;
      workedOrders: number;
    };

    const techPerfRows = await this.prisma.$queryRaw<TechPerfRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w."id",
            w."createdAt",
            w."startedAt",
            w."dueDate",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "closedAt"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        assignments AS (
          SELECT DISTINCT a."userId", a."workOrderId"
          FROM "WOAssignment" a
          JOIN closed_orders c ON c."id" = a."workOrderId"
          WHERE a."tenantId" = ${tenantId}
            AND a."role" = 'TECHNICIAN'
        ),
        per_tech_orders AS (
          SELECT
            a."userId",
            COUNT(*)::int AS "closedCount",
            AVG(EXTRACT(EPOCH FROM (c."closedAt" - c."createdAt")))::float AS "avgCycleSeconds",
            AVG(EXTRACT(EPOCH FROM (c."startedAt" - c."createdAt"))) FILTER (WHERE c."startedAt" IS NOT NULL)::float AS "avgResponseSeconds",
            SUM(CASE WHEN c."dueDate" IS NOT NULL THEN 1 ELSE 0 END)::int AS "dueCount",
            SUM(CASE WHEN c."dueDate" IS NOT NULL AND c."closedAt" <= c."dueDate" THEN 1 ELSE 0 END)::int AS "onTimeCount"
          FROM assignments a
          JOIN closed_orders c ON c."id" = a."workOrderId"
          GROUP BY a."userId"
        ),
        per_tech_work AS (
          SELECT
            l."userId",
            SUM(EXTRACT(EPOCH FROM ((COALESCE(l."endedAt", c."closedAt")) - l."startedAt")))::float AS "workSeconds",
            COUNT(DISTINCT l."workOrderId")::int AS "workedOrders"
          FROM "WorkLog" l
          JOIN closed_orders c ON c."id" = l."workOrderId"
          WHERE l."tenantId" = ${tenantId}
            AND l."startedAt" < c."closedAt"
          GROUP BY l."userId"
        )
        SELECT
          o."userId",
          u."name",
          o."closedCount",
          o."avgCycleSeconds",
          o."avgResponseSeconds",
          o."dueCount",
          o."onTimeCount",
          COALESCE(w."workSeconds", 0)::float AS "workSeconds",
          COALESCE(w."workedOrders", 0)::int AS "workedOrders"
        FROM per_tech_orders o
        JOIN "User" u ON u."id" = o."userId" AND u."tenantId" = ${tenantId}
        LEFT JOIN per_tech_work w ON w."userId" = o."userId"
        ORDER BY o."closedCount" DESC;
      `
    );

    const now = new Date();
    const overdueRows = await this.prisma.$queryRaw<{ userId: string; overdueOpen: number }[]>(
      Prisma.sql`
        SELECT a."userId", COUNT(*)::int AS "overdueOpen"
        FROM "WOAssignment" a
        JOIN "WorkOrder" w ON w."id" = a."workOrderId"
        WHERE a."tenantId" = ${tenantId}
          AND a."role" = 'TECHNICIAN'
          AND a."state" = 'ACTIVE'
          AND w."tenantId" = ${tenantId}
          AND w."kind" = 'SERVICE_ORDER'
          AND w."status" NOT IN ('COMPLETED','CLOSED','CANCELED')
          AND w."dueDate" IS NOT NULL
          AND w."dueDate" < ${now}
        GROUP BY a."userId";
      `
    );

    const openMap = new Map(technicianWorkload.map(t => [t.userId, t.openAssigned]));
    const overdueMap = new Map(overdueRows.map(r => [r.userId, r.overdueOpen]));

    const technicianPerformance = techPerfRows.map(r => {
      const totalWorkHours = round((r.workSeconds ?? 0) / 3600, 1);
      const avgCycleHours = r.avgCycleSeconds == null ? null : round(r.avgCycleSeconds / 3600, 1);
      const avgResponseHours = r.avgResponseSeconds == null ? null : round(r.avgResponseSeconds / 3600, 1);
      const avgWorkHoursPerSO = r.closedCount ? round(totalWorkHours / r.closedCount, 2) : null;
      const onTimeRate = r.dueCount ? round((r.onTimeCount / r.dueCount) * 100, 0) : null;

      return {
        userId: r.userId,
        name: r.name ?? 'Sin nombre',
        closedInRange: r.closedCount,
        workedOrdersInRange: r.workedOrders,
        totalWorkHours,
        avgWorkHoursPerSO,
        avgCycleHours,
        avgResponseHours,
        onTimeRate,
        openAssigned: openMap.get(r.userId) ?? 0,
        overdueOpenAssigned: overdueMap.get(r.userId) ?? 0,
      };
    });

    // Productividad semanal por técnico (cerradas por semana + horas trabajadas por semana)
    type TechWeeklyRow = {
      userId: string;
      name: string | null;
      weekStart: string;
      closedCount: number;
      workSeconds: number;
    };

    const techWeeklyRows = await this.prisma.$queryRaw<TechWeeklyRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w."id",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "closedAt"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        assigned_closed AS (
          SELECT DISTINCT a."userId", c."id" AS "workOrderId", date_trunc('week', c."closedAt")::date AS "weekStart"
          FROM "WOAssignment" a
          JOIN closed_orders c ON c."id" = a."workOrderId"
          WHERE a."tenantId" = ${tenantId}
            AND a."role" = 'TECHNICIAN'
        ),
        closed_week AS (
          SELECT "userId", "weekStart", COUNT(*)::int AS "closedCount"
          FROM assigned_closed
          GROUP BY "userId", "weekStart"
        ),
        work_week AS (
          SELECT
            l."userId",
            date_trunc('week', l."startedAt")::date AS "weekStart",
            SUM(EXTRACT(EPOCH FROM (COALESCE(l."endedAt", ${to}) - l."startedAt")))::float AS "workSeconds"
          FROM "WorkLog" l
          JOIN "WorkOrder" w ON w."id" = l."workOrderId"
          WHERE l."tenantId" = ${tenantId}
            AND w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND l."startedAt" >= ${from}
            AND l."startedAt" < ${to}
          GROUP BY l."userId", "weekStart"
        )
        SELECT
          COALESCE(c."userId", ww."userId") AS "userId",
          u."name" AS "name",
          COALESCE(c."weekStart", ww."weekStart")::text AS "weekStart",
          COALESCE(c."closedCount", 0)::int AS "closedCount",
          COALESCE(ww."workSeconds", 0)::float AS "workSeconds"
        FROM closed_week c
        FULL OUTER JOIN work_week ww
          ON ww."userId" = c."userId" AND ww."weekStart" = c."weekStart"
        JOIN "User" u
          ON u."id" = COALESCE(c."userId", ww."userId")
         AND u."tenantId" = ${tenantId}
        ORDER BY "weekStart" ASC, "closedCount" DESC;
      `
    );

    const technicianWeeklyProductivity = techWeeklyRows.map(r => ({
      userId: r.userId,
      name: r.name ?? 'Sin nombre',
      weekStart: r.weekStart,
      closedCount: r.closedCount,
      workHours: round((r.workSeconds ?? 0) / 3600, 1),
    }));


    return {
      range: { from: from.toISOString(), to: to.toISOString(), days },

      assets: {
        total: assetsTotal,
        byStatus: assetsByStatus,
        byCriticality: assetsByCriticality,
        criticalHigh,
        withOpenServiceOrders: assetsWithOpenServiceOrders,
        topAssetsByOpenSO: topAssetsByOpenSO.map(r => ({ assetCode: r.assetCode, openSO: r._count.id })),
        topAssetsByOpenAlerts: topAssetsByOpenAlerts.map(r => ({ assetCode: r.assetCode, openAlerts: r._count.id })),
      },

      alerts: {
        open: alertsOpen,
        recent: recentAlerts,
      },

      service: {
        backlogTotal,
        backlogByStatus,
        overdue,
        unassigned,
        createdInRange,
        closedInRange,
        mttrHours,
        trendCreated,
        trendClosed,
        technicianWorkload,
        technicianPerformance,
        technicianWeeklyProductivity,
      },
    };
  }
}
