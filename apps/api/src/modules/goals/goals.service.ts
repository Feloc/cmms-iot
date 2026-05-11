import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

const PREVENTIVE_MAINTENANCE_COMPLETED = 'PREVENTIVE_MAINTENANCE_COMPLETED';

@Injectable()
export class GoalsService {
  constructor(private prisma: PrismaService) {}

  async monthlyPreventiveMaintenance(tenantId: string, period?: string) {
    const month = this.normalizePeriod(period);
    const { start, end } = this.periodRange(month);
    const metric = PREVENTIVE_MAINTENANCE_COMPLETED;

    const goal = await this.prisma.goal.findUnique({
      where: { tenantId_metric_period: { tenantId, metric, period: month } },
      select: { target: true },
    });

    const [{ count } = { count: 0 }] = await this.prisma.$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "tenantId" = ${tenantId}
          AND "kind" = 'SERVICE_ORDER'
          AND "serviceOrderType" = 'PREVENTIVO'
          AND "status" IN ('COMPLETED', 'CLOSED')
          AND COALESCE("deliveredAt", "completedAt", "activityFinishedAt", "updatedAt") >= ${start}
          AND COALESCE("deliveredAt", "completedAt", "activityFinishedAt", "updatedAt") < ${end}
      `,
    );

    const target = Number(goal?.target ?? 0);
    const actual = Number(count ?? 0);
    const progress = target > 0 ? Math.round((actual / target) * 1000) / 10 : null;

    return {
      metric,
      period: month,
      target,
      actual,
      progress,
      remaining: Math.max(target - actual, 0),
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  async setMonthlyPreventiveMaintenanceTarget(tenantId: string, period: string | undefined, targetValue: unknown) {
    const month = this.normalizePeriod(period);
    const target = Number(targetValue);
    if (!Number.isInteger(target) || target < 0) {
      throw new BadRequestException('target must be a non-negative integer');
    }

    await this.prisma.goal.upsert({
      where: {
        tenantId_metric_period: {
          tenantId,
          metric: PREVENTIVE_MAINTENANCE_COMPLETED,
          period: month,
        },
      },
      create: {
        tenantId,
        metric: PREVENTIVE_MAINTENANCE_COMPLETED,
        period: month,
        target,
      },
      update: { target },
    });

    return this.monthlyPreventiveMaintenance(tenantId, month);
  }

  private normalizePeriod(period?: string) {
    const raw = String(period || '').trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;

    if (raw) throw new BadRequestException('period must use YYYY-MM format');

    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private periodRange(period: string) {
    const [yearStr, monthStr] = period.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException('period must use YYYY-MM format');
    }
    return {
      start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
      end: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0),
    };
  }
}
