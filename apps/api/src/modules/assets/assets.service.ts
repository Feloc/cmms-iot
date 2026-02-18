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

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const data: Prisma.AssetCreateInput = {
      tenant: { connect: { id: tenantId } },
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: dto.customer?.trim() ? dto.customer.trim() : null,
      brand: dto.brand ?? null,
      model: dto.model ?? null,
      serialNumber: dto.serialNumber ?? null,
      nominalPower: dto.nominalPower ?? null,
      nominalPowerUnit: dto.nominalPowerUnit ?? null,
      status: (dto.status as AssetStatus) ?? AssetStatus.ACTIVE,
      criticality: (dto.criticality as AssetCriticality) ?? AssetCriticality.MEDIUM,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : null,
      ingestKey: dto.ingestKey ?? null,
      assetTopicPrefix: dto.assetTopicPrefix ?? null,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => tx.asset.create({ data }));
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Asset code already exists for this tenant');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateAssetDto) {
    if (!id) throw new BadRequestException('id is required');

    const data: Prisma.AssetUpdateInput = {
      code: dto.code?.trim(),
      name: dto.name?.trim(),
      customer: dto.customer === undefined ? undefined : (dto.customer?.trim() ? dto.customer.trim() : null),
      brand: dto.brand,
      model: dto.model,
      serialNumber: dto.serialNumber,
      nominalPower: dto.nominalPower,
      nominalPowerUnit: dto.nominalPowerUnit,
      status: dto.status as any,
      criticality: dto.criticality as any,
      acquiredOn: dto.acquiredOn ? new Date(dto.acquiredOn as any) : undefined,
      ingestKey: dto.ingestKey,
      assetTopicPrefix: dto.assetTopicPrefix,
    } as any;

    try {
      return await this.withTenantRLS(async (tx) => {
        const existing = await tx.asset.findFirst({ where: { id } });
        if (!existing) throw new NotFoundException('Asset not found');
        return tx.asset.update({ where: { id }, data });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Another asset with this code already exists');
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
      };
    });
  }

  async upsertMaintenancePlan(assetId: string, dto: UpsertAssetMaintenancePlanDto) {
    if (!assetId) throw new BadRequestException('assetId is required');
    const tenantId = this.getTenantId();

    return this.withTenantRLS(async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: assetId, tenantId },
        select: { id: true, code: true, acquiredOn: true },
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

      const updated = await (tx as any).assetMaintenancePlan.upsert({
        where: { assetId },
        create: {
          tenantId,
          assetId,
          pmPlanId,
          frequencyValue,
          frequencyUnit,
          lastMaintenanceAt: lastMaintenanceAt ?? null,
          planningHorizonValue,
          planningHorizonUnit,
          active: dto.active === undefined ? true : !!dto.active,
        },
        update: {
          pmPlanId,
          frequencyValue,
          frequencyUnit,
          ...(lastMaintenanceAt !== undefined ? { lastMaintenanceAt } : {}),
          planningHorizonValue,
          planningHorizonUnit,
          ...(dto.active !== undefined ? { active: !!dto.active } : {}),
        },
        include: {
          pmPlan: { select: { id: true, name: true, intervalHours: true, defaultDurationMin: true, active: true } },
        },
      });

      return {
        assetId: asset.id,
        assetCode: asset.code,
        acquiredOn: asset.acquiredOn,
        plan: updated,
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
        : asset.acquiredOn
        ? new Date(asset.acquiredOn)
        : null;
      if (!baseDate) {
        throw new BadRequestException('No base date found. Set acquiredOn on the asset or lastMaintenanceAt in maintenance plan');
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

      const existingByTs = new Set(
        (existing ?? [])
          .map((e: any) => (e.dueDate ? new Date(e.dueDate).getTime() : null))
          .filter((v: number | null): v is number => typeof v === 'number'),
      );

      const candidates: Date[] = [];
      let cursor = new Date(baseDate.getTime());
      let guard = 0;
      while (cursor.getTime() <= horizonEnd.getTime() && guard < 5000) {
        if (cursor.getTime() >= now.getTime()) {
          const ts = cursor.getTime();
          if (!existingByTs.has(ts)) candidates.push(new Date(cursor.getTime()));
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
        existingCount: existingByTs.size,
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
