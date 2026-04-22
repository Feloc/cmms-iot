import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Prisma, WorkOrderStatus } from '@prisma/client';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

type SummaryArgs = {
  tenantId: string;
  days?: number;
  from?: string;
  to?: string;
  tab?: string;
  sections?: string;
  selectedTechId?: string;
  selectedNegotiationMonth?: string;
  opDim?: string;
  opMetric?: string;
  opSegment?: string;
};

const DASHBOARD_DAY_DEFS = [
  {
    key: 'monday',
    dow: 1,
    enabledField: 'dashboardWorkMonday',
    startField: 'dashboardWorkMondayStartTime',
    endField: 'dashboardWorkMondayEndTime',
    mealField: 'dashboardWorkMondayMealBreakMinutes',
  },
  {
    key: 'tuesday',
    dow: 2,
    enabledField: 'dashboardWorkTuesday',
    startField: 'dashboardWorkTuesdayStartTime',
    endField: 'dashboardWorkTuesdayEndTime',
    mealField: 'dashboardWorkTuesdayMealBreakMinutes',
  },
  {
    key: 'wednesday',
    dow: 3,
    enabledField: 'dashboardWorkWednesday',
    startField: 'dashboardWorkWednesdayStartTime',
    endField: 'dashboardWorkWednesdayEndTime',
    mealField: 'dashboardWorkWednesdayMealBreakMinutes',
  },
  {
    key: 'thursday',
    dow: 4,
    enabledField: 'dashboardWorkThursday',
    startField: 'dashboardWorkThursdayStartTime',
    endField: 'dashboardWorkThursdayEndTime',
    mealField: 'dashboardWorkThursdayMealBreakMinutes',
  },
  {
    key: 'friday',
    dow: 5,
    enabledField: 'dashboardWorkFriday',
    startField: 'dashboardWorkFridayStartTime',
    endField: 'dashboardWorkFridayEndTime',
    mealField: 'dashboardWorkFridayMealBreakMinutes',
  },
  {
    key: 'saturday',
    dow: 6,
    enabledField: 'dashboardWorkSaturday',
    startField: 'dashboardWorkSaturdayStartTime',
    endField: 'dashboardWorkSaturdayEndTime',
    mealField: 'dashboardWorkSaturdayMealBreakMinutes',
  },
  {
    key: 'sunday',
    dow: 0,
    enabledField: 'dashboardWorkSunday',
    startField: 'dashboardWorkSundayStartTime',
    endField: 'dashboardWorkSundayEndTime',
    mealField: 'dashboardWorkSundayMealBreakMinutes',
  },
] as const;

type DashboardWorkSchedule = {
  averageHoursPerDay: number;
  daysByWeekday: Map<number, { enabled: boolean; startTime: string; endTime: string; mealBreakMinutes: number; hours: number }>;
  excludeNonWorkingDates: boolean;
  nonWorkingDates: Set<string>;
};

const FINAL_STATUSES: WorkOrderStatus[] = ['COMPLETED', 'CLOSED', 'CANCELED'];

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function addDaysUTC(d: Date, days: number) {
  const nd = new Date(d.getTime());
  nd.setUTCDate(nd.getUTCDate() + days);
  return nd;
}

