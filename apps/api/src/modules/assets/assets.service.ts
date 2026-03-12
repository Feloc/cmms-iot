import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, AssetStatus, AssetCriticality } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { GenerateAssetMaintenancePlanDto, MaintenanceFrequencyUnit, UpsertAssetMaintenancePlanDto } from './dto/maintenance-plan.dto';


type FindAllQuery = {
  search?: string;
  serial?: string;
  name?: string;
  model?: string;
  customer?: string;
  status?: AssetStatus | '';
  locationId?: string;
  categoryId?: string;
  page?: number; // 1-based
  size?: number; // page size
  orderBy?: 'createdAt:desc' | 'createdAt:asc' | 'name:asc' | 'name:desc';
};

type Unit = MaintenanceFrequencyUnit;
type HourmeterBucket = 'day' | 'week' | 'month';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalString(v: any): string | null {
    const s = String(v ?? '').trim();
    return s ? s : null;
  }

  private assetUniqueConflictMessage(e: any, fallback: string): string {
    const targets = Array.isArray(e?.meta?.target) ? e.meta.target.map((t: any) => String(t)) : [];
    if (targets.includes('serialNumber')) return 'Another asset with this serial number already exists';
    if (targets.includes('code')) return fallback;
    return fallback;
  }

  private getTenantId(): string {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');
    return tenantId;
  }

  private async withTenantRLS<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const tenantId = this.getTenantId();
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  private async assertSerialNumberAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    serialNumber: string | null,
    excludeAssetId?: string,
  ): Promise<void> {
    if (!serialNumber) return;
    const existing = await tx.asset.findFirst({
      where: {
        tenantId,
        serialNumber,
        ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}),
      },
      select: { id: true, code: true },
    });
    if (existing) {
      throw new ConflictException(`Another asset with serial number "${serialNumber}" already exists (${existing.code})`);
    }
  }

  private assertUnit(v: any, field: string): Unit {
    const unit = String(v ?? '').trim().toUpperCase();
    if (unit !== 'DAY' && unit !== 'MONTH' && unit !== 'YEAR') {
      throw new BadRequestException(`${field} must be DAY | MONTH | YEAR`);
    }
    return unit as Unit;
  }

  private toPositiveInt(v: any, field: string): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new BadRequestException(`${field} must be a positive number`);
    return Math.round(n);
  }

  private parseDateNullable(v: any, field: string): Date | null {
    if (v === undefined) return null;
    if (v === null || v === '') return null;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) throw new BadRequestException(`${field} is invalid`);
    return d;
  }

  private parseHourmeterDateWindow(from?: string, to?: string, defaultDays = 90): { from: Date; to: Date } {
    const end = to ? new Date(to) : new Date();
    if (isNaN(end.getTime())) throw new BadRequestException('to is invalid');

    const start = from ? new Date(from) : new Date(end.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    if (isNaN(start.getTime())) throw new BadRequestException('from is invalid');
    if (start.getTime() > end.getTime()) throw new BadRequestException('from must be <= to');

    return { from: start, to: end };
  }

  private normalizeHourmeterBucket(bucket?: string): HourmeterBucket {
    const b = String(bucket || 'week').trim().toLowerCase();
    if (b === 'day' || b === 'week' || b === 'month') return b;
    throw new BadRequestException('bucket must be day | week | month');
  }

  private startOfBucketUTC(date: Date, bucket: HourmeterBucket): Date {
    const d = new Date(date.getTime());
    d.setUTCHours(0, 0, 0, 0);
    if (bucket === 'day') return d;
    if (bucket === 'month') {
      d.setUTCDate(1);
      return d;
    }
    const weekday = (d.getUTCDay() + 6) % 7; // Monday=0
    d.setUTCDate(d.getUTCDate() - weekday);
    return d;
  }

  private classifyPmCompliance(delta: number | null, targetHours: number | null): 'EARLY' | 'ON_TIME' | 'LATE' | 'UNKNOWN' {
    if (delta == null || targetHours == null || !Number.isFinite(targetHours) || targetHours <= 0) return 'UNKNOWN';
    if (delta < targetHours * 0.9) return 'EARLY';
    if (delta <= targetHours * 1.1) return 'ON_TIME';
    return 'LATE';
  }

  private addInterval(base: Date, value: number, unit: Unit): Date {
    const val = this.toPositiveInt(value, 'interval');
    const d = new Date(base.getTime());
    if (unit === 'DAY') {
      d.setUTCDate(d.getUTCDate() + val);
      return d;
    }
    if (unit === 'MONTH') return this.addMonthsClamped(d, val);
    return this.addMonthsClamped(d, val * 12);
  }

  private addMonthsClamped(base: Date, months: number): Date {
    const y = base.getUTCFullYear();
    const m = base.getUTCMonth();
    const day = base.getUTCDate();
    const hh = base.getUTCHours();
    const mi = base.getUTCMinutes();
    const ss = base.getUTCSeconds();
    const ms = base.getUTCMilliseconds();

    const first = new Date(Date.UTC(y, m + months, 1, hh, mi, ss, ms));
    const targetY = first.getUTCFullYear();
    const targetM = first.getUTCMonth();
    const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
    const clampedDay = Math.min(day, lastDay);

    return new Date(Date.UTC(targetY, targetM, clampedDay, hh, mi, ss, ms));
  }

  private normalizePreventiveDueDate(date: Date): Date {
    const d = new Date(date.getTime());
    d.setUTCHours(13, 0, 0, 0);
    return d;
  }

  private toUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private isAutoGeneratedPreventiveSo(wo: any, assetCode: string): boolean {
    const fd = wo?.formData && typeof wo.formData === 'object' ? (wo.formData as any) : {};
    if (fd?.autoGeneratedPm === true) return true;
    if (String(fd?.generatedBy || '').toUpperCase() === 'ASSET_MAINTENANCE_PLAN') return true;

    const title = String(wo?.title || '');
    const logs = Number(wo?._count?.workLogs ?? 0);
    const assignments = Number(wo?._count?.assignments ?? 0);
    return (
      String(wo?.status || '').toUpperCase() === 'SCHEDULED' &&
      logs === 0 &&
      assignments === 0 &&
      title.startsWith('PM ') &&
      title.includes(` - ${assetCode}`)
    );
  }

  private async syncFuturePreventiveOrdersFromPlanConfig(
    tx: Prisma.TransactionClient,
    tenantId: string,
    asset: { id: string; code: string; name: string | null; acquiredOn: Date | null },
    plan: any,
    previousPmPlanId?: string | null,
  ) {
    const now = new Date();
    const nowIso = now.toISOString();
    const emptyResult = {
      mode: 'SYNCED',
      baseDate: null as string | null,
      range: { from: nowIso, to: null as string | null },
      preservedManualCount: 0,
      autoManagedCount: 0,
      candidateCount: 0,
      updatedCount: 0,
      createdCount: 0,
      canceledCount: 0,
    };

    const relevantPlanIds = new Set<string>(
      [String(plan?.pmPlanId || '').trim(), String(previousPmPlanId || '').trim()].filter((v) => !!v),
    );

    const futureRows = await tx.workOrder.findMany({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        serviceOrderType: 'PREVENTIVO' as any,
        assetCode: asset.code,
        dueDate: { not: null, gte: now } as any,
        status: { in: ['OPEN', 'SCHEDULED'] as any },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        dueDate: true,
        status: true,
        title: true,
        pmPlanId: true,
        formData: true,
        _count: { select: { workLogs: true, assignments: true } },
      },
      take: 2000,
    });

    const autoManagedRows = (futureRows ?? []).filter((r: any) => {
      if (!this.isAutoGeneratedPreventiveSo(r, asset.code)) return false;
      const rowPmPlanId = String(r?.pmPlanId || '').trim();
      if (rowPmPlanId && relevantPlanIds.has(rowPmPlanId)) return true;
      const fd = r?.formData && typeof r.formData === 'object' ? (r.formData as any) : {};
      return String(fd?.generatedFromAssetId || '').trim() === String(asset.id || '').trim();
    });
    const autoManagedIds = new Set<string>((autoManagedRows ?? []).map((r: any) => String(r.id)));
    const manualRows = (futureRows ?? []).filter((r: any) => !autoManagedIds.has(String(r.id)));

    let canceledCount = 0;
    if (plan?.active === false) {
      for (const row of autoManagedRows) {
        const fd = row?.formData && typeof row.formData === 'object' ? (row.formData as any) : {};
        await tx.workOrder.update({
          where: { id: row.id },
          data: {
            status: 'CANCELED' as any,
            formData: {
              ...fd,
              autoGeneratedPm: true,
              generatedBy: 'ASSET_MAINTENANCE_PLAN',
              canceledByPlanSync: true,
              canceledAt: new Date().toISOString(),
              canceledReason: 'PLAN_INACTIVE',
            },
          } as any,
        });
        canceledCount += 1;
      }
      return {
        ...emptyResult,
        mode: 'INACTIVE_CANCELED',
        preservedManualCount: manualRows.length,
        autoManagedCount: autoManagedRows.length,
        canceledCount,
      };
    }

    const lastDone = await tx.workOrder.findFirst({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        serviceOrderType: 'PREVENTIVO' as any,
        assetCode: asset.code,
        pmPlanId: plan.pmPlanId,
        status: { in: ['COMPLETED', 'CLOSED'] as any },
      },
      orderBy: [{ deliveredAt: 'desc' }, { completedAt: 'desc' }, { dueDate: 'desc' }, { updatedAt: 'desc' }],
      select: { deliveredAt: true, completedAt: true, dueDate: true, updatedAt: true },
    });
    const inferredLastDate =
      lastDone?.deliveredAt ??
      lastDone?.completedAt ??
      lastDone?.dueDate ??
      lastDone?.updatedAt ??
      null;

    const baseDate = plan?.lastMaintenanceAt
      ? new Date(plan.lastMaintenanceAt)
      : inferredLastDate
      ? new Date(inferredLastDate)
      : plan?.planStartAt
      ? new Date(plan.planStartAt)
      : asset.acquiredOn
      ? new Date(asset.acquiredOn)
      : null;
    if (!baseDate || isNaN(baseDate.getTime())) {
      return {
        ...emptyResult,
        mode: 'SKIPPED_NO_BASE_DATE',
        preservedManualCount: manualRows.length,
        autoManagedCount: autoManagedRows.length,
      };
    }

    const freqValue = this.toPositiveInt(plan.frequencyValue, 'frequencyValue');
    const freqUnit = this.assertUnit(plan.frequencyUnit, 'frequencyUnit');
    const horizonValue = this.toPositiveInt(plan.planningHorizonValue ?? 6, 'planningHorizonValue');
    const horizonUnit = this.assertUnit(plan.planningHorizonUnit ?? 'MONTH', 'planningHorizonUnit');
    const horizonEnd = this.addInterval(now, horizonValue, horizonUnit);

    const occupiedByManual = new Set<string>(
      (manualRows ?? [])
        .map((row: any) => {
          if (!row?.dueDate) return null;
          const due = this.normalizePreventiveDueDate(new Date(row.dueDate));
          const dueTs = due.getTime();
          if (isNaN(dueTs)) return null;
          if (dueTs < now.getTime() || dueTs > horizonEnd.getTime()) return null;
          return this.toUtcDateKey(due);
        })
        .filter((v: string | null): v is string => typeof v === 'string' && v.length > 0),
    );

    const candidates: Date[] = [];
    const candidateDayKeys = new Set<string>();
    let cursor = new Date(baseDate.getTime());
    let guard = 0;
    while (cursor.getTime() <= horizonEnd.getTime() && guard < 5000) {
      const due = this.normalizePreventiveDueDate(cursor);
      const dueTs = due.getTime();
      if (dueTs >= now.getTime() && dueTs <= horizonEnd.getTime()) {
        const dayKey = this.toUtcDateKey(due);
        if (!occupiedByManual.has(dayKey) && !candidateDayKeys.has(dayKey)) {
          candidates.push(due);
          candidateDayKeys.add(dayKey);
        }
      }
      cursor = this.addInterval(cursor, freqValue, freqUnit);
      guard += 1;
    }
    if (guard >= 5000) throw new BadRequestException('Maintenance plan sync exceeded maximum iterations');

    const sortedAutoRows = [...autoManagedRows].sort((a: any, b: any) => {
      const aTs = a?.dueDate ? new Date(a.dueDate).getTime() : 0;
      const bTs = b?.dueDate ? new Date(b.dueDate).getTime() : 0;
      return aTs - bTs;
    });

    let updatedCount = 0;
    let createdCount = 0;
    const overlap = Math.min(sortedAutoRows.length, candidates.length);

    for (let i = 0; i < overlap; i += 1) {
      const row = sortedAutoRows[i];
      const due = candidates[i];
      const fd = row?.formData && typeof row.formData === 'object' ? (row.formData as any) : {};
      await tx.workOrder.update({
        where: { id: row.id },
        data: {
          pmPlanId: plan.pmPlanId,
          title: `PM ${plan.pmPlan?.name ?? 'Preventivo'} - ${asset.code}`,
          description: plan.pmPlan?.description ?? `Generada automáticamente para ${asset.name || asset.code}`,
          dueDate: due,
          durationMin: Number(plan.pmPlan?.defaultDurationMin ?? 60),
          formData: {
            ...fd,
            autoGeneratedPm: true,
            generatedBy: 'ASSET_MAINTENANCE_PLAN',
            syncedAt: new Date().toISOString(),
            syncReason: 'PLAN_CONFIG_UPDATE',
            generatedFromAssetId: asset.id,
            generatedFromPlanId: plan.id,
          },
        } as any,
      });
      updatedCount += 1;
    }

    for (let i = overlap; i < candidates.length; i += 1) {
      const due = candidates[i];
      await tx.workOrder.create({
        data: {
          tenantId,
          kind: 'SERVICE_ORDER',
          serviceOrderType: 'PREVENTIVO' as any,
          pmPlanId: plan.pmPlanId,
          assetCode: asset.code,
          title: `PM ${plan.pmPlan?.name ?? 'Preventivo'} - ${asset.code}`,
          description: plan.pmPlan?.description ?? `Generada automáticamente para ${asset.name || asset.code}`,
          dueDate: due,
          status: 'SCHEDULED' as any,
          durationMin: Number(plan.pmPlan?.defaultDurationMin ?? 60),
          formData: {
            autoGeneratedPm: true,
            generatedBy: 'ASSET_MAINTENANCE_PLAN',
            generatedAt: new Date().toISOString(),
            generatedFromAssetId: asset.id,
            generatedFromPlanId: plan.id,
            generatedFromSync: true,
          },
        } as any,
      });
      createdCount += 1;
    }

    for (let i = overlap; i < sortedAutoRows.length; i += 1) {
      const row = sortedAutoRows[i];
      const fd = row?.formData && typeof row.formData === 'object' ? (row.formData as any) : {};
      await tx.workOrder.update({
        where: { id: row.id },
        data: {
          status: 'CANCELED' as any,
          formData: {
            ...fd,
            autoGeneratedPm: true,
            generatedBy: 'ASSET_MAINTENANCE_PLAN',
            canceledByPlanSync: true,
            canceledAt: new Date().toISOString(),
            canceledReason: 'OUT_OF_HORIZON_OR_REPLACED',
          },
        } as any,
      });
      canceledCount += 1;
    }

    return {
      ...emptyResult,
      baseDate: baseDate.toISOString(),
      range: { from: nowIso, to: horizonEnd.toISOString() },
      preservedManualCount: manualRows.length,
      autoManagedCount: sortedAutoRows.length,
      candidateCount: candidates.length,
      updatedCount,
      createdCount,
      canceledCount,
    };
  }

  async findAll(q: FindAllQuery = {}) {
    const tenantId = this.getTenantId();
    const page = Math.max(1, Number(q.page || 1));
    const size = Math.min(100, Math.max(1, Number(q.size || 20)));
    const skip = (page - 1) * size;

    const where: Prisma.AssetWhereInput = { tenantId };

    if (q.search) {
      const s = q.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { brand: { contains: s, mode: 'insensitive' } },
        { model: { contains: s, mode: 'insensitive' } },
        { serialNumber: { contains: s, mode: 'insensitive' } },
        { customer: { contains: s, mode: 'insensitive' } },
      ];
    }

// Field-specific filters (AND with `search` if provided)
if (q.serial) where.serialNumber = { contains: q.serial.trim(), mode: 'insensitive' };
if (q.name) where.name = { contains: q.name.trim(), mode: 'insensitive' };
if (q.model) where.model = { contains: q.model.trim(), mode: 'insensitive' };
if (q.customer) where.customer = { contains: q.customer.trim(), mode: 'insensitive' };

    if (q.status) where.status = q.status as AssetStatus;
    if (q.locationId) where.locationId = q.locationId;
    if (q.categoryId) where.categoryId = q.categoryId;

    const orderBy: Prisma.AssetOrderByWithRelationInput[] = [];
    switch (q.orderBy) {
      case 'createdAt:asc':
        orderBy.push({ createdAt: 'asc' });
        break;
      case 'name:desc':
        orderBy.push({ name: 'desc' });
        break;
      case 'name:asc':
        orderBy.push({ name: 'asc' });
        break;
      default:
        orderBy.push({ createdAt: 'desc' });
    }

    return this.withTenantRLS(async (tx) => {
      const [items, total] = await Promise.all([
        tx.asset.findMany({ where, orderBy, skip, take: size }),
        tx.asset.count({ where }),
      ]);
      return { items, page, size, total, pages: Math.ceil(total / size) };
    });
  }

  async findOne(id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id },
        include: {
          maintenancePlan: {
            include: {
              pmPlan: { select: { id: true, name: true, intervalHours: true, defaultDurationMin: true, active: true } },
            },
          },
        },
      });
      if (!asset) throw new NotFoundException('Asset not found');
      return asset;
    });
  }

  async create(dto: CreateAssetDto) {
    const tenantId = this.getTenantId();
    const serialNumber = this.normalizeOptionalString(dto.serialNumber);

    const data: Prisma.AssetCreateInput = {
      tenant: { connect: { id: tenantId } },
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: dto.customer?.trim() ? dto.customer.trim() : null,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber,
      nominalPower: dto.nominalPower ?? null,
      nominalPowerUnit: dto.nominalPowerUnit ?? null,
      status: (dto.status as AssetStatus) ?? AssetStatus.ACTIVE,
      criticality: (dto.criticality as AssetCriticality) ?? AssetCriticality.MEDIUM,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : null,
      guarantee: dto.guarantee ? new Date(dto.guarantee as any) : null,
      ingestKey: dto.ingestKey ?? null,
      assetTopicPrefix: dto.assetTopicPrefix ?? null,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => {
        await this.assertSerialNumberAvailable(tx, tenantId, serialNumber);
        return tx.asset.create({ data });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(this.assetUniqueConflictMessage(e, 'Asset code already exists for this tenant'));
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateAssetDto) {
    if (!id) throw new BadRequestException('id is required');
    const tenantId = this.getTenantId();
    const normalizedSerialNumber = dto.serialNumber === undefined ? undefined : this.normalizeOptionalString(dto.serialNumber);

    const data: Prisma.AssetUpdateInput = {
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: dto.customer === undefined ? undefined : (dto.customer?.trim() ? dto.customer.trim() : null),
      brand: dto.brand,
      model: dto.model,
      serialNumber: normalizedSerialNumber,
      nominalPower: dto.nominalPower,
      nominalPowerUnit: dto.nominalPowerUnit,
      status: dto.status as any,
      criticality: dto.criticality as any,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : undefined,
      guarantee: dto.guarantee === undefined ? undefined : (dto.guarantee ? new Date(dto.guarantee as any) : null),
      ingestKey: dto.ingestKey,
      assetTopicPrefix: dto.assetTopicPrefix,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => {
        const existing = await tx.asset.findFirst({ where: { id } });
        if (!existing) throw new NotFoundException('Asset not found');
        await this.assertSerialNumberAvailable(
          tx,
          tenantId,
          normalizedSerialNumber === undefined ? this.normalizeOptionalString(existing.serialNumber) : normalizedSerialNumber,
          existing.id,
        );
        return tx.asset.update({ where: { id }, data });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(this.assetUniqueConflictMessage(e, 'Another asset with this code already exists'));
      }
      throw e;
    }
  }

  async getMaintenancePlan(assetId: string) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, acquiredOn: true },
      });
      if (!asset) throw new NotFoundException('Asset not found');

      const plan = await (tx as any).assetMaintenancePlan.findFirst({
        where: { tenantId, assetId },
        include: {
          pmPlan: { select: { id: true, name: true, intervalHours: true, defaultDurationMin: true, active: true } },
        },
      });

      const now = new Date();
      const futureWhere: any = {
        tenantId,
        kind: 'SERVICE_ORDER',
        serviceOrderType: 'PREVENTIVO',
        assetCode: asset.code,
        dueDate: { not: null, gte: now },
        status: { notIn: ['CANCELED', 'COMPLETED', 'CLOSED'] },
      };
      if (plan?.pmPlanId) futureWhere.pmPlanId = plan.pmPlanId;

      const futureServiceOrders = await tx.workOrder.findMany({
        where: futureWhere,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        select: { id: true, dueDate: true, status: true, title: true, pmPlanId: true },
        take: 500,
      });

      const recentWhere: any = {
        tenantId,
        kind: 'SERVICE_ORDER',
        serviceOrderType: 'PREVENTIVO',
        assetCode: asset.code,
        status: { in: ['COMPLETED', 'CLOSED'] },
      };
      if (plan?.pmPlanId) recentWhere.pmPlanId = plan.pmPlanId;

      const lastPreventiveMaintenances = await tx.workOrder.findMany({
        where: recentWhere,
        orderBy: [{ deliveredAt: 'desc' }, { completedAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          dueDate: true,
          status: true,
          title: true,
          pmPlanId: true,
          deliveredAt: true,
          completedAt: true,
          updatedAt: true,
        },
        take: 3,
      });

      return {
        assetId: asset.id,
        assetCode: asset.code,
        acquiredOn: asset.acquiredOn,
        plan: plan ?? null,
        futureServiceOrders: (futureServiceOrders ?? []).map((wo: any) => ({
          id: wo.id,
          dueDate: wo?.dueDate ? new Date(wo.dueDate).toISOString() : null,
          status: wo.status,
          title: wo.title,
          pmPlanId: wo.pmPlanId ?? null,
        })),
        lastPreventiveMaintenances: (lastPreventiveMaintenances ?? []).map((wo: any) => {
          const executedAt = wo?.deliveredAt ?? wo?.completedAt ?? wo?.updatedAt ?? null;
          return {
            id: wo.id,
            dueDate: wo?.dueDate ? new Date(wo.dueDate).toISOString() : null,
            executedAt: executedAt ? new Date(executedAt).toISOString() : null,
            status: wo.status,
            title: wo.title,
            pmPlanId: wo.pmPlanId ?? null,
          };
        }),
      };
    });
  }

  async getHourmeterReadings(assetId: string, limit?: number) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, name: true, latestHourmeter: true, latestHourmeterAt: true },
      } as any);
      if (!asset) throw new NotFoundException('Asset not found');

      const safeLimit = Number.isFinite(Number(limit)) ? Math.min(500, Math.max(1, Number(limit))) : 200;

      const rows = await (tx as any).assetMeterReading.findMany({
        where: { tenantId, assetId, meterType: 'HOURMETER' },
        orderBy: [{ readingAt: 'desc' }, { createdAt: 'desc' }],
        take: safeLimit,
        include: {
          workOrder: { select: { id: true, title: true, serviceOrderType: true, status: true } },
          createdByUser: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      const items = (rows ?? []).map((r: any) => ({
        id: r.id,
        reading: Number(r.reading),
        readingAt: r?.readingAt ? new Date(r.readingAt).toISOString() : null,
        phase: r?.phase ?? 'OTHER',
        source: r?.source ?? 'MANUAL_OS',
        note: r?.note ?? null,
        deltaFromPrevious: r?.deltaFromPrevious == null ? null : Number(r.deltaFromPrevious),
        workOrderId: r?.workOrderId ?? null,
        workOrder: r?.workOrder
          ? {
              id: r.workOrder.id,
              title: r.workOrder.title ?? null,
              serviceOrderType: r.workOrder.serviceOrderType ?? null,
              status: r.workOrder.status ?? null,
            }
          : null,
        createdAt: r?.createdAt ? new Date(r.createdAt).toISOString() : null,
        createdByUser: r?.createdByUser
          ? {
              id: r.createdByUser.id,
              name: r.createdByUser.name,
              email: r.createdByUser.email,
              role: r.createdByUser.role,
            }
          : null,
      }));

      return {
        asset: {
          id: asset.id,
          code: asset.code,
          name: asset.name ?? null,
          latestHourmeter: asset.latestHourmeter == null ? null : Number(asset.latestHourmeter),
          latestHourmeterAt: asset.latestHourmeterAt ? new Date(asset.latestHourmeterAt).toISOString() : null,
        },
        latest: items.length ? items[0] : null,
        items,
      };
    });
  }

  async getHourmeterAnalyticsSummary(assetId: string, from?: string, to?: string) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();
    const window = this.parseHourmeterDateWindow(from, to, 90);

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, name: true },
      } as any);
      if (!asset) throw new NotFoundException('Asset not found');

      const rows = await (tx as any).assetMeterReading.findMany({
        where: {
          tenantId,
          assetId,
          meterType: 'HOURMETER',
          readingAt: { gte: window.from, lte: window.to },
        },
        orderBy: [{ readingAt: 'asc' }, { createdAt: 'asc' }],
        select: {
          reading: true,
          readingAt: true,
          deltaFromPrevious: true,
        },
      });

      const count = rows.length;
      const first = count ? Number(rows[0].reading) : null;
      const last = count ? Number(rows[count - 1].reading) : null;
      const delta = first != null && last != null ? Number(last - first) : null;

      const firstAt = count ? new Date(rows[0].readingAt) : null;
      const lastAt = count ? new Date(rows[count - 1].readingAt) : null;
      const durationDays =
        firstAt && lastAt ? Math.max(0, (lastAt.getTime() - firstAt.getTime()) / (24 * 60 * 60 * 1000)) : 0;

      const avgHoursPerDay =
        delta != null && durationDays > 0
          ? Number((delta / durationDays).toFixed(4))
          : null;
      const avgHoursPerWeek = avgHoursPerDay == null ? null : Number((avgHoursPerDay * 7).toFixed(4));

      const decreaseEvents = rows.reduce((acc: number, r: any) => {
        const d = r?.deltaFromPrevious == null ? null : Number(r.deltaFromPrevious);
        return d != null && d < 0 ? acc + 1 : acc;
      }, 0);
      const largeJumpEvents = rows.reduce((acc: number, r: any) => {
        const d = r?.deltaFromPrevious == null ? null : Number(r.deltaFromPrevious);
        return d != null && d > 50 ? acc + 1 : acc;
      }, 0);

      return {
        asset: {
          id: asset.id,
          code: asset.code,
          name: asset.name ?? null,
        },
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
        readings: {
          count,
          first,
          last,
          delta,
        },
        usage: {
          avgHoursPerDay,
          avgHoursPerWeek,
        },
        quality: {
          decreaseEvents,
          largeJumpEvents,
        },
      };
    });
  }

  async getHourmeterAnalyticsSeries(assetId: string, from?: string, to?: string, bucket?: string) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();
    const window = this.parseHourmeterDateWindow(from, to, 180);
    const normalizedBucket = this.normalizeHourmeterBucket(bucket);

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, name: true },
      } as any);
      if (!asset) throw new NotFoundException('Asset not found');

      const rows = await (tx as any).assetMeterReading.findMany({
        where: {
          tenantId,
          assetId,
          meterType: 'HOURMETER',
          readingAt: { gte: window.from, lte: window.to },
        },
        orderBy: [{ readingAt: 'asc' }, { createdAt: 'asc' }],
        select: { reading: true, readingAt: true },
      });

      const buckets = new Map<string, { periodStart: Date; reading: number }>();
      for (const row of rows ?? []) {
        const dt = new Date(row.readingAt);
        if (isNaN(dt.getTime())) continue;
        const periodStart = this.startOfBucketUTC(dt, normalizedBucket);
        const key = periodStart.toISOString();
        buckets.set(key, { periodStart, reading: Number(row.reading) });
      }

      const ordered = Array.from(buckets.values()).sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
      const items: Array<{ periodStart: string; reading: number; delta: number | null }> = [];
      let prev: number | null = null;
      for (const point of ordered) {
        const delta = prev == null ? null : Number((point.reading - prev).toFixed(4));
        items.push({
          periodStart: point.periodStart.toISOString(),
          reading: Number(point.reading.toFixed(4)),
          delta,
        });
        prev = point.reading;
      }

      return {
        asset: {
          id: asset.id,
          code: asset.code,
          name: asset.name ?? null,
        },
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
        },
        bucket: normalizedBucket,
        items,
      };
    });
  }

  async getHourmeterPmPerformance(assetId: string, limit?: number) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(60, Math.max(1, Number(limit))) : 12;

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: {
          id: true,
          code: true,
          name: true,
        },
      });
      if (!asset) throw new NotFoundException('Asset not found');

      const plan = await (tx as any).assetMaintenancePlan.findFirst({
        where: { tenantId, assetId: asset.id, active: true },
        include: { pmPlan: { select: { intervalHours: true } } },
      });

      const targetHoursRaw = plan?.pmPlan?.intervalHours;
      const targetHours = targetHoursRaw == null ? null : Number(targetHoursRaw);

      const pmRowsRaw = await tx.workOrder.findMany({
        where: {
          tenantId,
          kind: 'SERVICE_ORDER',
          serviceOrderType: 'PREVENTIVO' as any,
          assetCode: asset.code,
          status: { in: ['COMPLETED', 'CLOSED'] as any },
        },
        orderBy: [{ deliveredAt: 'desc' }, { completedAt: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          status: true,
          deliveredAt: true,
          completedAt: true,
          updatedAt: true,
        },
        take: safeLimit * 3,
      });

      const pmRows: Array<{ id: string; title: string | null; status: string | null; closedAt: Date }> = [];
      for (const wo of pmRowsRaw ?? []) {
        const closedAtRaw = (wo as any)?.deliveredAt ?? (wo as any)?.completedAt ?? (wo as any)?.updatedAt ?? null;
        if (!closedAtRaw) continue;
        const closedAt = new Date(closedAtRaw as Date);
        if (Number.isNaN(closedAt.getTime())) continue;
        pmRows.push({
          id: String((wo as any).id),
          title: (wo as any)?.title ?? null,
          status: (wo as any)?.status ?? null,
          closedAt,
        });
      }
      pmRows.sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

      const pmTrimmed = pmRows.slice(Math.max(0, pmRows.length - safeLimit));
      if (!pmTrimmed.length) {
        return {
          asset: { id: asset.id, code: asset.code, name: asset.name ?? null },
          targetHours,
          items: [],
        };
      }

      const pmIds = pmTrimmed.map((p) => p.id);
      const byOrderRows = await (tx as any).assetMeterReading.findMany({
        where: { tenantId, assetId, meterType: 'HOURMETER', workOrderId: { in: pmIds } },
        orderBy: [{ readingAt: 'desc' }, { createdAt: 'desc' }],
        select: { workOrderId: true, reading: true, readingAt: true },
      });

      const byOrder = new Map<string, { reading: number; readingAt: Date }>();
      for (const row of byOrderRows ?? []) {
        const workOrderId = String((row as any)?.workOrderId || '');
        if (!workOrderId || byOrder.has(workOrderId)) continue;
        const readingAt = new Date((row as any).readingAt);
        if (Number.isNaN(readingAt.getTime())) continue;
        byOrder.set(workOrderId, {
          reading: Number((row as any).reading),
          readingAt,
        });
      }

      const lastPm = pmTrimmed[pmTrimmed.length - 1];
      if (!lastPm) {
        return {
          asset: { id: asset.id, code: asset.code, name: asset.name ?? null },
          targetHours,
          items: [],
        };
      }
      const maxClosedAt = lastPm.closedAt;
      const assetReadings = await (tx as any).assetMeterReading.findMany({
        where: {
          tenantId,
          assetId,
          meterType: 'HOURMETER',
          readingAt: { lte: maxClosedAt },
        },
        orderBy: [{ readingAt: 'asc' }, { createdAt: 'asc' }],
        select: { reading: true, readingAt: true },
        take: 10000,
      });

      const meterRows = (assetReadings ?? [])
        .map((r: any) => ({ reading: Number(r.reading), readingAt: new Date(r.readingAt) }))
        .filter((r: any) => !Number.isNaN(r.readingAt.getTime()))
        .sort((a: any, b: any) => a.readingAt.getTime() - b.readingAt.getTime());

      let meterIdx = 0;
      let latestBefore: { reading: number; readingAt: Date } | null = null;
      const ascendingItems: Array<{
        workOrderId: string;
        closedAt: string;
        status: string | null;
        title: string | null;
        readingAtPm: number | null;
        readingAtPmAt: string | null;
        source: 'BY_ORDER' | 'FALLBACK_AT_CLOSE' | 'NONE';
        deltaFromPreviousPm: number | null;
        compliance: 'EARLY' | 'ON_TIME' | 'LATE' | 'UNKNOWN';
      }> = [];

      let previousPmReading: number | null = null;
      for (const pm of pmTrimmed) {
        while (meterIdx < meterRows.length && meterRows[meterIdx].readingAt.getTime() <= pm.closedAt.getTime()) {
          latestBefore = meterRows[meterIdx];
          meterIdx += 1;
        }

        const byOrderReading = byOrder.get(pm.id) ?? null;
        const readingAtPm = byOrderReading
          ? Number(byOrderReading.reading)
          : latestBefore
          ? Number(latestBefore.reading)
          : null;
        const readingAtPmAt = byOrderReading
          ? byOrderReading.readingAt.toISOString()
          : latestBefore
          ? latestBefore.readingAt.toISOString()
          : null;

        const deltaFromPreviousPm =
          readingAtPm != null && previousPmReading != null
            ? Number((readingAtPm - previousPmReading).toFixed(4))
            : null;

        if (readingAtPm != null) previousPmReading = readingAtPm;

        ascendingItems.push({
          workOrderId: pm.id,
          closedAt: pm.closedAt.toISOString(),
          status: pm.status ?? null,
          title: pm.title ?? null,
          readingAtPm: readingAtPm == null ? null : Number(readingAtPm.toFixed(4)),
          readingAtPmAt,
          source: byOrderReading ? 'BY_ORDER' : latestBefore ? 'FALLBACK_AT_CLOSE' : 'NONE',
          deltaFromPreviousPm,
          compliance: this.classifyPmCompliance(deltaFromPreviousPm, targetHours),
        });
      }

      return {
        asset: { id: asset.id, code: asset.code, name: asset.name ?? null },
        targetHours,
        items: ascendingItems.slice().reverse(),
      };
    });
  }

  async getHourmeterRisk(limit?: number, customer?: string) {
    const tenantId = this.getTenantId();
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(200, Math.max(1, Number(limit))) : 50;
    const customerFilter = String(customer || '').trim();

    return this.withTenantRLS(async (tx) => {
      const plans = await (tx as any).assetMaintenancePlan.findMany({
        where: {
          tenantId,
          active: true,
          pmPlan: { intervalHours: { not: null } },
          ...(customerFilter
            ? { asset: { customer: { contains: customerFilter, mode: 'insensitive' } } }
            : {}),
        },
        include: {
          asset: {
            select: {
              id: true,
              code: true,
              name: true,
              customer: true,
              latestHourmeter: true,
            },
          },
          pmPlan: { select: { id: true, name: true, intervalHours: true } },
        },
        take: Math.max(safeLimit * 3, 200),
      });

      const rawItems: Array<{
        assetId: string;
        assetCode: string;
        assetName: string | null;
        customer: string | null;
        pmPlanId: string;
        pmPlanName: string | null;
        targetHours: number;
        lastPmWorkOrderId: string | null;
        lastPmClosedAt: string | null;
        lastPmReading: number | null;
        latestReading: number | null;
        hoursSinceLastPm: number | null;
        remainingHours: number | null;
        status: 'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN';
      }> = [];

      for (const plan of plans ?? []) {
        const asset = plan?.asset;
        const pmPlan = plan?.pmPlan;
        if (!asset?.id || !asset?.code || pmPlan?.intervalHours == null) continue;

        const targetHours = Number(pmPlan.intervalHours);
        if (!Number.isFinite(targetHours) || targetHours <= 0) continue;

        const lastPm = await tx.workOrder.findFirst({
          where: {
            tenantId,
            kind: 'SERVICE_ORDER',
            serviceOrderType: 'PREVENTIVO' as any,
            assetCode: asset.code,
            pmPlanId: plan.pmPlanId,
            status: { in: ['COMPLETED', 'CLOSED'] as any },
          },
          orderBy: [{ deliveredAt: 'desc' }, { completedAt: 'desc' }, { updatedAt: 'desc' }],
          select: { id: true, deliveredAt: true, completedAt: true, updatedAt: true },
        });

        const closedAt = lastPm?.deliveredAt ?? lastPm?.completedAt ?? lastPm?.updatedAt ?? null;

        let latestReading = asset.latestHourmeter == null ? null : Number(asset.latestHourmeter);
        if (latestReading == null) {
          const latestRow = await (tx as any).assetMeterReading.findFirst({
            where: { tenantId, assetId: asset.id, meterType: 'HOURMETER' },
            orderBy: [{ readingAt: 'desc' }, { createdAt: 'desc' }],
            select: { reading: true },
          });
          latestReading = latestRow?.reading == null ? null : Number(latestRow.reading);
        }

        let lastPmReading: number | null = null;
        if (lastPm?.id) {
          const byOrder = await (tx as any).assetMeterReading.findFirst({
            where: { tenantId, assetId: asset.id, meterType: 'HOURMETER', workOrderId: lastPm.id },
            orderBy: [{ readingAt: 'desc' }, { createdAt: 'desc' }],
            select: { reading: true },
          });
          if (byOrder?.reading != null) {
            lastPmReading = Number(byOrder.reading);
          } else if (closedAt) {
            const fallback = await (tx as any).assetMeterReading.findFirst({
              where: { tenantId, assetId: asset.id, meterType: 'HOURMETER', readingAt: { lte: closedAt } },
              orderBy: [{ readingAt: 'desc' }, { createdAt: 'desc' }],
              select: { reading: true },
            });
            lastPmReading = fallback?.reading == null ? null : Number(fallback.reading);
          }
        }

        const hoursSinceLastPm =
          latestReading != null && lastPmReading != null
            ? Number((latestReading - lastPmReading).toFixed(4))
            : null;
        const remainingHours =
          hoursSinceLastPm == null
            ? null
            : Number((targetHours - hoursSinceLastPm).toFixed(4));

        let status: 'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN' = 'UNKNOWN';
        if (remainingHours != null) {
          if (remainingHours < 0) status = 'OVERDUE';
          else if (remainingHours <= Math.max(targetHours * 0.1, 1)) status = 'DUE_SOON';
          else status = 'OK';
        }

        rawItems.push({
          assetId: asset.id,
          assetCode: asset.code,
          assetName: asset.name ?? null,
          customer: asset.customer ?? null,
          pmPlanId: String(pmPlan.id),
          pmPlanName: pmPlan?.name ?? null,
          targetHours,
          lastPmWorkOrderId: lastPm?.id ?? null,
          lastPmClosedAt: closedAt ? new Date(closedAt).toISOString() : null,
          lastPmReading,
          latestReading,
          hoursSinceLastPm,
          remainingHours,
          status,
        });
      }

      const severity: Record<'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN', number> = {
        OVERDUE: 0,
        DUE_SOON: 1,
        OK: 2,
        UNKNOWN: 3,
      };

      const items = rawItems
        .sort((a, b) => {
          const s = severity[a.status] - severity[b.status];
          if (s !== 0) return s;
          const ar = a.remainingHours == null ? Number.POSITIVE_INFINITY : a.remainingHours;
          const br = b.remainingHours == null ? Number.POSITIVE_INFINITY : b.remainingHours;
          return ar - br;
        })
        .slice(0, safeLimit);

      return {
        items,
        totalCandidates: rawItems.length,
      };
    });
  }

  async upsertMaintenancePlan(assetId: string, dto: UpsertAssetMaintenancePlanDto) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, name: true, acquiredOn: true },
      });
      if (!asset) throw new NotFoundException('Asset not found');

      const pmPlanId = String(dto.pmPlanId || '').trim();
      if (!pmPlanId) throw new BadRequestException('pmPlanId is required');

      const pmPlan = await tx.pmPlan.findFirst({
        where: { id: pmPlanId, tenantId },
        select: { id: true, name: true, active: true, defaultDurationMin: true, description: true },
      });
      if (!pmPlan) throw new BadRequestException('PM plan not found');

      const frequencyValue = this.toPositiveInt(dto.frequencyValue, 'frequencyValue');
      const frequencyUnit = this.assertUnit(dto.frequencyUnit, 'frequencyUnit');

      const planningHorizonValue =
        dto.planningHorizonValue === undefined
          ? 6
          : this.toPositiveInt(dto.planningHorizonValue, 'planningHorizonValue');
      const planningHorizonUnit = this.assertUnit(dto.planningHorizonUnit ?? 'MONTH', 'planningHorizonUnit');

      const lastMaintenanceAt =
        dto.lastMaintenanceAt === undefined
          ? undefined
          : this.parseDateNullable(dto.lastMaintenanceAt, 'lastMaintenanceAt');
      const planStartAt =
        dto.planStartAt === undefined
          ? undefined
          : this.parseDateNullable(dto.planStartAt, 'planStartAt');

      const previousConfig = await (tx as any).assetMaintenancePlan.findFirst({
        where: { tenantId, assetId },
        select: { id: true, pmPlanId: true },
      });

      const updated = await (tx as any).assetMaintenancePlan.upsert({
        where: { assetId },
        create: {
          tenantId,
          assetId,
          pmPlanId,
          frequencyValue,
          frequencyUnit,
          lastMaintenanceAt: lastMaintenanceAt ?? null,
          planStartAt: planStartAt ?? null,
          planningHorizonValue,
          planningHorizonUnit,
          active: dto.active === undefined ? true : !!dto.active,
        },
        update: {
          pmPlanId,
          frequencyValue,
          frequencyUnit,
          ...(lastMaintenanceAt !== undefined ? { lastMaintenanceAt } : {}),
          ...(planStartAt !== undefined ? { planStartAt } : {}),
          planningHorizonValue,
          planningHorizonUnit,
          ...(dto.active !== undefined ? { active: !!dto.active } : {}),
        },
        include: {
          pmPlan: { select: { id: true, name: true, intervalHours: true, description: true, defaultDurationMin: true, active: true } },
        },
      });

      const syncFutureOrders =
        dto.syncFutureOrders === true
          ? await this.syncFuturePreventiveOrdersFromPlanConfig(
              tx,
              tenantId,
              asset,
              updated,
              previousConfig?.pmPlanId ?? null,
            )
          : undefined;

      return {
        assetId: asset.id,
        assetCode: asset.code,
        acquiredOn: asset.acquiredOn,
        plan: updated,
        ...(syncFutureOrders ? { syncFutureOrders } : {}),
      };
    });
  }

  async generateMaintenancePlan(assetId: string, dto: GenerateAssetMaintenancePlanDto) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, name: true, acquiredOn: true },
      });
      if (!asset) throw new NotFoundException('Asset not found');

      const plan = await (tx as any).assetMaintenancePlan.findFirst({
        where: { tenantId, assetId },
        include: {
          pmPlan: { select: { id: true, name: true, description: true, defaultDurationMin: true, active: true } },
        },
      });
      if (!plan) throw new BadRequestException('Asset has no maintenance plan configuration');
      if (!plan.active) throw new BadRequestException('Asset maintenance plan is inactive');

      const lastDone = await tx.workOrder.findFirst({
        where: {
          tenantId,
          kind: 'SERVICE_ORDER',
          serviceOrderType: 'PREVENTIVO' as any,
          assetCode: asset.code,
          pmPlanId: plan.pmPlanId,
          status: { in: ['COMPLETED', 'CLOSED'] as any },
        },
        orderBy: [{ deliveredAt: 'desc' }, { completedAt: 'desc' }, { dueDate: 'desc' }, { updatedAt: 'desc' }],
        select: { deliveredAt: true, completedAt: true, dueDate: true, updatedAt: true },
      });

      const inferredLastDate =
        lastDone?.deliveredAt ??
        lastDone?.completedAt ??
        lastDone?.dueDate ??
        lastDone?.updatedAt ??
        null;

      const baseDate = plan.lastMaintenanceAt
        ? new Date(plan.lastMaintenanceAt)
        : inferredLastDate
        ? new Date(inferredLastDate)
        : plan?.planStartAt
        ? new Date(plan.planStartAt)
        : asset.acquiredOn
        ? new Date(asset.acquiredOn)
        : null;
      if (!baseDate) {
        throw new BadRequestException('No base date found. Set lastMaintenanceAt/planStartAt in maintenance plan or acquiredOn on the asset');
      }

      const freqValue = this.toPositiveInt(plan.frequencyValue, 'frequencyValue');
      const freqUnit = this.assertUnit(plan.frequencyUnit, 'frequencyUnit');

      const horizonValue =
        dto?.horizonValue !== undefined
          ? this.toPositiveInt(dto.horizonValue, 'horizonValue')
          : this.toPositiveInt(plan.planningHorizonValue ?? 6, 'planningHorizonValue');
      const horizonUnit = this.assertUnit(dto?.horizonUnit ?? plan.planningHorizonUnit ?? 'MONTH', 'horizonUnit');

      const now = new Date();
      const horizonEnd = this.addInterval(now, horizonValue, horizonUnit);

      const existing = await tx.workOrder.findMany({
        where: {
          tenantId,
          kind: 'SERVICE_ORDER',
          serviceOrderType: 'PREVENTIVO' as any,
          assetCode: asset.code,
          pmPlanId: plan.pmPlanId,
          dueDate: { not: null, gte: now, lte: horizonEnd } as any,
        },
        select: { id: true, dueDate: true },
      });

      const existingByDay = new Set(
        (existing ?? [])
          .map((e: any) => {
            if (!e?.dueDate) return null;
            const due = this.normalizePreventiveDueDate(new Date(e.dueDate));
            return this.toUtcDateKey(due);
          })
          .filter((v: string | null): v is string => typeof v === 'string' && v.length > 0),
      );

      const candidates: Date[] = [];
      const candidateDayKeys = new Set<string>();
      let cursor = new Date(baseDate.getTime());
      let guard = 0;
      while (cursor.getTime() <= horizonEnd.getTime() && guard < 5000) {
        const due = this.normalizePreventiveDueDate(cursor);
        const dueTs = due.getTime();
        if (dueTs >= now.getTime() && dueTs <= horizonEnd.getTime()) {
          const dayKey = this.toUtcDateKey(due);
          if (!existingByDay.has(dayKey) && !candidateDayKeys.has(dayKey)) {
            candidates.push(due);
            candidateDayKeys.add(dayKey);
          }
        }
        cursor = this.addInterval(cursor, freqValue, freqUnit);
        guard += 1;
      }
      if (guard >= 5000) throw new BadRequestException('Generation exceeded maximum iterations');

      const created: Array<{ id: string; dueDate: string }> = [];
      for (const due of candidates) {
        const wo = await tx.workOrder.create({
          data: {
            tenantId,
            kind: 'SERVICE_ORDER',
            serviceOrderType: 'PREVENTIVO' as any,
            pmPlanId: plan.pmPlanId,
            assetCode: asset.code,
            title: `PM ${plan.pmPlan?.name ?? 'Preventivo'} - ${asset.code}`,
            description: plan.pmPlan?.description ?? `Generada automáticamente para ${asset.name || asset.code}`,
            dueDate: due,
            status: 'SCHEDULED' as any,
            durationMin: Number(plan.pmPlan?.defaultDurationMin ?? 60),
            formData: {
              autoGeneratedPm: true,
              generatedBy: 'ASSET_MAINTENANCE_PLAN',
              generatedAt: new Date().toISOString(),
              generatedFromAssetId: asset.id,
              generatedFromPlanId: plan.id,
            },
          } as any,
          select: { id: true, dueDate: true },
        });
        created.push({ id: wo.id, dueDate: wo.dueDate ? new Date(wo.dueDate).toISOString() : due.toISOString() });
      }

      return {
        assetId: asset.id,
        assetCode: asset.code,
        pmPlanId: plan.pmPlanId,
        frequency: { value: freqValue, unit: freqUnit },
        baseDate: baseDate.toISOString(),
        range: { from: now.toISOString(), to: horizonEnd.toISOString() },
        existingCount: existingByDay.size,
        generatedCount: created.length,
        created,
      };
    });
  }

  async remove(id: string) {
    if (!id) throw new BadRequestException('id is required');
    return this.withTenantRLS(async (tx) => {
      const existing = await tx.asset.findFirst({ where: { id } });
      if (!existing) throw new NotFoundException('Asset not found');
      return tx.asset.update({ where: { id }, data: { status: AssetStatus.DECOMMISSIONED } });
    });
  }