function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonthsUTC(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function toDateKeyUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Count configured work days in [from, to) using UTC dates */
function businessDaysBetweenUTC(
  from: Date,
  to: Date,
  daysByWeekday: Map<number, { enabled: boolean }>,
  nonWorkingDates?: Set<string>,
) {
  const a = startOfDayUTC(from);
  const b = startOfDayUTC(to);
  if (a.getTime() >= b.getTime()) return 0;

  let count = 0;
  for (let cur = a; cur.getTime() < b.getTime(); cur = addDaysUTC(cur, 1)) {
    const dow = cur.getUTCDay(); // 0 Sun ... 6 Sat
    if (nonWorkingDates?.has(toDateKeyUTC(cur))) continue;
    if (daysByWeekday.get(dow)?.enabled) count++;
  }
  return count;
}

function businessHoursBetweenUTC(
  from: Date,
  to: Date,
  daysByWeekday: Map<number, { enabled: boolean; hours: number }>,
  nonWorkingDates?: Set<string>,
) {
  const a = startOfDayUTC(from);
  const b = startOfDayUTC(to);
  if (a.getTime() >= b.getTime()) return 0;

  let total = 0;
  for (let cur = a; cur.getTime() < b.getTime(); cur = addDaysUTC(cur, 1)) {
    if (nonWorkingDates?.has(toDateKeyUTC(cur))) continue;
    const day = daysByWeekday.get(cur.getUTCDay());
    if (day?.enabled) total += day.hours;
  }
  return total;
}

function round(n: number, digits = 1) {
  const p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function normalizeClock(value: unknown) {
  const s = String(value ?? '').trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function clockToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function resolveDashboardWorkSchedule(tenant: {
  dashboardWorkHoursPerDay?: number | null;
  dashboardWorkMonday?: boolean | null;
  dashboardWorkMondayStartTime?: string | null;
  dashboardWorkMondayEndTime?: string | null;
  dashboardWorkMondayMealBreakMinutes?: number | null;
  dashboardWorkTuesday?: boolean | null;
  dashboardWorkTuesdayStartTime?: string | null;
  dashboardWorkTuesdayEndTime?: string | null;
  dashboardWorkTuesdayMealBreakMinutes?: number | null;
  dashboardWorkWednesday?: boolean | null;
  dashboardWorkWednesdayStartTime?: string | null;
  dashboardWorkWednesdayEndTime?: string | null;
  dashboardWorkWednesdayMealBreakMinutes?: number | null;
  dashboardWorkThursday?: boolean | null;
  dashboardWorkThursdayStartTime?: string | null;
  dashboardWorkThursdayEndTime?: string | null;
  dashboardWorkThursdayMealBreakMinutes?: number | null;
  dashboardWorkFriday?: boolean | null;
  dashboardWorkFridayStartTime?: string | null;
  dashboardWorkFridayEndTime?: string | null;
  dashboardWorkFridayMealBreakMinutes?: number | null;
  dashboardWorkSaturday?: boolean | null;
  dashboardWorkSaturdayStartTime?: string | null;
  dashboardWorkSaturdayEndTime?: string | null;
  dashboardWorkSaturdayMealBreakMinutes?: number | null;
  dashboardWorkSunday?: boolean | null;
  dashboardWorkSundayStartTime?: string | null;
  dashboardWorkSundayEndTime?: string | null;
  dashboardWorkSundayMealBreakMinutes?: number | null;
  dashboardExcludeNonWorkingDates?: boolean | null;
  dashboardNonWorkingDates?: string[] | null;
} | null | undefined): DashboardWorkSchedule {
  const fallbackHoursPerDayRaw = Number(tenant?.dashboardWorkHoursPerDay ?? 8);
  const fallbackHoursPerDay = Number.isFinite(fallbackHoursPerDayRaw) && fallbackHoursPerDayRaw > 0 ? fallbackHoursPerDayRaw : 8;
  const daysByWeekday = new Map<number, { enabled: boolean; startTime: string; endTime: string; mealBreakMinutes: number; hours: number }>();

  let activeDays = 0;
  let totalActiveHours = 0;

  for (const day of DASHBOARD_DAY_DEFS) {
    const enabled = Boolean((tenant as any)?.[day.enabledField]);
    const startTime = normalizeClock((tenant as any)?.[day.startField]) ?? '08:00';
    const endTime = normalizeClock((tenant as any)?.[day.endField]) ?? '17:00';
    const mealBreakMinutesRaw = Number((tenant as any)?.[day.mealField] ?? 60);
    const mealBreakMinutes = Number.isFinite(mealBreakMinutesRaw) && mealBreakMinutesRaw >= 0 ? Math.trunc(mealBreakMinutesRaw) : 60;
    const workingMinutes = clockToMinutes(endTime) - clockToMinutes(startTime) - mealBreakMinutes;
    const hours = enabled && workingMinutes > 0 ? workingMinutes / 60 : 0;

    if (enabled && hours > 0) {
      activeDays += 1;
      totalActiveHours += hours;
    }

    daysByWeekday.set(day.dow, {
      enabled: enabled && hours > 0,
      startTime,
      endTime,
      mealBreakMinutes,
      hours: hours > 0 ? hours : 0,
    });
  }

  // Compatibilidad con tenants que aun no tengan la nueva configuracion diaria completa.
  if (!activeDays) {
    for (const day of DASHBOARD_DAY_DEFS) {
      const enabled = [1, 2, 3, 4, 5].includes(day.dow);
      daysByWeekday.set(day.dow, {
        enabled,
        startTime: '08:00',
        endTime: '17:00',
        mealBreakMinutes: 60,
        hours: enabled ? fallbackHoursPerDay : 0,
      });
    }
    activeDays = 5;
    totalActiveHours = fallbackHoursPerDay * activeDays;
  }

  const excludeNonWorkingDates = Boolean(tenant?.dashboardExcludeNonWorkingDates);
  const nonWorkingDates = new Set(
    Array.isArray(tenant?.dashboardNonWorkingDates)
      ? tenant!.dashboardNonWorkingDates
          .map((value) => String(value ?? '').trim())
          .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      : [],
  );

  return {
    averageHoursPerDay: activeDays ? totalActiveHours / activeDays : fallbackHoursPerDay,
    daysByWeekday,
    excludeNonWorkingDates,
    nonWorkingDates: excludeNonWorkingDates ? nonWorkingDates : new Set<string>(),
  };
}


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

  async scheduledNegotiationMonths(args: { tenantId: string; from?: Date; to?: Date }) {
    const { tenantId, from, to } = args;
    const rangeFilter =
      from && to
        ? Prisma.sql`
            AND "dueDate" >= ${from}
            AND "dueDate" < ${to}
          `
        : Prisma.empty;

    return this.prisma.$queryRaw<
      Array<{
        month: string;
        scheduled: number;
        noManagement: number;
        pendingQuote: number;
        pendingApproval: number;
        notApproved: number;
        approved: number;
        programmed: number;
        confirmed: number;
        completed: number;
        undefinedStatus: number;
      }>
    >(
      Prisma.sql`
        SELECT
          date_trunc('month', "dueDate")::date AS month,
          COUNT(*)::int AS scheduled,
          COUNT(*) FILTER (WHERE "commercialStatus" = 'NO_MANAGEMENT')::int AS "noManagement",
          COUNT(*) FILTER (WHERE "commercialStatus" = 'PENDING_QUOTE')::int AS "pendingQuote",
          COUNT(*) FILTER (WHERE "commercialStatus" = 'PENDING_APPROVAL')::int AS "pendingApproval",
          COUNT(*) FILTER (WHERE "commercialStatus" = 'NOT_APPROVED')::int AS "notApproved",
          COUNT(*) FILTER (WHERE "commercialStatus" = 'APPROVED')::int AS approved,
          COUNT(*) FILTER (WHERE "commercialStatus" = 'PROGRAMMED')::int AS programmed,
          COUNT(*) FILTER (WHERE "commercialStatus" = 'CONFIRMED')::int AS confirmed,
          COUNT(*) FILTER (WHERE "commercialStatus" = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (WHERE "commercialStatus" IS NULL)::int AS "undefinedStatus"
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND (
            "status" = 'SCHEDULED'
            OR ("status" = 'COMPLETED' AND "serviceOrderType" = 'PREVENTIVO')
          )
          AND "dueDate" IS NOT NULL
          ${rangeFilter}
        GROUP BY 1
        ORDER BY 1 ASC;
      `
    );
  }

  async summary(args: SummaryArgs) {
    const { tenantId } = args;
    const { from, to, days } = parseRange(args);
    const assetSummaryWhere: Prisma.AssetWhereInput = {
      tenantId,
      NOT: {
        serialNumber: { startsWith: 'T', mode: 'insensitive' },
      },
    };

    // --- Assets ---
    const [
      tenantSettings,
      assetsTotal,
      assetsByStatusRows,
      assetsByCritRows,
      [{ count: assetsInWarranty } = { count: 0 }],
      [{ count: assetsInWarrantyExcludingManual } = { count: 0 }],
      [{ count: forkliftsTotal } = { count: 0 }],
      [{ count: forkliftsInWarranty } = { count: 0 }],
      assetsInWarrantyByNameRows,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          legalName: true,
          logoUrl: true,
          dashboardWorkHoursPerDay: true,
          dashboardWorkMonday: true,
          dashboardWorkMondayStartTime: true,
          dashboardWorkMondayEndTime: true,
          dashboardWorkMondayMealBreakMinutes: true,
          dashboardWorkTuesday: true,
          dashboardWorkTuesdayStartTime: true,
          dashboardWorkTuesdayEndTime: true,
          dashboardWorkTuesdayMealBreakMinutes: true,
          dashboardWorkWednesday: true,
          dashboardWorkWednesdayStartTime: true,
          dashboardWorkWednesdayEndTime: true,
          dashboardWorkWednesdayMealBreakMinutes: true,
          dashboardWorkThursday: true,
          dashboardWorkThursdayStartTime: true,
          dashboardWorkThursdayEndTime: true,
          dashboardWorkThursdayMealBreakMinutes: true,
          dashboardWorkFriday: true,
          dashboardWorkFridayStartTime: true,
          dashboardWorkFridayEndTime: true,
          dashboardWorkFridayMealBreakMinutes: true,
          dashboardWorkSaturday: true,
          dashboardWorkSaturdayStartTime: true,
          dashboardWorkSaturdayEndTime: true,
          dashboardWorkSaturdayMealBreakMinutes: true,
          dashboardWorkSunday: true,
          dashboardWorkSundayStartTime: true,
          dashboardWorkSundayEndTime: true,
          dashboardWorkSundayMealBreakMinutes: true,
          dashboardExcludeNonWorkingDates: true,
          dashboardNonWorkingDates: true,
        },
      }),
      this.prisma.asset.count({ where: assetSummaryWhere }),
      this.prisma.asset.groupBy({ by: ['status'], where: assetSummaryWhere, _count: { id: true } }),
      this.prisma.asset.groupBy({ by: ['criticality'], where: assetSummaryWhere, _count: { id: true } }),
      this.prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "Asset"
          WHERE "tenantId" = ${tenantId}
            AND COALESCE("serialNumber", '') NOT ILIKE 'T%'
            AND COALESCE(
              "guarantee"::date,
              CASE
                WHEN "acquiredOn" IS NOT NULL THEN ("acquiredOn" + INTERVAL '1 year')::date
                ELSE NULL
              END
            ) >= CURRENT_DATE;
        `
      ),
      this.prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "Asset"
          WHERE "tenantId" = ${tenantId}
            AND COALESCE("serialNumber", '') NOT ILIKE 'T%'
            AND COALESCE(
              "guarantee"::date,
              CASE
                WHEN "acquiredOn" IS NOT NULL THEN ("acquiredOn" + INTERVAL '1 year')::date
                ELSE NULL
              END
            ) >= CURRENT_DATE
            AND COALESCE("name", '') NOT ILIKE '%manual%';
        `
      ),
      this.prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "Asset"
          WHERE "tenantId" = ${tenantId}
            AND COALESCE("serialNumber", '') NOT ILIKE 'T%'
            AND COALESCE("name", '') ILIKE '%montacarga%';
        `
      ),
      this.prisma.$queryRaw<{ count: number }[]>(
        Prisma.sql`
          SELECT COUNT(*)::int AS count
          FROM "Asset"
          WHERE "tenantId" = ${tenantId}
            AND COALESCE("serialNumber", '') NOT ILIKE 'T%'
            AND COALESCE("name", '') ILIKE '%montacarga%'
            AND COALESCE(
              "guarantee"::date,
              CASE
                WHEN "acquiredOn" IS NOT NULL THEN ("acquiredOn" + INTERVAL '1 year')::date
                ELSE NULL
              END
            ) >= CURRENT_DATE;
        `
      ),
      this.prisma.$queryRaw<{ name: string; inWarranty: number }[]>(
        Prisma.sql`
          SELECT
            COALESCE(NULLIF(BTRIM("name"), ''), '(sin nombre)') AS name,
            COUNT(*)::int AS "inWarranty"
          FROM "Asset"
          WHERE "tenantId" = ${tenantId}
            AND COALESCE("serialNumber", '') NOT ILIKE 'T%'
            AND COALESCE(
              "guarantee"::date,
              CASE
                WHEN "acquiredOn" IS NOT NULL THEN ("acquiredOn" + INTERVAL '1 year')::date
                ELSE NULL
              END
            ) >= CURRENT_DATE
          GROUP BY 1
          ORDER BY COUNT(*) DESC, 1 ASC;
        `
      ),
    ]);

    const dashboardWorkSchedule = resolveDashboardWorkSchedule(tenantSettings);

    const assetsByStatus: Record<string, number> = {};
    for (const r of assetsByStatusRows) assetsByStatus[r.status] = r._count.id;

    const assetsByCriticality: Record<string, number> = {};
    for (const r of assetsByCritRows) assetsByCriticality[r.criticality] = r._count.id;

    const criticalHigh = assetsByCriticality['HIGH'] ?? 0;

    // Activos con SO abiertas (conteo de assetCode únicos con backlog)
    const [{ count: assetsWithOpenServiceOrders } = { count: 0 }] = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(DISTINCT w."assetCode")::int AS count
        FROM "WorkOrder" w
        JOIN "Asset" a
          ON a."tenantId" = w."tenantId"
         AND a."code" = w."assetCode"
        WHERE w."tenantId" = ${tenantId}
          AND w."kind" = 'SERVICE_ORDER'
          AND w."status" NOT IN ('COMPLETED', 'CLOSED', 'CANCELED')
          AND COALESCE(a."serialNumber", '') NOT ILIKE 'T%';
      `
    );

    const topAssetsByOpenSO = await this.prisma.$queryRaw<{ assetCode: string; openSO: number }[]>(
      Prisma.sql`
        SELECT
          w."assetCode" AS "assetCode",
          COUNT(*)::int AS "openSO"
        FROM "WorkOrder" w
        JOIN "Asset" a
          ON a."tenantId" = w."tenantId"
         AND a."code" = w."assetCode"
        WHERE w."tenantId" = ${tenantId}
          AND w."kind" = 'SERVICE_ORDER'
          AND w."status" NOT IN ('COMPLETED', 'CLOSED', 'CANCELED')
          AND COALESCE(a."serialNumber", '') NOT ILIKE 'T%'
        GROUP BY w."assetCode"
        ORDER BY COUNT(*) DESC, w."assetCode" ASC
        LIMIT 10;
      `
    );

    const topAssetsByOpenAlerts = await this.prisma.$queryRaw<{ assetCode: string; openAlerts: number }[]>(
      Prisma.sql`
        SELECT
          al."assetCode" AS "assetCode",
          COUNT(*)::int AS "openAlerts"
        FROM "Alert" al
        JOIN "Asset" a
          ON a."tenantId" = al."tenantId"
         AND a."code" = al."assetCode"
        WHERE al."tenantId" = ${tenantId}
          AND al."status" = 'OPEN'
          AND COALESCE(a."serialNumber", '') NOT ILIKE 'T%'
        GROUP BY al."assetCode"
        ORDER BY COUNT(*) DESC, al."assetCode" ASC
        LIMIT 10;
      `
    );

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

    const scheduledNegotiationByMonth = await this.scheduledNegotiationMonths({ tenantId, from, to });

    const monthlyServiceOrderTypeRows = await this.prisma.$queryRaw<
      Array<{ month: string; serviceType: string; count: number }>
    >(
      Prisma.sql`
        SELECT
          date_trunc('month', COALESCE("deliveredAt","completedAt","updatedAt"))::date::text AS "month",
          COALESCE("serviceOrderType"::text, 'UNSPECIFIED') AS "serviceType",
          COUNT(*)::int AS "count"
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "status" IN ('COMPLETED','CLOSED')
          AND COALESCE("deliveredAt","completedAt","updatedAt") IS NOT NULL
        GROUP BY "month", "serviceType"
        ORDER BY "month" DESC, "count" DESC, "serviceType" ASC;
      `
    );

    const monthlyServiceOrderTypeSummary = Array.from(
      monthlyServiceOrderTypeRows.reduce((map, row) => {
        const current = map.get(row.month) ?? {
          month: row.month,
          total: 0,
          byServiceType: [] as Array<{ serviceType: string; count: number }>,
        };
        current.total += row.count;
        current.byServiceType.push({
          serviceType: row.serviceType,
          count: row.count,
        });
        map.set(row.month, current);
        return map;
      }, new Map<string, { month: string; total: number; byServiceType: Array<{ serviceType: string; count: number }> }>())
    ).map(([, value]) => value);

    const technicianCount = await this.prisma.user.count({
      where: {
        tenantId,
        role: 'TECH',
      },
    });

    const currentMonth = startOfMonthUTC(to);
    const availableHoursMonths = Array.from(
      new Set([
        ...monthlyServiceOrderTypeSummary.map((row) => row.month),
        toDateKeyUTC(currentMonth),
      ]),
    ).sort((a, b) => b.localeCompare(a));

    const monthlyAvailableHoursSummary = availableHoursMonths
      .map((month) => {
        const monthDate = new Date(`${month}T00:00:00.000Z`);
        if (Number.isNaN(monthDate.getTime())) return null;
        const monthStart = startOfMonthUTC(monthDate);
        const monthEnd = addMonthsUTC(monthStart, 1);
        const workingDays = businessDaysBetweenUTC(
          monthStart,
          monthEnd,
          dashboardWorkSchedule.daysByWeekday,
          dashboardWorkSchedule.nonWorkingDates,
        );
        const availableHoursPerTech = businessHoursBetweenUTC(
          monthStart,
          monthEnd,
          dashboardWorkSchedule.daysByWeekday,
          dashboardWorkSchedule.nonWorkingDates,
        );
        const totalAvailableHours = availableHoursPerTech * technicianCount;
        const excludedDates = dashboardWorkSchedule.excludeNonWorkingDates
          ? Array.from(dashboardWorkSchedule.nonWorkingDates).filter((date) => date >= month && date < monthEnd.toISOString().slice(0, 10)).length
          : 0;

        return {
          month,
          workingDays,
          availableHoursPerTech: round(availableHoursPerTech, 2),
          technicianCount,
          totalAvailableHours: round(totalAvailableHours, 2),
          excludedDates,
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

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
        participants AS (
          SELECT DISTINCT l."userId", l."workOrderId"
          FROM "WorkLog" l
          JOIN closed_orders c ON c."id" = l."workOrderId"
          JOIN "User" u ON u."id" = l."userId" AND u."tenantId" = ${tenantId} AND u."role" = 'TECH'
          WHERE l."tenantId" = ${tenantId}
        ),
        per_tech_orders AS (
          SELECT
            p."userId",
            COUNT(*)::int AS "closedCount",
            AVG(EXTRACT(EPOCH FROM (c."closedAt" - c."createdAt")))::float AS "avgCycleSeconds",
            AVG(EXTRACT(EPOCH FROM (c."startedAt" - c."createdAt"))) FILTER (WHERE c."startedAt" IS NOT NULL)::float AS "avgResponseSeconds",
            SUM(CASE WHEN c."dueDate" IS NOT NULL THEN 1 ELSE 0 END)::int AS "dueCount",
            SUM(CASE WHEN c."dueDate" IS NOT NULL AND c."closedAt" <= c."dueDate" THEN 1 ELSE 0 END)::int AS "onTimeCount"
          FROM participants p
          JOIN closed_orders c ON c."id" = p."workOrderId"
          GROUP BY p."userId"
        ),
        per_tech_work AS (
          SELECT
            l."userId",
            SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(l."endedAt", ${to}), ${to}) - GREATEST(l."startedAt", ${from}))))::float AS "workSeconds",
            COUNT(DISTINCT l."workOrderId")::int AS "workedOrders"
          FROM "WorkLog" l
          JOIN "WorkOrder" w ON w."id" = l."workOrderId"
          WHERE l."tenantId" = ${tenantId}
            AND w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND l."startedAt" < ${to}
            AND COALESCE(l."endedAt", ${to}) > ${from}
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
    const rangeBusinessHours = businessHoursBetweenUTC(
      from,
      to,
      dashboardWorkSchedule.daysByWeekday,
      dashboardWorkSchedule.nonWorkingDates,
    );
    const configuredWeeklyBusinessHours = Array.from(dashboardWorkSchedule.daysByWeekday.values()).reduce(
      (total, day) => total + (day.enabled ? day.hours : 0),
      0,
    );


    const technicianPerformance = techPerfRows.map(r => {
      const totalWorkHours = round((r.workSeconds ?? 0) / 3600, 1);
      const avgCycleHours = r.avgCycleSeconds == null ? null : round(r.avgCycleSeconds / 3600, 1);
      const avgResponseHours = r.avgResponseSeconds == null ? null : round(r.avgResponseSeconds / 3600, 1);
      const avgWorkHoursPerSO = r.closedCount ? round(totalWorkHours / r.closedCount, 2) : null;
      const utilizationPct = rangeBusinessHours ? round((totalWorkHours / rangeBusinessHours) * 100, 0) : null;
      const onTimeRate = r.dueCount ? round((r.onTimeCount / r.dueCount) * 100, 0) : null;

      return {
        userId: r.userId,
        name: r.name ?? 'Sin nombre',
        closedInRange: r.closedCount,
        workedOrdersInRange: r.workedOrders,
        totalWorkHours,
        avgWorkHoursPerSO,
        availableHours: rangeBusinessHours,
        utilizationPct,
        avgCycleHours,
        avgResponseHours,
        onTimeRate,
        openAssigned: openMap.get(r.userId) ?? 0,
        overdueOpenAssigned: overdueMap.get(r.userId) ?? 0,
      };
    });

    type ClosedByTypeRow = {
      serviceType: string;
      closedCount: number;
    };

    type ClosedByTechTypeRow = {
      userId: string;
      name: string;
      serviceType: string;
      closedCount: number;
    };

    const closedByTypeRows = await this.prisma.$queryRaw<ClosedByTypeRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w."id",
            COALESCE(w."serviceOrderType"::text, 'UNSPECIFIED') AS "serviceType"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        )
        SELECT
          "serviceType",
          COUNT(*)::int AS "closedCount"
        FROM closed_orders
        GROUP BY "serviceType"
        ORDER BY "closedCount" DESC, "serviceType" ASC;
      `
    );

    const closedByTechTypeRows = await this.prisma.$queryRaw<ClosedByTechTypeRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w."id",
            COALESCE(w."serviceOrderType"::text, 'UNSPECIFIED') AS "serviceType"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        tech_participants AS (
          SELECT DISTINCT l."userId", l."workOrderId"
          FROM "WorkLog" l
          JOIN closed_orders c ON c."id" = l."workOrderId"
          JOIN "User" ur ON ur."id" = l."userId" AND ur."tenantId" = ${tenantId} AND ur."role" = 'TECH'
          WHERE l."tenantId" = ${tenantId}
        )
        SELECT
          tp."userId",
          COALESCE(u."name", u."email", tp."userId")::text AS "name",
          c."serviceType",
          COUNT(*)::int AS "closedCount"
        FROM tech_participants tp
        JOIN closed_orders c ON c."id" = tp."workOrderId"
        LEFT JOIN "User" u ON u."id" = tp."userId" AND u."tenantId" = ${tenantId}
        GROUP BY tp."userId", u."name", u."email", c."serviceType"
        ORDER BY "closedCount" DESC, "name" ASC, "serviceType" ASC;
      `
    );

    const byTechnicianMap = new Map<string, { userId: string; name: string; closedCount: number }>();
    for (const row of closedByTechTypeRows) {
      const cur = byTechnicianMap.get(row.userId);
      if (!cur) byTechnicianMap.set(row.userId, { userId: row.userId, name: row.name, closedCount: row.closedCount });
      else cur.closedCount += row.closedCount;
    }
    const closedByTechnician = Array.from(byTechnicianMap.values()).sort((a, b) => {
      if (b.closedCount !== a.closedCount) return b.closedCount - a.closedCount;
      return a.name.localeCompare(b.name);
    });

    const rangeCalendarDays = Math.max(1, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
    const rangeCalendarWeeks = Math.max(rangeCalendarDays / 7, 1 / 7);
    const rangeEquivalentWorkDays =
      dashboardWorkSchedule.averageHoursPerDay > 0
        ? rangeBusinessHours / dashboardWorkSchedule.averageHoursPerDay
        : 0;
    const rangeEquivalentWorkWeeks =
      configuredWeeklyBusinessHours > 0
        ? rangeBusinessHours / configuredWeeklyBusinessHours
        : 0;
    const averageRangeDays = rangeEquivalentWorkDays > 0 ? rangeEquivalentWorkDays : rangeCalendarDays;
    const averageRangeWeeks = rangeEquivalentWorkWeeks > 0 ? rangeEquivalentWorkWeeks : rangeCalendarWeeks;
    const technicianTypeAveragesBasis = {
      availableHoursInRange: round(rangeBusinessHours, 2),
      equivalentWorkDays: round(averageRangeDays, 2),
      equivalentWorkWeeks: round(averageRangeWeeks, 2),
      configuredWeeklyHours: round(configuredWeeklyBusinessHours, 2),
    };
    const technicianTypeAveragesMap = new Map<
      string,
      {
        userId: string;
        name: string;
        preventiveCount: number;
        correctiveCount: number;
        diagnosticCount: number;
      }
    >();

    for (const row of closedByTechTypeRows) {
      if (!['PREVENTIVO', 'CORRECTIVO', 'DIAGNOSTICO'].includes(row.serviceType)) continue;
      const current =
        technicianTypeAveragesMap.get(row.userId) ??
        {
          userId: row.userId,
          name: row.name,
          preventiveCount: 0,
          correctiveCount: 0,
          diagnosticCount: 0,
        };
      if (row.serviceType === 'PREVENTIVO') current.preventiveCount += row.closedCount;
      if (row.serviceType === 'CORRECTIVO') current.correctiveCount += row.closedCount;
      if (row.serviceType === 'DIAGNOSTICO') current.diagnosticCount += row.closedCount;
      technicianTypeAveragesMap.set(row.userId, current);
    }

    const technicianTypeAverages = Array.from(technicianTypeAveragesMap.values())
      .map((row) => {
        const dailyPreventive = round(row.preventiveCount / averageRangeDays, 2);
        const dailyCorrective = round(row.correctiveCount / averageRangeDays, 2);
        const dailyDiagnostic = round(row.diagnosticCount / averageRangeDays, 2);
        const weeklyPreventive = round(row.preventiveCount / averageRangeWeeks, 2);
        const weeklyCorrective = round(row.correctiveCount / averageRangeWeeks, 2);
        const weeklyDiagnostic = round(row.diagnosticCount / averageRangeWeeks, 2);
        return {
          userId: row.userId,
          name: row.name,
          preventiveCount: row.preventiveCount,
          correctiveCount: row.correctiveCount,
          diagnosticCount: row.diagnosticCount,
          dailyPreventive,
          dailyCorrective,
          dailyDiagnostic,
          weeklyPreventive,
          weeklyCorrective,
          weeklyDiagnostic,
          dailyTotal: round(dailyPreventive + dailyCorrective + dailyDiagnostic, 2),
          weeklyTotal: round(weeklyPreventive + weeklyCorrective + weeklyDiagnostic, 2),
        };
      })
      .sort((a, b) => {
        if (b.weeklyTotal !== a.weeklyTotal) return b.weeklyTotal - a.weeklyTotal;
        return a.name.localeCompare(b.name);
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
        participant_closed AS (
          SELECT DISTINCT l."userId", c."id" AS "workOrderId", date_trunc('week', c."closedAt")::date AS "weekStart"
          FROM "WorkLog" l
          JOIN closed_orders c ON c."id" = l."workOrderId"
          JOIN "User" u ON u."id" = l."userId" AND u."tenantId" = ${tenantId} AND u."role" = 'TECH'
          WHERE l."tenantId" = ${tenantId}
        ),
        closed_week AS (
          SELECT "userId", "weekStart", COUNT(*)::int AS "closedCount"
          FROM participant_closed
          GROUP BY "userId", "weekStart"
        ),
        work_week AS (
          SELECT
            l."userId",
            date_trunc('week', l."startedAt")::date AS "weekStart",
            SUM(EXTRACT(EPOCH FROM (COALESCE(l."endedAt", ${to}) - l."startedAt")))::float AS "workSeconds"
          FROM "WorkLog" l
          JOIN "WorkOrder" w ON w."id" = l."workOrderId"
          JOIN "User" ux ON ux."id" = l."userId" AND ux."tenantId" = ${tenantId} AND ux."role" = 'TECH'
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

    const technicianWeeklyProductivity = techWeeklyRows.map(r => {
      const ws = new Date(`${r.weekStart}T00:00:00.000Z`);
      const we = addDaysUTC(ws, 7);
      const intFrom = from.getTime() > ws.getTime() ? from : ws;
      const intTo = to.getTime() < we.getTime() ? to : we;
      const weekBusinessHours = businessHoursBetweenUTC(
        intFrom,
        intTo,
        dashboardWorkSchedule.daysByWeekday,
        dashboardWorkSchedule.nonWorkingDates,
      );
      const workHours = round((r.workSeconds ?? 0) / 3600, 1);
      const utilizationPct = weekBusinessHours ? round((workHours / weekBusinessHours) * 100, 0) : null;

      return {
        userId: r.userId,
        name: r.name ?? 'Sin nombre',
        weekStart: r.weekStart,
        closedCount: r.closedCount,
        workHours,
        availableHours: weekBusinessHours,
        utilizationPct,
      };
    });


// Efectivo vs pausas (WorkLogs): por técnico y por tipo de OS
type TechEffPauseRow = {
  userId: string;
  name: string | null;
  workSeconds: number;
  spanSeconds: number;
  pauseCount: number;
  osCount: number;
  segmentsCount: number;
};

const techEffPauseRows = await this.prisma.$queryRaw<TechEffPauseRow[]>(
  Prisma.sql`
    WITH logs AS (
      SELECT
        l."userId",
        l."workOrderId",
        GREATEST(l."startedAt", ${from}) AS s,
        LEAST(COALESCE(l."endedAt", ${to}), ${to}) AS e
      FROM "WorkLog" l
      JOIN "WorkOrder" w ON w."id" = l."workOrderId"
      WHERE l."tenantId" = ${tenantId}
        AND w."tenantId" = ${tenantId}
        AND w."kind" = 'SERVICE_ORDER'
        AND l."startedAt" < ${to}
        AND COALESCE(l."endedAt", ${to}) > ${from}
    ),
    logs_valid AS (
      SELECT * FROM logs WHERE e > s
    ),
    per_os AS (
      SELECT
        "userId",
        "workOrderId",
        MIN(s) AS min_s,
        MAX(e) AS max_e,
        COUNT(*)::int AS segments
      FROM logs_valid
      GROUP BY "userId", "workOrderId"
    ),
    per_user_span AS (
      SELECT
        "userId",
        SUM(EXTRACT(EPOCH FROM (max_e - min_s)))::float AS "spanSeconds",
        SUM(GREATEST(segments - 1, 0))::int AS "pauseCount",
        COUNT(*)::int AS "osCount"
      FROM per_os
      GROUP BY "userId"
    ),
    per_user_work AS (
      SELECT
        "userId",
        SUM(EXTRACT(EPOCH FROM (e - s)))::float AS "workSeconds",
        COUNT(*)::int AS "segmentsCount"
      FROM logs_valid
      GROUP BY "userId"
    )
    SELECT
      u."id" AS "userId",
      u."name" AS "name",
      COALESCE(w."workSeconds", 0)::float AS "workSeconds",
      COALESCE(s."spanSeconds", 0)::float AS "spanSeconds",
      COALESCE(s."pauseCount", 0)::int AS "pauseCount",
      COALESCE(s."osCount", 0)::int AS "osCount",
      COALESCE(w."segmentsCount", 0)::int AS "segmentsCount"
    FROM per_user_work w
    JOIN "User" u
      ON u."id" = w."userId"
     AND u."tenantId" = ${tenantId}
    LEFT JOIN per_user_span s ON s."userId" = w."userId"
    ORDER BY "workSeconds" DESC;
  `
);

const technicianEffectiveVsPauses = techEffPauseRows.map(r => {
  const effectiveHours = round((r.workSeconds ?? 0) / 3600, 1);
  const spanHours = round((r.spanSeconds ?? 0) / 3600, 1);
  const pauseSeconds = Math.max(0, (r.spanSeconds ?? 0) - (r.workSeconds ?? 0));
  const pauseHours = round(pauseSeconds / 3600, 1);

  const effectivePct = r.spanSeconds ? round(((r.workSeconds ?? 0) / r.spanSeconds) * 100, 0) : null;
  const avgEffectiveHoursPerOS = r.osCount ? round(effectiveHours / r.osCount, 2) : null;
  const avgPauseHoursPerOS = r.osCount ? round(pauseHours / r.osCount, 2) : null;

  return {
    userId: r.userId,
    name: r.name ?? 'Sin nombre',
    osWorkedInRange: r.osCount ?? 0,
    workLogsCount: r.segmentsCount ?? 0,
    pauseCount: r.pauseCount ?? 0,
    effectiveHours,
    spanHours,
    pauseHours,
    effectivePct,
    avgEffectiveHoursPerOS,
    avgPauseHoursPerOS,
  };
});

type TypeEffPauseRow = {
  serviceOrderType: string;
  workSeconds: number;
  spanSeconds: number;
  pauseCount: number;
  osCount: number;
  segmentsCount: number;
};

const typeEffPauseRows = await this.prisma.$queryRaw<TypeEffPauseRow[]>(
  Prisma.sql`
    WITH logs AS (
      SELECT
        COALESCE(w."serviceOrderType"::text, 'UNSPECIFIED') AS "serviceOrderType",
        l."workOrderId",
        GREATEST(l."startedAt", ${from}) AS s,
        LEAST(COALESCE(l."endedAt", ${to}), ${to}) AS e
      FROM "WorkLog" l
      JOIN "WorkOrder" w ON w."id" = l."workOrderId"
      WHERE l."tenantId" = ${tenantId}
        AND w."tenantId" = ${tenantId}
        AND w."kind" = 'SERVICE_ORDER'
        AND l."startedAt" < ${to}
        AND COALESCE(l."endedAt", ${to}) > ${from}
    ),
    logs_valid AS (
      SELECT * FROM logs WHERE e > s
    ),
    per_os AS (
      SELECT
        "serviceOrderType",
        "workOrderId",
        MIN(s) AS min_s,
        MAX(e) AS max_e,
        COUNT(*)::int AS segments
      FROM logs_valid
      GROUP BY "serviceOrderType", "workOrderId"
    ),
    per_type_span AS (
      SELECT
        "serviceOrderType",
        SUM(EXTRACT(EPOCH FROM (max_e - min_s)))::float AS "spanSeconds",
        SUM(GREATEST(segments - 1, 0))::int AS "pauseCount",
        COUNT(*)::int AS "osCount"
      FROM per_os
      GROUP BY "serviceOrderType"
    ),
    per_type_work AS (
      SELECT
        "serviceOrderType",
        SUM(EXTRACT(EPOCH FROM (e - s)))::float AS "workSeconds",
        COUNT(*)::int AS "segmentsCount"
      FROM logs_valid
      GROUP BY "serviceOrderType"
    )
    SELECT
      w."serviceOrderType" AS "serviceOrderType",
      COALESCE(w."workSeconds", 0)::float AS "workSeconds",
      COALESCE(s."spanSeconds", 0)::float AS "spanSeconds",
      COALESCE(s."pauseCount", 0)::int AS "pauseCount",
      COALESCE(s."osCount", 0)::int AS "osCount",
      COALESCE(w."segmentsCount", 0)::int AS "segmentsCount"
    FROM per_type_work w
    LEFT JOIN per_type_span s ON s."serviceOrderType" = w."serviceOrderType"
    ORDER BY "workSeconds" DESC;
  `
);

const workTimeByServiceOrderType = typeEffPauseRows.map(r => {
  const effectiveHours = round((r.workSeconds ?? 0) / 3600, 1);
  const spanHours = round((r.spanSeconds ?? 0) / 3600, 1);
  const pauseSeconds = Math.max(0, (r.spanSeconds ?? 0) - (r.workSeconds ?? 0));
  const pauseHours = round(pauseSeconds / 3600, 1);

  const effectivePct = r.spanSeconds ? round(((r.workSeconds ?? 0) / r.spanSeconds) * 100, 0) : null;
  const avgEffectiveHoursPerOS = r.osCount ? round(effectiveHours / r.osCount, 2) : null;
  const avgPauseHoursPerOS = r.osCount ? round(pauseHours / r.osCount, 2) : null;

  return {
    serviceOrderType: r.serviceOrderType,
    osWorkedInRange: r.osCount ?? 0,
    workLogsCount: r.segmentsCount ?? 0,
    pauseCount: r.pauseCount ?? 0,
    effectiveHours,
    spanHours,
    pauseHours,
    effectivePct,
    avgEffectiveHoursPerOS,
    avgPauseHoursPerOS,
  };
});

    // Tiempos operativos reales (a partir de timestamps de la OS)
    type OpTimesRow = {
      travel_count: number;
      travel_avg_s: number | null;
      travel_p50_s: number | null;
      travel_p90_s: number | null;

      intake_count: number;
      intake_avg_s: number | null;
      intake_p50_s: number | null;
      intake_p90_s: number | null;

      handover_count: number;
      handover_avg_s: number | null;
      handover_p50_s: number | null;
      handover_p90_s: number | null;

      onsite_count: number;
      onsite_avg_s: number | null;
      onsite_p50_s: number | null;
      onsite_p90_s: number | null;

      wrapup_count: number;
      wrapup_avg_s: number | null;
      wrapup_p50_s: number | null;
      wrapup_p90_s: number | null;

      total_count: number;
      total_avg_s: number | null;
      total_p50_s: number | null;
      total_p90_s: number | null;
    };

    const [opRow] = await this.prisma.$queryRaw<OpTimesRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w."takenAt",
            w."arrivedAt",
            w."checkInAt",
            (COALESCE(w."formData"->>'visitMode', 'PRIMARY') = 'FOLLOW_UP') AS "isFollowUp",
            w."activityStartedAt",
            w."activityFinishedAt",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "deliveredLike"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        d AS (
          SELECT
            CASE WHEN COALESCE("isFollowUp", false) = false AND "takenAt" IS NOT NULL AND "arrivedAt" IS NOT NULL AND "arrivedAt" >= "takenAt"
              THEN EXTRACT(EPOCH FROM ("arrivedAt" - "takenAt")) END AS travel_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "arrivedAt" IS NOT NULL AND "checkInAt" IS NOT NULL AND "checkInAt" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("checkInAt" - "arrivedAt")) END AS intake_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "checkInAt" IS NOT NULL AND "activityStartedAt" IS NOT NULL AND "activityStartedAt" >= "checkInAt"
              THEN EXTRACT(EPOCH FROM ("activityStartedAt" - "checkInAt")) END AS handover_s,
            CASE WHEN "activityStartedAt" IS NOT NULL AND "activityFinishedAt" IS NOT NULL AND "activityFinishedAt" >= "activityStartedAt"
              THEN EXTRACT(EPOCH FROM ("activityFinishedAt" - "activityStartedAt")) END AS onsite_s,
            CASE WHEN "activityFinishedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "activityFinishedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "activityFinishedAt")) END AS wrapup_s,
            CASE WHEN "arrivedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "arrivedAt")) END AS total_s
          FROM closed_orders
        )
        SELECT
          COUNT(travel_s)::int AS travel_count,
          AVG(travel_s)::float AS travel_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p90_s,

          COUNT(intake_s)::int AS intake_count,
          AVG(intake_s)::float AS intake_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p90_s,

          COUNT(handover_s)::int AS handover_count,
          AVG(handover_s)::float AS handover_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p90_s,

          COUNT(onsite_s)::int AS onsite_count,
          AVG(onsite_s)::float AS onsite_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p90_s,

          COUNT(wrapup_s)::int AS wrapup_count,
          AVG(wrapup_s)::float AS wrapup_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p90_s,

          COUNT(total_s)::int AS total_count,
          AVG(total_s)::float AS total_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p90_s
        FROM d;
      `
    );

    const secToHours = (seconds: number | null) => (seconds == null ? null : round(seconds / 3600, 2));

    const operationalTimes = [
      {
        key: 'travel',
        label: 'Desplazamiento',
        span: 'takenAt → arrivedAt',
        count: opRow?.travel_count ?? 0,
        avgHours: secToHours(opRow?.travel_avg_s ?? null),
        p50Hours: secToHours(opRow?.travel_p50_s ?? null),
        p90Hours: secToHours(opRow?.travel_p90_s ?? null),
      },
      {
        key: 'intake',
        label: 'Proceso de ingreso',
        span: 'arrivedAt → checkInAt',
        count: opRow?.intake_count ?? 0,
        avgHours: secToHours(opRow?.intake_avg_s ?? null),
        p50Hours: secToHours(opRow?.intake_p50_s ?? null),
        p90Hours: secToHours(opRow?.intake_p90_s ?? null),
      },
      {
        key: 'handover',
        label: 'Entrega del equipo',
        span: 'checkInAt → activityStartedAt',
        count: opRow?.handover_count ?? 0,
        avgHours: secToHours(opRow?.handover_avg_s ?? null),
        p50Hours: secToHours(opRow?.handover_p50_s ?? null),
        p90Hours: secToHours(opRow?.handover_p90_s ?? null),
      },
      {
        key: 'onsite',
        label: 'Trabajo en sitio',
        span: 'activityStartedAt → activityFinishedAt',
        count: opRow?.onsite_count ?? 0,
        avgHours: secToHours(opRow?.onsite_avg_s ?? null),
        p50Hours: secToHours(opRow?.onsite_p50_s ?? null),
        p90Hours: secToHours(opRow?.onsite_p90_s ?? null),
      },
      {
        key: 'wrapup',
        label: 'Entrega final',
        span: 'activityFinishedAt → deliveredAt',
        count: opRow?.wrapup_count ?? 0,
        avgHours: secToHours(opRow?.wrapup_avg_s ?? null),
        p50Hours: secToHours(opRow?.wrapup_p50_s ?? null),
        p90Hours: secToHours(opRow?.wrapup_p90_s ?? null),
      },
      {
        key: 'total',
        label: 'Duración del servicio',
        span: 'arrivedAt → deliveredAt',
        count: opRow?.total_count ?? 0,
        avgHours: secToHours(opRow?.total_avg_s ?? null),
        p50Hours: secToHours(opRow?.total_p50_s ?? null),
        p90Hours: secToHours(opRow?.total_p90_s ?? null),
      },
    ];

    // --- Service: Operational time comparisons (avg / p50 / p90) ---
    type OpGroupRow = {
      group_key: string | null;
      group_label: string | null;

      travel_count: number;
      travel_avg_s: number | null;
      travel_p50_s: number | null;
      travel_p90_s: number | null;

      intake_count: number;
      intake_avg_s: number | null;
      intake_p50_s: number | null;
      intake_p90_s: number | null;

      handover_count: number;
      handover_avg_s: number | null;
      handover_p50_s: number | null;
      handover_p90_s: number | null;

      onsite_count: number;
      onsite_avg_s: number | null;
      onsite_p50_s: number | null;
      onsite_p90_s: number | null;

      wrapup_count: number;
      wrapup_avg_s: number | null;
      wrapup_p50_s: number | null;
      wrapup_p90_s: number | null;

      total_count: number;
      total_avg_s: number | null;
      total_p50_s: number | null;
      total_p90_s: number | null;
    };

    const opSegments = [
      { key: 'travel', label: 'Desplazamiento', span: 'takenAt → arrivedAt' },
      { key: 'intake', label: 'Proceso de ingreso', span: 'arrivedAt → checkInAt' },
      { key: 'handover', label: 'Entrega del equipo', span: 'checkInAt → activityStartedAt' },
      { key: 'onsite', label: 'Trabajo en sitio', span: 'activityStartedAt → activityFinishedAt' },
      { key: 'wrapup', label: 'Entrega final', span: 'activityFinishedAt → deliveredAt' },
      { key: 'total', label: 'Duración del servicio', span: 'arrivedAt → deliveredAt' },
    ] as const;

    const rowToSegmentMetrics = (r: OpGroupRow) => ({
      travel: { count: r.travel_count, avgHours: secToHours(r.travel_avg_s), p50Hours: secToHours(r.travel_p50_s), p90Hours: secToHours(r.travel_p90_s) },
      intake: { count: r.intake_count, avgHours: secToHours(r.intake_avg_s), p50Hours: secToHours(r.intake_p50_s), p90Hours: secToHours(r.intake_p90_s) },
      handover: { count: r.handover_count, avgHours: secToHours(r.handover_avg_s), p50Hours: secToHours(r.handover_p50_s), p90Hours: secToHours(r.handover_p90_s) },
      onsite: { count: r.onsite_count, avgHours: secToHours(r.onsite_avg_s), p50Hours: secToHours(r.onsite_p50_s), p90Hours: secToHours(r.onsite_p90_s) },
      wrapup: { count: r.wrapup_count, avgHours: secToHours(r.wrapup_avg_s), p50Hours: secToHours(r.wrapup_p50_s), p90Hours: secToHours(r.wrapup_p90_s) },
      total: { count: r.total_count, avgHours: secToHours(r.total_avg_s), p50Hours: secToHours(r.total_p50_s), p90Hours: secToHours(r.total_p90_s) },
    });

    // grouped by service order type
    const byServiceOrderTypeRaw = await this.prisma.$queryRaw<OpGroupRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w.id,
            w."serviceOrderType",
            w."takenAt",
            w."arrivedAt",
            w."checkInAt",
            (COALESCE(w."formData"->>'visitMode', 'PRIMARY') = 'FOLLOW_UP') AS "isFollowUp",
            w."activityStartedAt",
            w."activityFinishedAt",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "deliveredLike"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        d AS (
          SELECT
            COALESCE("serviceOrderType"::text, 'UNSPECIFIED') AS group_key,
            NULL::text AS group_label,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "takenAt" IS NOT NULL AND "arrivedAt" IS NOT NULL AND "arrivedAt" >= "takenAt"
              THEN EXTRACT(EPOCH FROM ("arrivedAt" - "takenAt")) END AS travel_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "arrivedAt" IS NOT NULL AND "checkInAt" IS NOT NULL AND "checkInAt" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("checkInAt" - "arrivedAt")) END AS intake_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "checkInAt" IS NOT NULL AND "activityStartedAt" IS NOT NULL AND "activityStartedAt" >= "checkInAt"
              THEN EXTRACT(EPOCH FROM ("activityStartedAt" - "checkInAt")) END AS handover_s,
            CASE WHEN "activityStartedAt" IS NOT NULL AND "activityFinishedAt" IS NOT NULL AND "activityFinishedAt" >= "activityStartedAt"
              THEN EXTRACT(EPOCH FROM ("activityFinishedAt" - "activityStartedAt")) END AS onsite_s,
            CASE WHEN "activityFinishedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "activityFinishedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "activityFinishedAt")) END AS wrapup_s,
            CASE WHEN "arrivedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "arrivedAt")) END AS total_s
          FROM closed_orders
        )
        SELECT
          group_key,
          group_label,
          COUNT(travel_s)::int AS travel_count,
          AVG(travel_s)::float AS travel_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p90_s,

          COUNT(intake_s)::int AS intake_count,
          AVG(intake_s)::float AS intake_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p90_s,

          COUNT(handover_s)::int AS handover_count,
          AVG(handover_s)::float AS handover_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p90_s,

          COUNT(onsite_s)::int AS onsite_count,
          AVG(onsite_s)::float AS onsite_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p90_s,

          COUNT(wrapup_s)::int AS wrapup_count,
          AVG(wrapup_s)::float AS wrapup_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p90_s,

          COUNT(total_s)::int AS total_count,
          AVG(total_s)::float AS total_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p90_s
        FROM d
        GROUP BY group_key, group_label
        ORDER BY total_p90_s DESC NULLS LAST
        LIMIT 30;
      `
    );

    // grouped by customer (from Asset.customer)
    const byCustomerRaw = await this.prisma.$queryRaw<OpGroupRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w.id,
            w."assetCode",
            w."serviceOrderType",
            w."takenAt",
            w."arrivedAt",
            w."checkInAt",
            (COALESCE(w."formData"->>'visitMode', 'PRIMARY') = 'FOLLOW_UP') AS "isFollowUp",
            w."activityStartedAt",
            w."activityFinishedAt",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "deliveredLike",
            a.customer AS customer,
            a."locationId" AS "locationId"
          FROM "WorkOrder" w
          LEFT JOIN "Asset" a
            ON a."tenantId" = w."tenantId" AND a.code = w."assetCode"
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        d AS (
          SELECT
            COALESCE(customer, '(sin cliente)') AS group_key,
            NULL::text AS group_label,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "takenAt" IS NOT NULL AND "arrivedAt" IS NOT NULL AND "arrivedAt" >= "takenAt"
              THEN EXTRACT(EPOCH FROM ("arrivedAt" - "takenAt")) END AS travel_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "arrivedAt" IS NOT NULL AND "checkInAt" IS NOT NULL AND "checkInAt" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("checkInAt" - "arrivedAt")) END AS intake_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "checkInAt" IS NOT NULL AND "activityStartedAt" IS NOT NULL AND "activityStartedAt" >= "checkInAt"
              THEN EXTRACT(EPOCH FROM ("activityStartedAt" - "checkInAt")) END AS handover_s,
            CASE WHEN "activityStartedAt" IS NOT NULL AND "activityFinishedAt" IS NOT NULL AND "activityFinishedAt" >= "activityStartedAt"
              THEN EXTRACT(EPOCH FROM ("activityFinishedAt" - "activityStartedAt")) END AS onsite_s,
            CASE WHEN "activityFinishedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "activityFinishedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "activityFinishedAt")) END AS wrapup_s,
            CASE WHEN "arrivedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "arrivedAt")) END AS total_s
          FROM closed_orders
        )
        SELECT
          group_key,
          group_label,
          COUNT(travel_s)::int AS travel_count,
          AVG(travel_s)::float AS travel_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p90_s,

          COUNT(intake_s)::int AS intake_count,
          AVG(intake_s)::float AS intake_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p90_s,

          COUNT(handover_s)::int AS handover_count,
          AVG(handover_s)::float AS handover_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p90_s,

          COUNT(onsite_s)::int AS onsite_count,
          AVG(onsite_s)::float AS onsite_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p90_s,

          COUNT(wrapup_s)::int AS wrapup_count,
          AVG(wrapup_s)::float AS wrapup_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p90_s,

          COUNT(total_s)::int AS total_count,
          AVG(total_s)::float AS total_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p90_s
        FROM d
        GROUP BY group_key, group_label
        ORDER BY total_p90_s DESC NULLS LAST
        LIMIT 30;
      `
    );

    // grouped by locationId (from Asset.locationId)
    const byLocationRaw = await this.prisma.$queryRaw<OpGroupRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w.id,
            w."assetCode",
            w."serviceOrderType",
            w."takenAt",
            w."arrivedAt",
            w."checkInAt",
            (COALESCE(w."formData"->>'visitMode', 'PRIMARY') = 'FOLLOW_UP') AS "isFollowUp",
            w."activityStartedAt",
            w."activityFinishedAt",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "deliveredLike",
            a."locationId" AS "locationId"
          FROM "WorkOrder" w
          LEFT JOIN "Asset" a
            ON a."tenantId" = w."tenantId" AND a.code = w."assetCode"
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        d AS (
          SELECT
            COALESCE("locationId", '(sin sede)') AS group_key,
            NULL::text AS group_label,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "takenAt" IS NOT NULL AND "arrivedAt" IS NOT NULL AND "arrivedAt" >= "takenAt"
              THEN EXTRACT(EPOCH FROM ("arrivedAt" - "takenAt")) END AS travel_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "arrivedAt" IS NOT NULL AND "checkInAt" IS NOT NULL AND "checkInAt" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("checkInAt" - "arrivedAt")) END AS intake_s,
            CASE WHEN COALESCE("isFollowUp", false) = false AND "checkInAt" IS NOT NULL AND "activityStartedAt" IS NOT NULL AND "activityStartedAt" >= "checkInAt"
              THEN EXTRACT(EPOCH FROM ("activityStartedAt" - "checkInAt")) END AS handover_s,
            CASE WHEN "activityStartedAt" IS NOT NULL AND "activityFinishedAt" IS NOT NULL AND "activityFinishedAt" >= "activityStartedAt"
              THEN EXTRACT(EPOCH FROM ("activityFinishedAt" - "activityStartedAt")) END AS onsite_s,
            CASE WHEN "activityFinishedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "activityFinishedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "activityFinishedAt")) END AS wrapup_s,
            CASE WHEN "arrivedAt" IS NOT NULL AND "deliveredLike" IS NOT NULL AND "deliveredLike" >= "arrivedAt"
              THEN EXTRACT(EPOCH FROM ("deliveredLike" - "arrivedAt")) END AS total_s
          FROM closed_orders
        )
        SELECT
          group_key,
          group_label,
          COUNT(travel_s)::int AS travel_count,
          AVG(travel_s)::float AS travel_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p90_s,

          COUNT(intake_s)::int AS intake_count,
          AVG(intake_s)::float AS intake_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p90_s,

          COUNT(handover_s)::int AS handover_count,
          AVG(handover_s)::float AS handover_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p90_s,

          COUNT(onsite_s)::int AS onsite_count,
          AVG(onsite_s)::float AS onsite_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p90_s,

          COUNT(wrapup_s)::int AS wrapup_count,
          AVG(wrapup_s)::float AS wrapup_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p90_s,

          COUNT(total_s)::int AS total_count,
          AVG(total_s)::float AS total_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p90_s
        FROM d
        GROUP BY group_key, group_label
        ORDER BY total_p90_s DESC NULLS LAST
        LIMIT 30;
      `
    );

    // grouped by lead technician (from WorkLogs within range)
    const byTechnicianRaw = await this.prisma.$queryRaw<OpGroupRow[]>(
      Prisma.sql`
        WITH closed_orders AS (
          SELECT
            w.id,
            w."takenAt",
            w."arrivedAt",
            w."checkInAt",
            (COALESCE(w."formData"->>'visitMode', 'PRIMARY') = 'FOLLOW_UP') AS "isFollowUp",
            w."activityStartedAt",
            w."activityFinishedAt",
            COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") AS "deliveredLike"
          FROM "WorkOrder" w
          WHERE w."tenantId" = ${tenantId}
            AND w."kind" = 'SERVICE_ORDER'
            AND w."status" IN ('COMPLETED','CLOSED')
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") >= ${from}
            AND COALESCE(w."deliveredAt", w."completedAt", w."updatedAt") < ${to}
        ),
        wl AS (
          SELECT
            wl."workOrderId",
            wl."userId",
            SUM(
              EXTRACT(
                EPOCH FROM (
                  LEAST(COALESCE(wl."endedAt", ${to}), ${to}) - GREATEST(wl."startedAt", ${from})
                )
              )
            ) AS seconds_worked
          FROM "WorkLog" wl
          JOIN closed_orders co ON co.id = wl."workOrderId"
          WHERE wl."tenantId" = ${tenantId}
            AND wl."startedAt" < ${to}
            AND COALESCE(wl."endedAt", ${to}) > ${from}
          GROUP BY wl."workOrderId", wl."userId"
        ),
        lead AS (
          SELECT DISTINCT ON ("workOrderId")
            "workOrderId",
            "userId"
          FROM wl
          ORDER BY "workOrderId", seconds_worked DESC
        ),
        d AS (
          SELECT
            lead."userId" AS group_key,
            NULL::text AS group_label,
            CASE WHEN COALESCE(co."isFollowUp", false) = false AND co."takenAt" IS NOT NULL AND co."arrivedAt" IS NOT NULL AND co."arrivedAt" >= co."takenAt"
              THEN EXTRACT(EPOCH FROM (co."arrivedAt" - co."takenAt")) END AS travel_s,
            CASE WHEN COALESCE(co."isFollowUp", false) = false AND co."arrivedAt" IS NOT NULL AND co."checkInAt" IS NOT NULL AND co."checkInAt" >= co."arrivedAt"
              THEN EXTRACT(EPOCH FROM (co."checkInAt" - co."arrivedAt")) END AS intake_s,
            CASE WHEN COALESCE(co."isFollowUp", false) = false AND co."checkInAt" IS NOT NULL AND co."activityStartedAt" IS NOT NULL AND co."activityStartedAt" >= co."checkInAt"
              THEN EXTRACT(EPOCH FROM (co."activityStartedAt" - co."checkInAt")) END AS handover_s,
            CASE WHEN co."activityStartedAt" IS NOT NULL AND co."activityFinishedAt" IS NOT NULL AND co."activityFinishedAt" >= co."activityStartedAt"
              THEN EXTRACT(EPOCH FROM (co."activityFinishedAt" - co."activityStartedAt")) END AS onsite_s,
            CASE WHEN co."activityFinishedAt" IS NOT NULL AND co."deliveredLike" IS NOT NULL AND co."deliveredLike" >= co."activityFinishedAt"
              THEN EXTRACT(EPOCH FROM (co."deliveredLike" - co."activityFinishedAt")) END AS wrapup_s,
            CASE WHEN co."arrivedAt" IS NOT NULL AND co."deliveredLike" IS NOT NULL AND co."deliveredLike" >= co."arrivedAt"
              THEN EXTRACT(EPOCH FROM (co."deliveredLike" - co."arrivedAt")) END AS total_s
          FROM closed_orders co
          LEFT JOIN lead ON lead."workOrderId" = co.id
          WHERE lead."userId" IS NOT NULL
        )
        SELECT
          d.group_key,
          COALESCE(u.name, u.email, d.group_key)::text AS group_label,
          COUNT(travel_s)::int AS travel_count,
          AVG(travel_s)::float AS travel_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY travel_s) FILTER (WHERE travel_s IS NOT NULL) AS travel_p90_s,

          COUNT(intake_s)::int AS intake_count,
          AVG(intake_s)::float AS intake_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY intake_s) FILTER (WHERE intake_s IS NOT NULL) AS intake_p90_s,

          COUNT(handover_s)::int AS handover_count,
          AVG(handover_s)::float AS handover_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY handover_s) FILTER (WHERE handover_s IS NOT NULL) AS handover_p90_s,

          COUNT(onsite_s)::int AS onsite_count,
          AVG(onsite_s)::float AS onsite_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY onsite_s) FILTER (WHERE onsite_s IS NOT NULL) AS onsite_p90_s,

          COUNT(wrapup_s)::int AS wrapup_count,
          AVG(wrapup_s)::float AS wrapup_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY wrapup_s) FILTER (WHERE wrapup_s IS NOT NULL) AS wrapup_p90_s,

          COUNT(total_s)::int AS total_count,
          AVG(total_s)::float AS total_avg_s,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p50_s,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY total_s) FILTER (WHERE total_s IS NOT NULL) AS total_p90_s
        FROM d
        LEFT JOIN "User" u ON u.id = d.group_key
        GROUP BY d.group_key, u.name, u.email
        ORDER BY total_count DESC, total_p90_s DESC NULLS LAST
        LIMIT 25;
      `
    );

    const mapGroups = (rows: OpGroupRow[]) =>
      rows.map(r => ({
        groupKey: r.group_key ?? '(sin dato)',
        groupLabel: r.group_label ?? r.group_key ?? '(sin dato)',
        segments: rowToSegmentMetrics(r),
      }));

    const operationalTimesComparisons = {
      segments: opSegments,
      byTechnician: mapGroups(byTechnicianRaw),
      byServiceOrderType: mapGroups(byServiceOrderTypeRaw),
      byCustomer: mapGroups(byCustomerRaw),
      byLocation: mapGroups(byLocationRaw),
    };


    return {
      tenant: {
        name: tenantSettings?.name ?? null,
        legalName: tenantSettings?.legalName ?? null,
        logoUrl: tenantSettings?.logoUrl ?? null,
      },
      range: { from: from.toISOString(), to: to.toISOString(), days },

      assets: {
        total: assetsTotal,
        inWarranty: assetsInWarranty,
        inWarrantyExcludingManual: assetsInWarrantyExcludingManual,
        forkliftsTotal,
        forkliftsInWarranty,
        inWarrantyByName: assetsInWarrantyByNameRows,
        byStatus: assetsByStatus,
        byCriticality: assetsByCriticality,
        criticalHigh,
        withOpenServiceOrders: assetsWithOpenServiceOrders,
        topAssetsByOpenSO,
        topAssetsByOpenAlerts,
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
        scheduledNegotiationByMonth,
        monthlyServiceOrderTypeSummary,
        monthlyAvailableHoursSummary,
        technicianWorkload,
        technicianPerformance,
        technicianWeeklyProductivity,
        technicianTypeAverages,
        technicianTypeAveragesBasis,
        technicianEffectiveVsPauses,
        workTimeByServiceOrderType,
        closedOrdersSummary: {
          byTechnician: closedByTechnician,
          byServiceType: closedByTypeRows,
          byTechnicianAndServiceType: closedByTechTypeRows,
        },
        dashboardWorkSchedule: {
          averageHoursPerDay: round(dashboardWorkSchedule.averageHoursPerDay, 2),
          excludeNonWorkingDates: dashboardWorkSchedule.excludeNonWorkingDates,
          businessDaysPerWeek: businessDaysBetweenUTC(
            new Date('2026-01-04T00:00:00.000Z'),
            new Date('2026-01-11T00:00:00.000Z'),
            dashboardWorkSchedule.daysByWeekday,
            dashboardWorkSchedule.nonWorkingDates,
          ),
          nonWorkingDates: Array.from(dashboardWorkSchedule.nonWorkingDates).sort(),
          weekdays: Object.fromEntries(
            DASHBOARD_DAY_DEFS.map((day) => {
              const config = dashboardWorkSchedule.daysByWeekday.get(day.dow)!;
              return [
                day.key,
                {
                  enabled: config.enabled,
                  startTime: config.startTime,
                  endTime: config.endTime,
                  mealBreakMinutes: config.mealBreakMinutes,
                  hours: round(config.hours, 2),
                },
              ];
            }),
          ),
        },
        operationalTimes,
        operationalTimesComparisons,
      },
    };
  }

  async exportSummaryPdf(args: SummaryArgs) {
    const tab = String(args.tab || 'assets').toLowerCase() === 'service' ? 'service' : 'assets';
    const summary = await this.summary(args);
    const negotiationMonths = await this.scheduledNegotiationMonths({ tenantId: args.tenantId });
    const html = this.buildDashboardPdfHtml({
      summary,
      negotiationMonths,
      tab,
      sections: String(args.sections ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      selectedTechId: args.selectedTechId,
      selectedNegotiationMonth: args.selectedNegotiationMonth,
      opDim: args.opDim,
      opMetric: args.opMetric,
      opSegment: args.opSegment,
    });
    const dateKey = new Date().toISOString().slice(0, 10);
    return {
      filename: `dashboard-${tab}-${dateKey}.pdf`,
      buffer: await this.renderReportPdfWithChromium(html),
    };
  }

  private reportEscapeHtml(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private reportFmtDate(value: unknown) {
    const d = value ? new Date(String(value)) : null;
    if (!d || Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(d);
  }

  private reportFmtDateTime(value: unknown) {
    const d = value ? new Date(String(value)) : null;
    if (!d || Number.isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }

  private reportFmtNumber(value: unknown, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '-';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  }

  private runBinary(bin: string, args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const cp = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      cp.stderr.on('data', (d) => { stderr += String(d ?? ''); });
      cp.on('error', (err) => reject(err));
      cp.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(stderr || `${bin} exited with code ${code}`));
      });
    });
  }

  private async renderReportPdfWithChromium(html: string): Promise<Buffer> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmms-dashboard-report-'));
    const htmlPath = path.join(tempDir, 'report.html');
    const pdfPath = path.join(tempDir, 'report.pdf');
    await fs.writeFile(htmlPath, html, 'utf8');

    const fileUrl = pathToFileURL(htmlPath).toString();
    const bins = Array.from(new Set([
      String(process.env.CHROMIUM_BIN || '').trim(),
      'chromium',
      'chromium-browser',
      'google-chrome',
      'google-chrome-stable',
    ].filter(Boolean)));
    const argVariants = [
      ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
      ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
    ];

    let lastError = '';
    try {
      for (const bin of bins) {
        for (const baseArgs of argVariants) {
          const args = [...baseArgs, `--print-to-pdf=${pdfPath}`, fileUrl];
          try {
            await this.runBinary(bin, args);
            const out = await fs.readFile(pdfPath);
            if (out.length > 0) return out;
            lastError = 'PDF vacío';
          } catch (e: any) {
            lastError = e?.message ?? String(e ?? '');
          }
        }
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    throw new BadRequestException(
      `No se pudo generar el PDF del dashboard. Instala Chromium en el contenedor/API y define CHROMIUM_BIN si aplica. Detalle: ${lastError || 'Chromium no disponible'}`,
    );
  }

  private buildDashboardPdfHtml(params: {
    summary: any;
    negotiationMonths: Array<{
      month: string;
      scheduled: number;
      noManagement: number;
      pendingQuote: number;
      pendingApproval: number;
      notApproved: number;
      approved: number;
      programmed: number;
      confirmed: number;
      completed: number;
      undefinedStatus: number;
    }>;
    tab: 'assets' | 'service';
    sections?: string[];
    selectedTechId?: string;
    selectedNegotiationMonth?: string;
    opDim?: string;
    opMetric?: string;
    opSegment?: string;
  }) {
    const {
      summary,
      negotiationMonths,
      tab,
      sections = [],
      selectedTechId,
      selectedNegotiationMonth,
      opDim = 'TECHNICIAN',
      opMetric = 'p90',
      opSegment = 'total',
    } = params;
    const tenant = summary?.tenant ?? {};
    const range = summary?.range ?? {};
    const assets = summary?.assets ?? {};
    const service = summary?.service ?? {};
    const reportDate = this.reportFmtDateTime(new Date().toISOString());
    const rangeLabel = `${this.reportFmtDate(range?.from)} - ${this.reportFmtDate(range?.to)}`;
    const monthKeyFromValue = (value: unknown) => {
      const raw = String(value ?? '').trim();
      const directMatch = raw.match(/^(\d{4})-(\d{2})/);
      if (directMatch) return `${directMatch[1]}-${directMatch[2]}`;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const formatMonthLabel = (value: unknown) => {
      const monthKey = monthKeyFromValue(value);
      if (!monthKey) return String(value ?? '-');
      const [year, month] = monthKey.split('-');
      const d = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
      return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
    };
    const serviceTypeLabel = (value: unknown) => {
      const normalized = String(value ?? '').trim().toUpperCase();
      if (!normalized || normalized === 'UNSPECIFIED' || normalized === 'NULL') return '(sin tipo)';
      return normalized;
    };
    const formatPercent = (value: unknown, digits = 0) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return '-';
      return `${this.reportFmtNumber(n, digits)}%`;
    };
    const opMetricLabel = opMetric === 'avg' ? 'Promedio' : opMetric === 'p50' ? 'Mediana' : 'P90';
    const opSegments = Array.isArray(service?.operationalTimesComparisons?.segments)
      ? service.operationalTimesComparisons.segments
      : [];
    const selectedSegmentMeta = opSegments.find((segment: any) => segment?.key === opSegment) ?? null;
    const selectedTechName =
      (Array.isArray(service?.technicianPerformance)
        ? service.technicianPerformance.find((row: any) => row.userId === selectedTechId)?.name
        : null)
      ?? (Array.isArray(service?.technicianWeeklyProductivity)
        ? service.technicianWeeklyProductivity.find((row: any) => row.userId === selectedTechId)?.name
        : null)
      ?? null;

    const summaryBoxes = tab === 'assets'
      ? [
          ['Activos totales', assets?.total],
          ['En garantía', assets?.inWarranty],
          ['Garantía sin manuales', assets?.inWarrantyExcludingManual],
          ['Críticos HIGH', assets?.criticalHigh],
          ['Con OS abiertas', assets?.withOpenServiceOrders],
          ['Total montacargas', assets?.forkliftsTotal],
          ['Montacargas en garantía', assets?.forkliftsInWarranty],
        ]
      : [
          ['Backlog total', service?.backlogTotal],
          ['Vencidas', service?.overdue],
          ['Sin asignar', service?.unassigned],
          ['Cerradas en rango', service?.closedInRange],
          ['MTTR (h)', service?.mttrHours],
        ];

    const summaryBoxesHtml = summaryBoxes.map(([label, value]) => `
      <div class="summary-box">
        <div class="k">${this.reportEscapeHtml(label)}</div>
        <div class="v">${this.reportEscapeHtml(this.reportFmtNumber(value, label === 'MTTR (h)' ? 1 : 0))}</div>
      </div>
    `).join('');

    const filterRows = [
      `<tr><td class="label">Sección</td><td>${this.reportEscapeHtml(tab === 'assets' ? 'Gestión de activos' : 'Gestión de servicio técnico')}</td></tr>`,
      `<tr><td class="label">Rango</td><td>${this.reportEscapeHtml(rangeLabel)}</td></tr>`,
      `<tr><td class="label">Días</td><td>${this.reportEscapeHtml(range?.days ?? '-')}</td></tr>`,
      `<tr><td class="label">Generado</td><td>${this.reportEscapeHtml(reportDate)}</td></tr>`,
    ];
    if (tab === 'assets' && selectedNegotiationMonth && selectedNegotiationMonth !== 'all') {
      filterRows.push(`<tr><td class="label">Mes negociación</td><td>${this.reportEscapeHtml(formatMonthLabel(selectedNegotiationMonth))}</td></tr>`);
    }
    if (tab === 'service' && selectedTechName) {
      filterRows.push(`<tr><td class="label">Técnico semanal</td><td>${this.reportEscapeHtml(selectedTechName)}</td></tr>`);
    }
    if (tab === 'service' && selectedSegmentMeta) {
      filterRows.push(
        `<tr><td class="label">Comparativo</td><td>${this.reportEscapeHtml(
          `${opDim === 'TECHNICIAN' ? 'Técnico' : opDim === 'TYPE' ? 'Tipo de OS' : opDim === 'CUSTOMER' ? 'Cliente' : 'Sede'} · ${opMetricLabel} · ${selectedSegmentMeta.label}`,
        )}</td></tr>`,
      );
    }
    const filtersHtml = filterRows.join('');

    const assetStatusRows = Object.entries(assets?.byStatus ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => `<tr><td>${this.reportEscapeHtml(label)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(value))}</td></tr>`)
      .join('');
    const assetCriticalityRows = Object.entries(assets?.byCriticality ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => `<tr><td>${this.reportEscapeHtml(label)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(value))}</td></tr>`)
      .join('');
    const topAssetsRows = Array.isArray(assets?.topAssetsByOpenSO)
      ? assets.topAssetsByOpenSO.map((row: any) => `<tr><td>${this.reportEscapeHtml(row.assetCode)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.openSO))}</td></tr>`).join('')
      : '';
    const warrantyRows = Array.isArray(assets?.inWarrantyByName)
      ? assets.inWarrantyByName.map((row: any) => `<tr><td>${this.reportEscapeHtml(row.name)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.inWarranty))}</td></tr>`).join('')
      : '';

    const visibleNegotiationRows = Array.isArray(negotiationMonths)
      ? negotiationMonths.filter((row: any) => !selectedNegotiationMonth || selectedNegotiationMonth === 'all' || monthKeyFromValue(row?.month) === selectedNegotiationMonth)
      : [];
    const negotiationTotals = visibleNegotiationRows.reduce(
      (acc, row: any) => {
        acc.scheduled += Number(row?.scheduled ?? 0);
        acc.noManagement += Number(row?.noManagement ?? 0);
        acc.pendingQuote += Number(row?.pendingQuote ?? 0);
        acc.pendingApproval += Number(row?.pendingApproval ?? 0);
        acc.notApproved += Number(row?.notApproved ?? 0);
        acc.approved += Number(row?.approved ?? 0);
        acc.programmed += Number(row?.programmed ?? 0);
        acc.confirmed += Number(row?.confirmed ?? 0);
        acc.completed += Number(row?.completed ?? 0);
        acc.undefinedStatus += Number(row?.undefinedStatus ?? 0);
        return acc;
      },
      { scheduled: 0, noManagement: 0, pendingQuote: 0, pendingApproval: 0, notApproved: 0, approved: 0, programmed: 0, confirmed: 0, completed: 0, undefinedStatus: 0 },
    );
    const negotiationRows = visibleNegotiationRows.map((row: any) => `
      <tr>
        <td>${this.reportEscapeHtml(formatMonthLabel(row.month))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.scheduled))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.noManagement))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.pendingQuote))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.pendingApproval))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.notApproved))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.approved))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.programmed))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.confirmed))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.completed))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.undefinedStatus))}</td>
      </tr>
    `).join('');

    const monthlyHoursRows = Array.isArray(service?.monthlyAvailableHoursSummary)
      ? service.monthlyAvailableHoursSummary.map((row: any) => `
          <tr>
            <td>${this.reportEscapeHtml(formatMonthLabel(row.month))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.workingDays))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.availableHoursPerTech, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.technicianCount))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.totalAvailableHours, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.excludedDates ?? 0))}</td>
          </tr>
        `).join('')
      : '';
    const monthlyServiceColumns = Array.from(
      new Set(
        (Array.isArray(service?.monthlyServiceOrderTypeSummary) ? service.monthlyServiceOrderTypeSummary : [])
          .flatMap((row: any) => Array.isArray(row?.byServiceType) ? row.byServiceType.map((type: any) => serviceTypeLabel(type?.serviceType)) : []),
      ),
    );
    const monthlyServiceRows = Array.isArray(service?.monthlyServiceOrderTypeSummary)
      ? service.monthlyServiceOrderTypeSummary.map((row: any) => {
          const counts = new Map(
            (Array.isArray(row?.byServiceType) ? row.byServiceType : []).map((type: any) => [
              serviceTypeLabel(type?.serviceType),
              Number(type?.count ?? 0),
            ]),
          );
          return `
            <tr>
              <td>${this.reportEscapeHtml(formatMonthLabel(row.month))}</td>
              ${monthlyServiceColumns.map((column) => `<td class="right">${this.reportEscapeHtml(this.reportFmtNumber(counts.get(column) ?? 0))}</td>`).join('')}
              <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.total))}</td>
            </tr>
          `;
        }).join('')
      : '';

    const closedSummary = service?.closedOrdersSummary ?? {};
    const backlogStatusRows = Object.entries(service?.backlogByStatus ?? {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([status, count]) => `<tr><td>${this.reportEscapeHtml(status)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(count))}</td></tr>`)
      .join('');
    const technicianWorkloadRows = Array.isArray(service?.technicianWorkload)
      ? service.technicianWorkload.map((row: any) => `<tr><td>${this.reportEscapeHtml(row.name)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.openAssigned))}</td></tr>`).join('')
      : '';
    const closedByTechnicianRows = Array.isArray(closedSummary?.byTechnician)
      ? closedSummary.byTechnician.map((row: any) => `<tr><td>${this.reportEscapeHtml(row.name)}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.closedCount))}</td></tr>`).join('')
      : '';
    const closedByServiceTypeRows = Array.isArray(closedSummary?.byServiceType)
      ? closedSummary.byServiceType.map((row: any) => `<tr><td>${this.reportEscapeHtml(serviceTypeLabel(row.serviceType))}</td><td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.closedCount))}</td></tr>`).join('')
      : '';
    const closedByTechTypeRows = Array.isArray(closedSummary?.byTechnicianAndServiceType)
      ? closedSummary.byTechnicianAndServiceType.map((row: any) => `
          <tr>
            <td>${this.reportEscapeHtml(row.name)}</td>
            <td>${this.reportEscapeHtml(serviceTypeLabel(row.serviceType))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.closedCount))}</td>
          </tr>
        `).join('')
      : '';
    const operationalTimeRows = Array.isArray(service?.operationalTimes)
      ? service.operationalTimes.map((row: any) => {
          const closedInRange = Number(service?.closedInRange ?? 0);
          const coverage = closedInRange > 0 ? Math.round((Number(row?.count ?? 0) / closedInRange) * 100) : null;
          return `
            <tr>
              <td>${this.reportEscapeHtml(row.label)}</td>
              <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.count))}</td>
              <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.avgHours, 2))}</td>
              <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.p50Hours, 2))}</td>
              <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.p90Hours, 2))}</td>
              <td class="right">${coverage == null ? '-' : this.reportEscapeHtml(`${coverage}%`)}</td>
            </tr>
          `;
        }).join('')
      : '';
    const technicianRows = Array.isArray(service?.technicianPerformance)
      ? service.technicianPerformance.map((row: any) => `
          <tr>
            <td>${this.reportEscapeHtml(row.name)}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.closedInRange))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.effectiveHours, 1))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.hrsPerOs, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.availableHours, 1))}</td>
            <td class="right">${this.reportEscapeHtml(formatPercent(row.utilizationPct))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.avgCycleHours, 1))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.avgResponseHours, 1))}</td>
            <td class="right">${this.reportEscapeHtml(formatPercent(row.onTimeRate))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.openAssigned))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.overdueOpenAssigned))}</td>
          </tr>
        `).join('')
      : '';
    const avgTechRows = Array.isArray(service?.technicianTypeAverages)
      ? service.technicianTypeAverages.map((row: any) => `
          <tr>
            <td>${this.reportEscapeHtml(row.name)}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.dailyPreventive, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.dailyCorrective, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.dailyDiagnostic, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.dailyTotal, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.weeklyPreventive, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.weeklyCorrective, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.weeklyDiagnostic, 2))}</td>
            <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.weeklyTotal, 2))}</td>
          </tr>
        `).join('')
      : '';

    const weeklyRowsRaw = Array.isArray(service?.technicianWeeklyProductivity) ? service.technicianWeeklyProductivity : [];
    const effectiveSelectedTechId = selectedTechId || weeklyRowsRaw[0]?.userId || service?.technicianPerformance?.[0]?.userId || null;
    const selectedWeeklyRows = effectiveSelectedTechId ? weeklyRowsRaw.filter((row: any) => row.userId === effectiveSelectedTechId) : [];
    const selectedWeeklyName = selectedWeeklyRows[0]?.name || selectedTechName || null;
    const weeklyRows = selectedWeeklyRows.map((row: any) => {
      const d = new Date(String(row.weekStart ?? ''));
      const weekLabel = Number.isNaN(d.getTime())
        ? String(row.weekStart ?? '-')
        : `Semana ${new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)}`;
      return `
        <tr>
          <td>${this.reportEscapeHtml(weekLabel)}</td>
          <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.closedCount))}</td>
          <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.workHours, 1))}</td>
          <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(row.availableHours, 1))}</td>
          <td class="right">${this.reportEscapeHtml(formatPercent(row.utilizationPct, 1))}</td>
        </tr>
      `;
    }).join('');
    const weeklyTotals = selectedWeeklyRows.reduce<{ closed: number; hours: number; available: number }>(
      (acc, row: any) => {
        acc.closed += Number(row.closedCount ?? 0);
        acc.hours += Number(row.workHours ?? 0);
        acc.available += Number(row.availableHours ?? 0);
        return acc;
      },
      { closed: 0, hours: 0, available: 0 },
    );
    const weeklyUtilization = weeklyTotals.available > 0 ? (weeklyTotals.hours / weeklyTotals.available) * 100 : null;
    const weeklyHoursPerClosed = weeklyTotals.closed > 0 ? weeklyTotals.hours / weeklyTotals.closed : null;

    const opComp = service?.operationalTimesComparisons ?? null;
    const comparisonGroups =
      opDim === 'TECHNICIAN'
        ? opComp?.byTechnician ?? []
        : opDim === 'TYPE'
          ? opComp?.byServiceOrderType ?? []
          : opDim === 'CUSTOMER'
            ? opComp?.byCustomer ?? []
            : opComp?.byLocation ?? [];
    const getMetricValue = (metrics: any) => opMetric === 'avg' ? metrics?.avgHours : opMetric === 'p50' ? metrics?.p50Hours : metrics?.p90Hours;
    const comparisonRows = Array.isArray(comparisonGroups)
      ? comparisonGroups
          .map((group: any) => ({ group, metrics: group?.segments?.[opSegment] }))
          .filter((entry: any) => Number(entry?.metrics?.count ?? 0) > 0)
          .sort((a: any, b: any) => Number(getMetricValue(b.metrics) ?? 0) - Number(getMetricValue(a.metrics) ?? 0))
          .slice(0, opDim === 'TECHNICIAN' ? 20 : 30)
      : [];
    const comparisonRankingRows = comparisonRows.map((entry: any) => `
      <tr>
        <td>${this.reportEscapeHtml(entry.group?.groupLabel ?? entry.group?.groupKey ?? '(sin dato)')}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(entry.metrics?.count))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(entry.metrics?.avgHours, 2))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(entry.metrics?.p50Hours, 2))}</td>
        <td class="right">${this.reportEscapeHtml(this.reportFmtNumber(entry.metrics?.p90Hours, 2))}</td>
      </tr>
    `).join('');
    const technicianMatrixRows = opDim === 'TECHNICIAN' && Array.isArray(opComp?.byTechnician)
      ? opComp.byTechnician.map((group: any) => {
          const segmentCells = opSegments.map((segment: any) => {
            const metrics = group?.segments?.[segment.key];
            return `<td class="right">${this.reportEscapeHtml(this.reportFmtNumber(getMetricValue(metrics), 2))}<div class="muted">${this.reportEscapeHtml(this.reportFmtNumber(metrics?.count ?? 0))} mues.</div></td>`;
          }).join('');
          return `<tr><td>${this.reportEscapeHtml(group?.groupLabel ?? group?.groupKey ?? '(sin dato)')}</td>${segmentCells}</tr>`;
        }).join('')
      : '';
    const defaultSectionIds = tab === 'assets'
      ? [
          'asset-status-criticality',
          'asset-top-open',
          'asset-warranty-by-name',
          'asset-negotiation-summary',
          'asset-negotiation-table',
        ]
      : [
          'service-monthly-hours',
          'service-monthly-types',
          'service-backlog-workload',
          'service-closed-summary',
          'service-averages',
          'service-operational-times',
          'service-operational-comparisons',
          'service-performance',
          'service-weekly-productivity',
        ];
    const allowedSectionIds = new Set((sections.length ? sections : defaultSectionIds).map((value) => String(value).trim()).filter(Boolean));
    const includeSection = (id: string) => allowedSectionIds.has(id);

    const assetSections: string[] = [];
    if (includeSection('asset-status-criticality')) {
      assetSections.push(`
        <div class="grid two">
          <section class="card">
            <div class="subtitle">Estados de activos</div>
            <table>
              <thead><tr><th>Status</th><th class="right">Cantidad</th></tr></thead>
              <tbody>${assetStatusRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
            </table>
          </section>
          <section class="card">
            <div class="subtitle">Criticidad</div>
            <table>
              <thead><tr><th>Nivel</th><th class="right">Cantidad</th></tr></thead>
              <tbody>${assetCriticalityRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
            </table>
          </section>
        </div>
      `);
    }
    if (includeSection('asset-top-open')) {
      assetSections.push(`
        <section class="card">
          <div class="subtitle">Top activos con OS abiertas</div>
          <table>
            <thead><tr><th>Activo</th><th class="right">OS abiertas</th></tr></thead>
            <tbody>${topAssetsRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('asset-warranty-by-name')) {
      assetSections.push(`
        <section class="card">
          <div class="subtitle">Equipos en garantía por name</div>
          <table>
            <thead><tr><th>Name</th><th class="right">En garantía</th></tr></thead>
            <tbody>${warrantyRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('asset-negotiation-summary')) {
      assetSections.push(`
        <section class="card">
          <div class="subtitle">Resumen de negociación visible</div>
          <div class="summary">
            <div class="summary-box"><div class="k">OS total</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.scheduled))}</div></div>
            <div class="summary-box"><div class="k">NG</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.noManagement))}</div></div>
            <div class="summary-box"><div class="k">PC</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.pendingQuote))}</div></div>
            <div class="summary-box"><div class="k">PA</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.pendingApproval))}</div></div>
            <div class="summary-box"><div class="k">NA</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.notApproved))}</div></div>
            <div class="summary-box"><div class="k">AP</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.approved))}</div></div>
            <div class="summary-box"><div class="k">PR</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.programmed))}</div></div>
            <div class="summary-box"><div class="k">CF</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.confirmed))}</div></div>
            <div class="summary-box"><div class="k">CP</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.completed))}</div></div>
            <div class="summary-box"><div class="k">Sin definir</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(negotiationTotals.undefinedStatus))}</div></div>
          </div>
        </section>
      `);
    }
    if (includeSection('asset-negotiation-table')) {
      assetSections.push(`
        <section class="card">
          <div class="subtitle">Negociación de OS programadas y preventivos completados por mes</div>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th class="right">OS total</th>
                <th class="right">NG</th>
                <th class="right">PC</th>
                <th class="right">PA</th>
                <th class="right">NA</th>
                <th class="right">AP</th>
                <th class="right">PR</th>
                <th class="right">CF</th>
                <th class="right">CP</th>
                <th class="right">Sin definir</th>
              </tr>
            </thead>
            <tbody>${negotiationRows || `<tr><td colspan="11" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }

    const serviceSections: string[] = [];
    if (includeSection('service-monthly-hours')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Resumen mensual de horas disponibles</div>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th class="right">Días</th>
                <th class="right">Horas técnico</th>
                <th class="right">Técnicos</th>
                <th class="right">Horas totales</th>
                <th class="right">Fechas descontadas</th>
              </tr>
            </thead>
            <tbody>${monthlyHoursRows || `<tr><td colspan="6" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-monthly-types')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Resumen mensual por tipo de OS</div>
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                ${monthlyServiceColumns.map((column) => `<th class="right">${this.reportEscapeHtml(column)}</th>`).join('')}
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>${monthlyServiceRows || `<tr><td colspan="${monthlyServiceColumns.length + 2}" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-backlog-workload')) {
      serviceSections.push(`
        <div class="grid two">
          <section class="card">
            <div class="subtitle">Backlog por estado</div>
            <table>
              <thead><tr><th>Estado</th><th class="right">Cantidad</th></tr></thead>
              <tbody>${backlogStatusRows || `<tr><td colspan="2" class="muted">Sin backlog.</td></tr>`}</tbody>
            </table>
          </section>
          <section class="card">
            <div class="subtitle">Carga por técnico (OS activas)</div>
            <table>
              <thead><tr><th>Técnico</th><th class="right">Asignadas</th></tr></thead>
              <tbody>${technicianWorkloadRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
            </table>
          </section>
        </div>
      `);
    }
    if (includeSection('service-closed-summary')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Resumen de cierres por rango</div>
          <div class="grid three">
            <div>
              <div class="muted">Órdenes cerradas por técnico</div>
              <table>
                <thead><tr><th>Técnico</th><th class="right">Cerradas</th></tr></thead>
                <tbody>${closedByTechnicianRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
              </table>
            </div>
            <div>
              <div class="muted">Totales por clase de servicio</div>
              <table>
                <thead><tr><th>Clase</th><th class="right">Cerradas</th></tr></thead>
                <tbody>${closedByServiceTypeRows || `<tr><td colspan="2" class="muted">Sin datos.</td></tr>`}</tbody>
              </table>
            </div>
            <div>
              <div class="muted">Totales de técnico por clase</div>
              <table>
                <thead><tr><th>Técnico</th><th>Clase</th><th class="right">Cerradas</th></tr></thead>
                <tbody>${closedByTechTypeRows || `<tr><td colspan="3" class="muted">Sin datos.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        </section>
      `);
    }
    if (includeSection('service-averages')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Promedio diario y semanal por técnico</div>
          ${service?.technicianTypeAveragesBasis ? `
            <table>
              <tbody>
                <tr><td class="label">Horas disponibles del rango</td><td>${this.reportEscapeHtml(this.reportFmtNumber(service.technicianTypeAveragesBasis.availableHoursInRange, 2))} h</td></tr>
                <tr><td class="label">Equivalente en días laborables</td><td>${this.reportEscapeHtml(this.reportFmtNumber(service.technicianTypeAveragesBasis.equivalentWorkDays, 2))}</td></tr>
                <tr><td class="label">Equivalente en semanas laborables</td><td>${this.reportEscapeHtml(this.reportFmtNumber(service.technicianTypeAveragesBasis.equivalentWorkWeeks, 2))}</td></tr>
                <tr><td class="label">Horas semanales configuradas</td><td>${this.reportEscapeHtml(this.reportFmtNumber(service.technicianTypeAveragesBasis.configuredWeeklyHours, 2))}</td></tr>
              </tbody>
            </table>
          ` : `<div class="muted">Sin base de cálculo disponible.</div>`}
          <table>
            <thead>
              <tr>
                <th>Técnico</th>
                <th class="right">Día Prev.</th>
                <th class="right">Día Corr.</th>
                <th class="right">Día Diag.</th>
                <th class="right">Día Total</th>
                <th class="right">Semana Prev.</th>
                <th class="right">Semana Corr.</th>
                <th class="right">Semana Diag.</th>
                <th class="right">Semana Total</th>
              </tr>
            </thead>
            <tbody>${avgTechRows || `<tr><td colspan="9" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-operational-times')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Tiempos operativos</div>
          <table>
            <thead>
              <tr>
                <th>Tramo</th>
                <th class="right">Muestras</th>
                <th class="right">Avg (h)</th>
                <th class="right">Mediana (h)</th>
                <th class="right">P90 (h)</th>
                <th class="right">Cobertura</th>
              </tr>
            </thead>
            <tbody>${operationalTimeRows || `<tr><td colspan="6" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-operational-comparisons')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Comparativos por tramo</div>
          <div class="muted">
            Dimensión: ${this.reportEscapeHtml(opDim === 'TECHNICIAN' ? 'Técnico' : opDim === 'TYPE' ? 'Tipo de OS' : opDim === 'CUSTOMER' ? 'Cliente' : 'Sede')}
            · Métrica: ${this.reportEscapeHtml(opMetricLabel)}
            · Tramo: ${this.reportEscapeHtml(selectedSegmentMeta?.label ?? opSegment)}
          </div>
          ${opDim === 'TECHNICIAN' ? `
            <table>
              <thead>
                <tr>
                  <th>Técnico</th>
                  ${opSegments.map((segment: any) => `<th class="right">${this.reportEscapeHtml(segment.label)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>${technicianMatrixRows || `<tr><td colspan="${opSegments.length + 1}" class="muted">Sin datos.</td></tr>`}</tbody>
            </table>
          ` : ''}
          <table>
            <thead>
              <tr>
                <th>${this.reportEscapeHtml(opDim === 'TYPE' ? 'Tipo de OS' : opDim === 'CUSTOMER' ? 'Cliente' : opDim === 'LOCATION' ? 'Sede' : 'Técnico')}</th>
                <th class="right">Muestras</th>
                <th class="right">Avg</th>
                <th class="right">P50</th>
                <th class="right">P90</th>
              </tr>
            </thead>
            <tbody>${comparisonRankingRows || `<tr><td colspan="5" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-performance')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Desempeño por técnico (rango)</div>
          <table>
            <thead>
              <tr>
                <th>Técnico</th>
                <th class="right">OS cerradas</th>
                <th class="right">Horas</th>
                <th class="right">Hrs/OS</th>
                <th class="right">Disp.</th>
                <th class="right">Utilización</th>
                <th class="right">Ciclo (h)</th>
                <th class="right">Respuesta (h)</th>
                <th class="right">% a tiempo</th>
                <th class="right">Backlog</th>
                <th class="right">Vencidas</th>
              </tr>
            </thead>
            <tbody>${technicianRows || `<tr><td colspan="11" class="muted">Sin datos.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }
    if (includeSection('service-weekly-productivity')) {
      serviceSections.push(`
        <section class="card">
          <div class="subtitle">Productividad semanal por técnico${selectedWeeklyName ? `: ${this.reportEscapeHtml(selectedWeeklyName)}` : ''}</div>
          <div class="summary">
            <div class="summary-box"><div class="k">OS cerradas (semanal)</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(weeklyTotals.closed))}</div></div>
            <div class="summary-box"><div class="k">Horas (semanal)</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(weeklyTotals.hours, 1))}</div></div>
            <div class="summary-box"><div class="k">Utilización</div><div class="v">${this.reportEscapeHtml(formatPercent(weeklyUtilization, 1))}</div></div>
            <div class="summary-box"><div class="k">Hrs/OS</div><div class="v">${this.reportEscapeHtml(this.reportFmtNumber(weeklyHoursPerClosed, 2))}</div></div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                <th class="right">OS cerradas</th>
                <th class="right">Horas</th>
                <th class="right">Horas disp.</th>
                <th class="right">Utilización</th>
              </tr>
            </thead>
            <tbody>${weeklyRows || `<tr><td colspan="5" class="muted">Sin datos en el rango seleccionado.</td></tr>`}</tbody>
          </table>
        </section>
      `);
    }

    const bodyContent = (tab === 'assets' ? assetSections : serviceSections).join('')
      || `<section class="card"><div class="muted">No se seleccionaron secciones para este reporte.</div></section>`;

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Dashboard</title>
  <style>
    :root { --fg: #0f172a; --muted: #64748b; --line: #dbe3ef; --bg: #f8fafc; --accent: #0f766e; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: var(--fg); margin: 0; background: white; }
    .page { padding: 24px 28px 30px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    .title { font-size: 24px; font-weight: 800; }
    .subtitle { font-size: 16px; font-weight: 700; margin-bottom: 10px; }
    .muted { color: var(--muted); font-size: 12px; }
    .card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin: 12px 0; }
    .grid { display: grid; gap: 12px; }
    .grid.two { grid-template-columns: 1fr 1fr; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .brand { display: flex; gap: 12px; align-items: center; }
    .brand img { max-height: 48px; max-width: 220px; object-fit: contain; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .summary-box { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: var(--bg); }
    .summary-box .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .summary-box .v { font-size: 22px; font-weight: 800; margin-top: 6px; color: var(--accent); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; font-size: 12px; }
    th { background: var(--bg); text-align: left; }
    .right { text-align: right; }
    .label { width: 180px; background: #fafafa; font-weight: 700; }
    @media print {
      .page { padding: 0; }
      .card { break-inside: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="title">Dashboard ${this.reportEscapeHtml(tab === 'assets' ? 'de Gestión de Activos' : 'de Servicio Técnico')}</div>
        <div class="muted">Generado: ${this.reportEscapeHtml(reportDate)}</div>
        <div class="muted">Rango: ${this.reportEscapeHtml(rangeLabel)}</div>
      </div>
    </div>

    <section class="card">
      <div class="brand">
        ${tenant?.logoUrl ? `<img src="${this.reportEscapeHtml(tenant.logoUrl)}" alt="Logo" />` : ''}
        <div>
          <div class="subtitle">${this.reportEscapeHtml(tenant?.legalName ?? tenant?.name ?? 'Tenant')}</div>
          <div class="muted">Reporte PDF exportado desde dashboard</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="summary">
        ${summaryBoxesHtml}
      </div>
    </section>

    <section class="card">
      <div class="subtitle">Parámetros del reporte</div>
      <table><tbody>${filtersHtml}</tbody></table>
    </section>

    ${bodyContent}
  </div>
</body>
</html>`;
  }
}