/**
 * Lista los repuestos registrados en órdenes de servicio (SERVICE_ORDER) para este asset.
 * Útil para el tab "Repuestos cambiados".
 */
async listServiceOrderParts(assetId: string) {
  if (!assetId) throw new BadRequestException('assetId is required');
  const tenantId = this.getTenantId();

  return this.withTenantRLS(async (tx) => {
    const asset = await tx.asset.findFirst({ where: { id: assetId }, select: { id: true, code: true } });
    if (!asset) throw new NotFoundException('Asset not found');

    // ServiceOrderPart -> WorkOrder(kind=SERVICE_ORDER) -> assetCode
    const rows = await (tx as any).serviceOrderPart.findMany({
      where: {
        tenantId,
        stage: 'REPLACED',
        workOrder: {
          tenantId,
          kind: 'SERVICE_ORDER',
          assetCode: asset.code,
        },
      },
      include: {
        inventoryItem: true,
        workOrder: { select: { id: true, dueDate: true, title: true, serviceOrderType: true, status: true, deliveredAt: true, completedAt: true, updatedAt: true } },
      },
    });

    // Enriquecer replacedByUser (ServiceOrderPart no necesariamente tiene relación en todos los clientes)
    const userIds = Array.from(new Set<string>((rows ?? [])
      .map((r: any) => r.replacedByUserId)
      .filter((v: unknown): v is string => typeof v === "string" && v.length > 0)));
    const users = userIds.length
      ? await tx.user.findMany({ where: { tenantId, id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const userById = new Map(users.map((u: any) => [u.id, u]));

    return (rows ?? []).map((r: any) => ({ ...r, replacedByUser: r.replacedByUserId ? userById.get(r.replacedByUserId) ?? null : null }));
  });
}
}
