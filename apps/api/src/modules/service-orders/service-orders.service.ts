import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ListServiceOrdersQuery } from './dto/list-service-orders.query';
import { ServiceOrdersCalendarQuery } from './dto/calendar.query';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ScheduleServiceOrderDto } from './dto/schedule-service-order.dto';
import { ServiceOrderTimestampsDto } from './dto/timestamps.dto';
import { ServiceOrderFormDataDto } from './dto/form-data.dto';
import { ServiceOrderSignaturesDto } from './dto/signatures.dto';
import { AddServiceOrderPartDto } from './dto/parts.dto';
import { MarkServiceOrderPartReplacedDto } from './dto/mark-part-replaced.dto';
import { CreateServiceOrderReportDto } from './dto/create-report.dto';
import { Prisma } from '@prisma/client';
import { normalizeQueryArray } from './utils/query-array';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class ServiceOrdersService {
  constructor(private prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  private coerceDate(d?: string | Date | null) {

    if (!d) return undefined;
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) throw new BadRequestException('Invalid date');
    return dt;
  }


// ---- Timestamps: reglas de secuencia ----
private readonly TS_ORDER = [
  'takenAt',
  'arrivedAt',
  'checkInAt',
  'activityStartedAt',
  'activityFinishedAt',
  'deliveredAt',
] as const;

private coerceNullableDate(d: any): Date | null | undefined {
  // undefined => no toca el campo
  if (d === undefined) return undefined;
  // null o '' => borrar
  if (d === null || d === '') return null;
  return this.coerceDate(d);
}

private validateTimestampChain(next: Record<string, Date | null>, explicitClears: Set<string>) {
  const order = this.TS_ORDER as unknown as string[];

  // Si se intenta borrar un timestamp que tiene posteriores registrados, no permitir.
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    if (!explicitClears.has(k)) continue;
    for (const later of order.slice(i + 1)) {
      if (next[later]) {
        throw new BadRequestException(
          `No puedes borrar ${k} mientras ${later} esté registrado. Borra primero los timestamps posteriores.`
        );
      }
    }
  }

  // Regla 1: no puedes registrar/modificar un timestamp si el anterior no existe.
  // Regla 2: la secuencia no puede ir hacia atrás en el tiempo.
  for (let i = 0; i < order.length; i++) {
    const k = order[i];
    const v = next[k];
    if (!v) continue;

    if (i > 0) {
      const prevK = order[i - 1];
      const prev = next[prevK];
      if (!prev) {
        throw new BadRequestException(`Debes registrar ${prevK} antes de registrar/modificar ${k}.`);
      }
      if (v.getTime() < prev.getTime()) {
        throw new BadRequestException(`${k} no puede ser más temprano que ${prevK}.`);
      }
    }
  }

  // Valida consistencia global (por si se editó un timestamp anterior y dejó el resto inválido)
  for (let i = 1; i < order.length; i++) {
    const a = next[order[i - 1]];
    const b = next[order[i]];
    if (b && !a) throw new BadRequestException(`Debes registrar ${order[i - 1]} antes de ${order[i]}.`);
    if (a && b && b.getTime() < a.getTime()) throw new BadRequestException(`${order[i]} no puede ser más temprano que ${order[i - 1]}.`);
  }
}



getUserId(): string {
  const t = tenantStorage.getStore();
  if (!t?.userId) throw new Error('No user in context');
  return t.userId;
}

private async assertAdmin() {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  const u = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
  if (!u || u.role !== 'ADMIN') throw new ForbiddenException('Admin only');
}


private async assertSo(id: string) {
  const tenantId = this.getTenantId();
  const so = await this.prisma.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
  if (!so) throw new NotFoundException('Service order not found');
  return { tenantId, so };
}



private async getCurrentUserRole(tx: any, tenantId: string, userId: string): Promise<string | null> {
  const u = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
  return u?.role ? String(u.role) : null;
}

private async isActiveTechnicianAssignment(tx: any, tenantId: string, workOrderId: string, userId: string): Promise<boolean> {
  const a = await tx.wOAssignment.findFirst({
    where: { tenantId, workOrderId, userId, role: 'TECHNICIAN', state: 'ACTIVE' as any },
    select: { id: true },
  });
  return !!a;
}

private async closeOpenWorkLogs(tx: any, tenantId: string, workOrderId: string, endedAt: Date) {
  await tx.workLog.updateMany({
    where: { tenantId, workOrderId, endedAt: null },
    data: { endedAt },
  });
}

private async findOtherOpenWorkLog(
  tx: any,
  tenantId: string,
  userId: string,
  excludeWorkOrderId: string,
): Promise<{ id: string; workOrderId: string; startedAt: Date; workOrder?: { title?: string | null } | null } | null> {
  return tx.workLog.findFirst({
    where: {
      tenantId,
      userId,
      endedAt: null,
      NOT: { workOrderId: excludeWorkOrderId },
    },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      workOrderId: true,
      startedAt: true,
      workOrder: { select: { title: true } },
    },
  });
}

private async ensureOpenWorkLog(tx: any, tenantId: string, workOrderId: string, userId: string, startedAt: Date) {
  // Un técnico no puede tener 2 WorkLogs abiertos en diferentes OS
  const otherOpen = await this.findOtherOpenWorkLog(tx, tenantId, userId, workOrderId);
  if (otherOpen) {
    const t = otherOpen?.workOrder?.title ? ` (${otherOpen.workOrder.title})` : '';
    throw new ConflictException(
      `Tienes un WorkLog abierto en otra OS${t}. Cierra ese WorkLog antes de iniciar uno nuevo.`,
    );
  }

  const open = await tx.workLog.findFirst({
    where: { tenantId, workOrderId, userId, endedAt: null },
    orderBy: { startedAt: 'desc' },
    select: { id: true, startedAt: true },
  });

  if (open) {
    // Si el técnico corrigió activityStartedAt, ajusta el startedAt del log abierto
    if (open.startedAt.getTime() !== startedAt.getTime()) {
      await tx.workLog.update({ where: { id: open.id }, data: { startedAt } });
    }
    return open.id;
  }

  const created = await tx.workLog.create({
    data: {
      tenantId,
      workOrderId,
      userId,
      startedAt,
      source: 'MANUAL',
      note: 'AUTO',
    } as any,
    select: { id: true },
  });

  return created.id;
}

// ---------------------------
// Bloqueo global: TECH con WorkLog abierto en otra OS no puede modificar esta OS
// ---------------------------
private async getOpenWorkLogElsewhere(
  tx: any,
  tenantId: string,
  userId: string,
  currentWorkOrderId: string,
): Promise<{ workOrderId: string; workOrderTitle: string | null; workLogId: string; startedAt: string } | null> {
  const other = await tx.workLog.findFirst({
    where: {
      tenantId,
      userId,
      endedAt: null,
      NOT: { workOrderId: currentWorkOrderId },
    },
    orderBy: { startedAt: 'desc' },
    select: { id: true, workOrderId: true, startedAt: true },
  });
  if (!other) return null;

  const otherWo = await tx.workOrder.findFirst({
    where: { id: other.workOrderId, tenantId, kind: 'SERVICE_ORDER' },
    select: { id: true, title: true },
  });
  if (!otherWo) return null;

  return {
    workOrderId: otherWo.id,
    workOrderTitle: otherWo.title ?? null,
    workLogId: other.id,
    startedAt: other.startedAt ? new Date(other.startedAt).toISOString() : new Date().toISOString(),
  };
}

private async assertTechCanMutateServiceOrder(
  tx: any,
  tenantId: string,
  actorUserId: string,
  serviceOrderId: string,
  role?: string | null,
) {
  const r = role ?? (await this.getCurrentUserRole(tx, tenantId, actorUserId));
  if (r !== 'TECH') return;

  const openWorkLog = await this.getOpenWorkLogElsewhere(tx, tenantId, actorUserId, serviceOrderId);
  if (!openWorkLog) return;

  const t = openWorkLog.workOrderTitle ? ` (${openWorkLog.workOrderTitle})` : '';
  throw new ConflictException({
    code: 'WORKLOG_OPEN_OTHER_OS',
    message: `Tienes un WorkLog abierto en otra OS${t}. Cierra ese WorkLog antes de continuar.`,
    openWorkLog,
  });
}


  // ---------------------------
  // Audit trail (nota al pie)
  // Guardamos un historial ligero en formData._audit para identificar
  // qué campo (y qué parte del campo) modificó cada usuario.
  // ---------------------------
  private auditValue(v: any) {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (v instanceof Date) return v.toISOString();
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    try {
      const s = JSON.stringify(v);
      return s.length > 800 ? s.slice(0, 800) + '…' : s;
    } catch {
      return String(v);
    }
  }

  private buildAuditEntry(actorUserId: string, field: string, part?: string, from?: any, to?: any) {
    return {
      at: new Date().toISOString(),
      byUserId: actorUserId,
      field,
      part,
      from: this.auditValue(from),
      to: this.auditValue(to),
    };
  }

  private async appendAuditMany(tx: any, tenantId: string, workOrderId: string, entries: any[]) {
    if (!entries?.length) return;

    const cur = await tx.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { formData: true },
    });

    const fd = cur?.formData && typeof cur.formData === 'object' ? (cur.formData as any) : {};
    const prev = Array.isArray((fd as any)._audit) ? (fd as any)._audit : [];
    const next = [...prev, ...entries].slice(-200);

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: { formData: { ...(fd ?? {}), _audit: next } } as any,
    });
  }

  private diffFormData(prev: any, next: any) {
    const changes: Array<{ field: string; part?: string; from?: any; to?: any }> = [];

    const pNotes = (prev?.notes ?? '');
    const nNotes = (next?.notes ?? '');
    if (pNotes !== nNotes) changes.push({ field: 'formData', part: 'notes', from: pNotes, to: nNotes });

    const pRes = (prev?.result ?? '');
    const nRes = (next?.result ?? '');
    if (pRes !== nRes) changes.push({ field: 'formData', part: 'result', from: pRes, to: nRes });

    const pCL = prev?.checklists && typeof prev.checklists === 'object' ? prev.checklists : {};
    const nCL = next?.checklists && typeof next.checklists === 'object' ? next.checklists : {};

    for (const k of Object.keys(nCL)) {
      const p = pCL?.[k];
      const n = nCL?.[k];
      if (!n || typeof n !== 'object') continue;

      const pItems = Array.isArray(p?.items) ? p.items : [];
      const nItems = Array.isArray(n?.items) ? n.items : [];
      const pByLabel = new Map<string, any>();
      for (const it of pItems) if (it?.label) pByLabel.set(String(it.label), it);

      for (const it of nItems) {
        const label = it?.label ? String(it.label) : '';
        if (!label) continue;
        const prevIt = pByLabel.get(label);

        const pdone = !!prevIt?.done;
        const ndone = !!it?.done;
        if (pdone != ndone) {
          changes.push({ field: 'formData', part: `checklists.${k}.${label}.done`, from: pdone, to: ndone });
        }

        const pnote = String(prevIt?.notes ?? '');
        const nnote = String(it?.notes ?? '');
        if (pnote != nnote) {
          changes.push({ field: 'formData', part: `checklists.${k}.${label}.notes`, from: pnote, to: nnote });
        }

        if (changes.length >= 30) break;
      }
      if (changes.length >= 30) break;
    }

    return changes;
  }


  async list(q: ListServiceOrdersQuery) {
    const tenantId = this.getTenantId();

    const page = Math.max(1, Number(q.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(q.size ?? 20)));
    const skip = (page - 1) * size;

    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      kind: 'SERVICE_ORDER',
    };const statuses = normalizeQueryArray((q as any).status);
if (statuses.length === 1) where.status = statuses[0] as any;
else if (statuses.length > 1) where.status = { in: statuses } as any;

const types = normalizeQueryArray((q as any).type);
if (types.length === 1) where.serviceOrderType = types[0] as any;
else if (types.length > 1) where.serviceOrderType = { in: types } as any;
// Búsqueda por título/assetCode (para serie/cliente, el frontend usa /assets?search=)
    if (q.q) {
      const s = String(q.q).trim();
      if (s) {
        where.OR = [
          { title: { contains: s, mode: 'insensitive' } },
          { assetCode: { contains: s, mode: 'insensitive' } },
        ];
      }
    }

    const truthy = (v: any) => String(v ?? '').trim() === '1' || String(v ?? '').trim().toLowerCase() === 'true';

    // Filtro por programadas / sin programar
    // - scheduledOnly=1 => dueDate NOT NULL
    // - unscheduledOnly=1 => dueDate IS NULL
    const scheduledOnly = truthy((q as any).scheduledOnly);
    const unscheduledOnly = truthy((q as any).unscheduledOnly);

    // Rango por fecha programada (dueDate)
    const start = this.coerceDate(q.start ?? undefined);
    const end = this.coerceDate(q.end ?? undefined);

    if (unscheduledOnly) {
      where.dueDate = null;
    } else if (scheduledOnly || start || end) {
      where.dueDate = {};
      if (scheduledOnly) (where.dueDate as any).not = null;
      if (start) (where.dueDate as any).gte = start;
      if (end) (where.dueDate as any).lte = end;
    }

    // Filtro por técnico: buscamos assignments ACTIVAS de rol TECHNICIAN
const techIds = normalizeQueryArray((q as any).technicianId);
if (techIds.length === 1 && String(techIds[0]).toUpperCase() === 'UNASSIGNED') {
  where.assignments = {
    none: {
      tenantId,
      state: 'ACTIVE',
      role: 'TECHNICIAN',
    },
  };
} else if (techIds.length === 1) {
  where.assignments = {
    some: {
      tenantId,
      state: 'ACTIVE',
      role: 'TECHNICIAN',
      userId: techIds[0],
    },
  };
} else if (techIds.length > 1) {
  where.assignments = {
    some: {
      tenantId,
      state: 'ACTIVE',
      role: 'TECHNICIAN',
      userId: { in: techIds },
    },
  };
}
const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        include: {
          assignments: { where: { state: 'ACTIVE' }, include: { user: true } },
          pmPlan: true,
        },
        skip,
        take: size,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    // Enriquecemos con datos del asset (cliente, marca, modelo, serie)
    const assetCodes = Array.from(new Set(items.map(i => i.assetCode).filter(Boolean)));
    const assets = await this.prisma.asset.findMany({
      where: { tenantId, code: { in: assetCodes } },
      select: { code: true, customer: true, name: true, brand: true, model: true, serialNumber: true },
    });
    const assetByCode = new Map(assets.map(a => [a.code, a]));

    const enriched = items.map((it: any) => ({
      ...it,
      asset: assetByCode.get(it.assetCode) ?? null,
    }));

    return { items: enriched, total, page, size };
  }

  async calendar(q: ServiceOrdersCalendarQuery) {
    const tenantId = this.getTenantId();

    const start = this.coerceDate(q?.start);
    const end = this.coerceDate(q?.end);
    if (!start || !end) throw new BadRequestException('start and end are required');

    const where: Prisma.WorkOrderWhereInput = {
      tenantId,
      kind: 'SERVICE_ORDER',
      dueDate: { not: null, gte: start, lte: end } as any,
    };

    const techId = String(q?.technicianId ?? '').trim();
    if (techId) {
      if (techId.toUpperCase() === 'UNASSIGNED') {
        where.assignments = {
          none: {
            tenantId,
            state: 'ACTIVE',
            role: 'TECHNICIAN',
          },
        };
      } else {
        where.assignments = {
          some: {
            tenantId,
            state: 'ACTIVE',
            role: 'TECHNICIAN',
            userId: techId,
          },
        };
      }
    }

    const items = await this.prisma.workOrder.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 2000,
      include: {
        assignments: { where: { state: 'ACTIVE' }, include: { user: { select: { id: true, name: true } } } },
      },
    });

    const assetCodes = Array.from(new Set(items.map(i => String((i as any).assetCode || '').trim()).filter(Boolean)));
    const assets = await this.prisma.asset.findMany({
      where: { tenantId, code: { in: assetCodes } },
      select: { code: true, customer: true, name: true, brand: true, model: true, serialNumber: true },
    });
    const assetByCode = new Map(assets.map(a => [String((a as any).code || '').trim(), a]));

    return items.map((it: any) => ({
      ...it,
      asset: assetByCode.get(String(it.assetCode || '').trim()) ?? null,
    }));
  }
 
  async get(id: string) {
  const tenantId = this.getTenantId();
  const so = await this.prisma.workOrder.findFirst({
    where: { id, tenantId, kind: 'SERVICE_ORDER' },
    include: {
      assignments: { where: { state: 'ACTIVE' }, include: { user: true } },
      pmPlan: true,
      serviceOrderParts: { orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }], include: { inventoryItem: true } },
      workLogs: { orderBy: { startedAt: 'asc' } },
    },
  });
  if (!so) throw new NotFoundException('Service order not found');

  const asset = await this.prisma.asset.findFirst({
    where: { tenantId, code: so.assetCode },
    select: { code: true, customer: true, name: true, brand: true, model: true, serialNumber: true },
  });

  // WorkLog no tiene relación directa con User en el schema actual.
  const workLogs = (so as any).workLogs ?? [];

  // Audit trail vive en formData._audit (si existe)
  const rawFormData = (so as any).formData && typeof (so as any).formData === 'object' ? ((so as any).formData as any) : {};
  const audit = Array.isArray(rawFormData?._audit) ? (rawFormData._audit as any[]) : [];

  const userIds = Array.from(
    new Set([
      ...workLogs.map((w: any) => w.userId),
      ...audit.map((a: any) => a?.byUserId),
    ].filter(Boolean)),
  );

  const users = userIds.length
    ? await this.prisma.user.findMany({
        where: { tenantId, id: { in: userIds } },
        select: { id: true, name: true, email: true, role: true },
      })
    : [];

  const userById = new Map(users.map((u: any) => [u.id, u]));
  const enrichedLogs = workLogs.map((w: any) => ({ ...w, user: userById.get(w.userId) ?? null }));
  const enrichedAudit = audit.map((a: any) => ({ ...a, user: userById.get(a?.byUserId) ?? null }));

  const formData = { ...(rawFormData ?? {}), _audit: enrichedAudit };

  const actorUserId = this.getUserId();
const actor = await this.prisma.user.findFirst({ where: { id: actorUserId, tenantId }, select: { role: true } });
const openWorkLogElsewhere =
  actor?.role === 'TECH' ? await this.getOpenWorkLogElsewhere(this.prisma as any, tenantId, actorUserId, id) : null;

const _meta = openWorkLogElsewhere ? { openWorkLogElsewhere } : {};

return { ...(so as any), workLogs: enrichedLogs, formData, asset: asset ?? null, _meta };
}

  async create(dto: CreateServiceOrderDto) {
    const tenantId = this.getTenantId();

    const asset = await this.prisma.asset.findFirst({ where: { tenantId, code: dto.assetCode } });
    if (!asset) throw new BadRequestException('Asset not found for given assetCode');

    const title = dto.title?.trim() || `OS ${dto.serviceOrderType} - ${asset.code}`;

    return this.prisma.workOrder.create({
      data: {
        tenantId,
        kind: 'SERVICE_ORDER',
        serviceOrderType: dto.serviceOrderType as any,
        pmPlanId: dto.pmPlanId ?? undefined,
        assetCode: asset.code,
        title,
        description: dto.description,
        dueDate: dto.dueDate ? this.coerceDate(dto.dueDate) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateServiceOrderDto) {
  const tenantId = this.getTenantId();
  const actorUserId = this.getUserId();

  // Campos administrativos: solo ADMIN
  const adminOnlyKeys = ['assetCode', 'title', 'description', 'serviceOrderType', 'pmPlanId', 'durationMin'] as const;
  const wantsAdminChange = adminOnlyKeys.some((k) => (dto as any)[k] !== undefined);
  if (wantsAdminChange) await this.assertAdmin();

  return this.prisma.$transaction(async (tx) => {
    const current = await tx.workOrder.findFirst({
      where: { id, tenantId, kind: 'SERVICE_ORDER' },
      select: {
        id: true,
        status: true,
        activityFinishedAt: true,
        assetCode: true,
        title: true,
        description: true,
        serviceOrderType: true,
        pmPlanId: true,
        hasIssue: true,
        durationMin: true,
      },
    });
    if (!current) throw new NotFoundException('Service order not found');

    const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);

    await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

    let skipStatusChange = false;
    let infoMessage: string | null = null;

    const wantsStatusChange = (dto as any).status !== undefined;
    if (wantsStatusChange) {
      const nextStatus = String((dto as any).status || '').toUpperCase();
      const curStatus = String(current.status || 'OPEN').toUpperCase();

      if (role !== 'ADMIN') {
        if (role !== 'TECH') throw new ForbiddenException('Only technicians can change status');

        const assigned = await this.isActiveTechnicianAssignment(tx, tenantId, id, actorUserId);
        if (!assigned) {
          // Caso especial: un TECH no asignado intentando poner en pausa.
          // No lanzamos error; devolvemos un mensaje informativo y no aplicamos el cambio.
          if (nextStatus === 'ON_HOLD') {
            skipStatusChange = true;
            infoMessage = 'No estás asignado a esta OS. Solo el técnico asignado (o un ADMIN) puede ponerla en ON_HOLD.';
          } else {
            throw new ForbiddenException('You are not assigned to this service order');
          }
        }

        const allowed = new Set(['IN_PROGRESS', 'ON_HOLD', 'COMPLETED']);
        if (!skipStatusChange && !allowed.has(nextStatus)) throw new ForbiddenException('Invalid status change');

        const allowedTransitions =
          ((curStatus === 'OPEN' || curStatus === 'SCHEDULED') && nextStatus === 'IN_PROGRESS') ||
          (curStatus === 'IN_PROGRESS' && nextStatus === 'ON_HOLD') ||
          (curStatus === 'ON_HOLD' && nextStatus === 'IN_PROGRESS') ||
          ((curStatus === 'IN_PROGRESS' || curStatus === 'ON_HOLD') && nextStatus === 'COMPLETED');

        if (!skipStatusChange && !allowedTransitions) {
          throw new ForbiddenException(`Transition ${curStatus} -> ${nextStatus} not allowed`);
        }
      }
    }

    // Si cambia el activo, valida que exista en el tenant.
    if ((dto as any).assetCode !== undefined) {
      const code = String((dto as any).assetCode || '').trim();
      if (!code) throw new BadRequestException('assetCode is required');
      const asset = await tx.asset.findFirst({ where: { tenantId, code }, select: { code: true } });
      if (!asset) throw new BadRequestException('Asset not found for given assetCode');
    }

    const applyStatus = (dto as any).status !== undefined && !skipStatusChange;

    const data: any = {
      ...(dto.assetCode !== undefined ? { assetCode: String(dto.assetCode).trim() } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(applyStatus ? { status: dto.status as any } : {}),
      ...(dto.serviceOrderType !== undefined ? { serviceOrderType: dto.serviceOrderType as any } : {}),
      ...(dto.pmPlanId !== undefined ? { pmPlanId: dto.pmPlanId } : {}),
      ...(dto.hasIssue !== undefined ? { hasIssue: dto.hasIssue } : {}),
      ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
    };

    const hasChanges = Object.keys(data).length > 0;
    const updated = hasChanges
      ? await tx.workOrder.update({ where: { id }, data } as any)
      : await tx.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });

    // ---- WorkLogs automáticos por estados ----
    if (applyStatus) {
      const prev = String(current.status || 'OPEN').toUpperCase();
      const next = String((dto as any).status || '').toUpperCase();

      if (next === 'ON_HOLD' && prev !== 'ON_HOLD') {
        // Pausa: cerrar cualquier WorkLog abierto (de cualquier técnico)
        await this.closeOpenWorkLogs(tx, tenantId, id, new Date());
      }

      if (prev === 'ON_HOLD' && next === 'IN_PROGRESS') {
        // Reanuda: abre un nuevo tramo para el técnico que reanuda
        if (role === 'TECH') {
          await this.ensureOpenWorkLog(tx, tenantId, id, actorUserId, new Date());
        }
      }

      if (['COMPLETED', 'CLOSED', 'CANCELED'].includes(next) && !['COMPLETED', 'CLOSED', 'CANCELED'].includes(prev)) {
        // Cierre: cerrar todo WorkLog abierto
        const endedAt = current.activityFinishedAt ?? new Date();
        await this.closeOpenWorkLogs(tx, tenantId, id, endedAt);
      }
    }



    // ---- Audit trail (quién cambió qué) ----
    const auditEntries: any[] = [];

    // status
    if (applyStatus) {
      const prev = String(current.status || 'OPEN').toUpperCase();
      const next = String((dto as any).status || '').toUpperCase();
      if (prev !== next) auditEntries.push(this.buildAuditEntry(actorUserId, 'status', undefined, prev, next));
    }

    // cambios simples de campos (cuando vengan en dto)
    const fieldMap: Array<[string, any, any]> = [
      ['assetCode', (current as any).assetCode, (dto as any).assetCode],
      ['title', (current as any).title, (dto as any).title],
      ['description', (current as any).description, (dto as any).description],
      ['serviceOrderType', (current as any).serviceOrderType, (dto as any).serviceOrderType],
      ['pmPlanId', (current as any).pmPlanId, (dto as any).pmPlanId],
      ['hasIssue', (current as any).hasIssue, (dto as any).hasIssue],
      ['durationMin', (current as any).durationMin, (dto as any).durationMin],
    ];

    for (const [field, prev, next] of fieldMap) {
      if (next === undefined) continue;
      if (prev !== next) auditEntries.push(this.buildAuditEntry(actorUserId, field, undefined, prev, next));
    }

    if (auditEntries.length) {
      await this.appendAuditMany(tx, tenantId, id, auditEntries);
    }
    if (infoMessage) return { ...(updated as any), _info: infoMessage };
    return updated;
  });
}
async schedule(id: string, dto: ScheduleServiceOrderDto) {
  const tenantId = this.getTenantId();
  const actorUserId = this.getUserId();

  return this.prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
    if (!wo) throw new NotFoundException('Service order not found');


const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

    const prevTech = await tx.wOAssignment.findFirst({
      where: { tenantId, workOrderId: id, role: 'TECHNICIAN', state: 'ACTIVE' as any },
      select: { userId: true },
    });

    const data: Prisma.WorkOrderUpdateInput = {};

    // dueDate
    // - undefined: no cambia
    // - null: quitar programación (volver a "sin programación")
    // - string/Date: actualizar
    if (dto.dueDate === null) {
      data.dueDate = null;
    } else if (dto.dueDate !== undefined) {
      data.dueDate = this.coerceDate(dto.dueDate as any);
    }

    

// AUTO-STATUS:
// - Si se programa (dueDate no-null) y estaba OPEN => pasa a SCHEDULED
// - Si se desprograma (dueDate null) y estaba SCHEDULED => vuelve a OPEN
if (dto.dueDate === null) {
  if ((wo as any).status === 'SCHEDULED') (data as any).status = 'OPEN';
} else if (dto.dueDate !== undefined) {
  if ((wo as any).status === 'OPEN') (data as any).status = 'SCHEDULED';
}

// durationMin (para resize del calendario)
    if ((dto as any).durationMin === null) {
      (data as any).durationMin = null;
    } else if ((dto as any).durationMin !== undefined) {
      const v = Number((dto as any).durationMin);
      if (!Number.isFinite(v) || v <= 0) throw new BadRequestException('Invalid durationMin');
      (data as any).durationMin = Math.round(v);
    }

    // technicianId
    // - undefined: no tocar asignación
    // - null / "": quitar asignación
    // - string: reemplazar asignación
    const shouldClearTechWhenUnscheduling = dto.dueDate === null && dto.technicianId === undefined;
    const hasTechInstruction = dto.technicianId !== undefined || shouldClearTechWhenUnscheduling;
    let nextTechnicianId: string | null | undefined = undefined;

    if (hasTechInstruction) {
      const technicianId = shouldClearTechWhenUnscheduling
        ? ''
        : dto.technicianId
          ? String(dto.technicianId).trim()
          : '';

      nextTechnicianId = technicianId || null;

      // Borra asignaciones TECHNICIAN previas (evita depender de enums como INACTIVE/REMOVED)
      await tx.wOAssignment.deleteMany({
        where: { tenantId, workOrderId: id, role: 'TECHNICIAN' },
      });

      if (technicianId) {
        const tech = await tx.user.findFirst({
          where: { id: technicianId, tenantId },
          select: { id: true },
        });
        if (!tech) throw new BadRequestException('Technician not found');

        await tx.wOAssignment.create({
          data: {
            tenantId,
            workOrderId: id,
            userId: technicianId,
            role: 'TECHNICIAN',
            state: 'ACTIVE' as any,
          } as any,
        });
      }
    }

    const updated = Object.keys(data).length
      ? await tx.workOrder.update({ where: { id }, data })
      : wo;

    // ---- Audit trail ----
    const auditEntries: any[] = [];

    // dueDate
    if (dto.dueDate !== undefined) {
      const prevDue = (wo as any).dueDate ?? null;
      const nextDue = (data as any).dueDate ?? (dto.dueDate === null ? null : prevDue);
      if ((prevDue ? new Date(prevDue).toISOString() : null) !== (nextDue ? new Date(nextDue).toISOString() : null)) {
        auditEntries.push(this.buildAuditEntry(actorUserId, 'dueDate', 'schedule', prevDue, nextDue));
      }
    }

    // durationMin
    if ((dto as any).durationMin !== undefined) {
      const prevDur = (wo as any).durationMin ?? null;
      const nextDur = (data as any).durationMin ?? null;
      if (prevDur !== nextDur) auditEntries.push(this.buildAuditEntry(actorUserId, 'durationMin', 'schedule', prevDur, nextDur));
    }

    // technician assignment
    if (hasTechInstruction) {
      const prevId = (prevTech as any)?.userId ?? null;
      const nextId = nextTechnicianId ?? null;
      if (prevId !== nextId) auditEntries.push(this.buildAuditEntry(actorUserId, 'technicianId', 'schedule', prevId, nextId));
    }

    // auto-status por schedule
    if ((data as any).status !== undefined) {
      const prevStatus = String((wo as any).status ?? '').toUpperCase();
      const nextStatus = String((data as any).status ?? '').toUpperCase();
      if (prevStatus && nextStatus && prevStatus !== nextStatus) {
        auditEntries.push(this.buildAuditEntry(actorUserId, 'status', 'auto(schedule)', prevStatus, nextStatus));
      }
    }

    if (auditEntries.length) {
      await this.appendAuditMany(tx, tenantId, id, auditEntries);
    }

    return updated;
  });
}
async setTimestamps(id: string, dto: ServiceOrderTimestampsDto) {
  const { tenantId } = await this.assertSo(id);
  const actorUserId = this.getUserId();

  return this.prisma.$transaction(async (tx) => {
    const current = await tx.workOrder.findFirst({
      where: { id, tenantId, kind: 'SERVICE_ORDER' },
      select: {
        status: true,
        takenAt: true,
        arrivedAt: true,
        checkInAt: true,
        activityStartedAt: true,
        activityFinishedAt: true,
        deliveredAt: true,
      },
    });
    if (!current) throw new NotFoundException('Service order not found');


    const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
    await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

    const next: Record<string, Date | null> = {
      takenAt: current.takenAt,
      arrivedAt: current.arrivedAt,
      checkInAt: current.checkInAt,
      activityStartedAt: current.activityStartedAt,
      activityFinishedAt: current.activityFinishedAt,
      deliveredAt: current.deliveredAt,
    };

    const data: any = {};
    const explicitClears = new Set<string>();

    for (const k of this.TS_ORDER as unknown as string[]) {
      if ((dto as any)[k] === undefined) continue;

      const coerced = this.coerceNullableDate((dto as any)[k]);
      data[k] = coerced; // Date | null

      if (coerced === null) explicitClears.add(k);
      next[k] = coerced === undefined ? next[k] : coerced;
    }

    this.validateTimestampChain(next, explicitClears);

    // Estados automáticos por timestamps (no requiere ADMIN)
    const currentStatus = String(current.status || 'OPEN').toUpperCase();

    if ((dto as any).takenAt !== undefined && next.takenAt) {
      if (!['COMPLETED', 'CLOSED', 'CANCELED'].includes(currentStatus)) {
        data.status = 'IN_PROGRESS';
      }
    }

    if ((dto as any).activityFinishedAt !== undefined && next.activityFinishedAt) {
      if (!['CLOSED', 'CANCELED'].includes(currentStatus)) {
        data.status = 'COMPLETED';
      }
    }

    const updated = await tx.workOrder.update({
      where: { id },
      data,
    });

    // ---- WorkLogs automáticos por timestamps ----

    const statusAfter = String((data.status ?? current.status ?? 'OPEN')).toUpperCase();

    // Cuando el técnico registra/modifica activityStartedAt => crea/ajusta WorkLog abierto
    if (role === 'TECH' && (dto as any).activityStartedAt !== undefined && next.activityStartedAt) {
      if (!['ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELED'].includes(statusAfter)) {
        await this.ensureOpenWorkLog(tx, tenantId, id, actorUserId, next.activityStartedAt);
      }
    }

    // Cuando se registra activityFinishedAt => cerrar todos los WorkLogs abiertos
    if ((dto as any).activityFinishedAt !== undefined && next.activityFinishedAt) {
      await this.closeOpenWorkLogs(tx, tenantId, id, next.activityFinishedAt);
    }

    // ---- Audit trail ----
    const auditEntries: any[] = [];

    for (const k of this.TS_ORDER as unknown as string[]) {
      if ((dto as any)[k] === undefined) continue;
      const prevV = (current as any)[k] ?? null;
      const nextV = (data as any)[k] !== undefined ? (data as any)[k] : (next as any)[k] ?? null;
      const prevIso = prevV ? new Date(prevV).toISOString() : null;
      const nextIso = nextV ? new Date(nextV).toISOString() : null;
      if (prevIso !== nextIso) {
        auditEntries.push(this.buildAuditEntry(actorUserId, 'timestamps', k, prevV, nextV));
      }
    }

    if ((data as any).status !== undefined) {
      const prevS = String(current.status || 'OPEN').toUpperCase();
      const nextS = String((data as any).status || '').toUpperCase();
      if (prevS !== nextS) auditEntries.push(this.buildAuditEntry(actorUserId, 'status', 'auto(timestamps)', prevS, nextS));
    }

    if (auditEntries.length) {
      await this.appendAuditMany(tx, tenantId, id, auditEntries);
    }

    return updated;
  });
}

  // ---------------------------
  // WorkLogs manuales (técnico auxiliar)
  // ---------------------------
  async startWorkLog(id: string) {
    const { tenantId } = await this.assertSo(id);
    const actorUserId = this.getUserId();

    return this.prisma.$transaction(async (tx) => {
      const so = await tx.workOrder.findFirst({
        where: { id, tenantId, kind: 'SERVICE_ORDER' },
        select: { status: true },
      });
      if (!so) throw new NotFoundException('Service order not found');

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      if (role !== 'ADMIN' && role !== 'TECH') throw new ForbiddenException('Only technicians can start work logs');

      const status = String((so as any).status || 'OPEN').toUpperCase();
      if (['COMPLETED', 'CLOSED', 'CANCELED'].includes(status)) {
        throw new BadRequestException('Service order is closed');
      }

      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const existing = await tx.workLog.findFirst({
        where: { tenantId, workOrderId: id, userId: actorUserId, endedAt: null },
        select: { id: true, startedAt: true, endedAt: true, userId: true, note: true },
      });
      if (existing) return existing as any;

      const now = new Date();

      // Si la OS está en pausa (o aún no está en progreso), al iniciar un WorkLog la reanudamos.
      const auditEntries: any[] = [this.buildAuditEntry(actorUserId, 'workLogs', 'start', null, 'MANUAL_START')];

      if (!['IN_PROGRESS'].includes(status)) {
        await tx.workOrder.update({ where: { id }, data: { status: 'IN_PROGRESS' as any } });
        auditEntries.push(this.buildAuditEntry(actorUserId, 'status', 'auto(worklog-start)', status, 'IN_PROGRESS'));
      }

      const created = await tx.workLog.create({
        data: { tenantId, workOrderId: id, userId: actorUserId, startedAt: now, note: 'MANUAL_START' },
        select: { id: true, startedAt: true, endedAt: true, userId: true, note: true },
      });

      await this.appendAuditMany(tx, tenantId, id, auditEntries);

      return created as any;
    });
  }

  async closeWorkLog(id: string, workLogId: string) {
    const { tenantId } = await this.assertSo(id);
    const actorUserId = this.getUserId();

    return this.prisma.$transaction(async (tx) => {
      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      if (role !== 'ADMIN' && role !== 'TECH') throw new ForbiddenException('Only technicians can close work logs');


      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const log = await tx.workLog.findFirst({
        where: { id: workLogId, tenantId, workOrderId: id },
      });
      if (!log) throw new NotFoundException('Work log not found');

      if (role !== 'ADMIN' && (log as any).userId !== actorUserId) {
        throw new ForbiddenException('You can only close your own work log');
      }

      if ((log as any).endedAt) return log as any;

      const endedAt = new Date();
      const updated = await tx.workLog.update({
        where: { id: workLogId },
        data: { endedAt, note: ((log as any).note || '') + (String((log as any).note || '').includes('MANUAL_STOP') ? '' : ' MANUAL_STOP') },
      });

      const auditEntries: any[] = [this.buildAuditEntry(actorUserId, 'workLogs', 'close', workLogId, endedAt)];

      // Si no queda ningún WorkLog abierto y ya se había iniciado actividad, la OS pasa automáticamente a ON_HOLD
      const remainingOpen = await tx.workLog.count({ where: { tenantId, workOrderId: id, endedAt: null } });
      if (remainingOpen === 0) {
        const so = await tx.workOrder.findFirst({
          where: { id, tenantId, kind: 'SERVICE_ORDER' },
          select: { status: true, activityStartedAt: true },
        });

        const s = String((so as any)?.status || 'OPEN').toUpperCase();
        if (so?.activityStartedAt && s === 'IN_PROGRESS') {
          await tx.workOrder.update({ where: { id }, data: { status: 'ON_HOLD' as any } });
          auditEntries.push(this.buildAuditEntry(actorUserId, 'status', 'auto(no-open-worklog)', 'IN_PROGRESS', 'ON_HOLD'));
        }
      }

      await this.appendAuditMany(tx, tenantId, id, auditEntries);

      return updated as any;
    });
  }

  async setFormData(id: string, dto: ServiceOrderFormDataDto) {
    const { tenantId } = await this.assertSo(id);
    const actorUserId = this.getUserId();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findFirst({
        where: { id, tenantId, kind: 'SERVICE_ORDER' },
        select: { formData: true },
      });
      if (!current) throw new NotFoundException('Service order not found');

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const prevFormData =
        current.formData && typeof current.formData === 'object' ? (current.formData as any) : {};
      const nextFormData =
        dto.formData && typeof dto.formData === 'object' ? (dto.formData as any) : {};

      const updated = await tx.workOrder.update({
        where: { id },
        data: { formData: dto.formData } as any,
      });

      const diffs = this.diffFormData(prevFormData, nextFormData);
      const entries = diffs.map((d) => this.buildAuditEntry(actorUserId, d.field, d.part, d.from, d.to));
      if (entries.length) await this.appendAuditMany(tx, tenantId, id, entries);

      return updated;
    });
  }

  async setSignatures(id: string, dto: ServiceOrderSignaturesDto) {
    const { tenantId } = await this.assertSo(id);
    const actorUserId = this.getUserId();

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.workOrder.findFirst({
        where: { id, tenantId, kind: 'SERVICE_ORDER' },
        select: { technicianSignature: true, receiverSignature: true },
      });
      if (!current) throw new NotFoundException('Service order not found');

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const data: any = {
        ...(dto.technicianSignature !== undefined ? { technicianSignature: dto.technicianSignature } : {}),
        ...(dto.receiverSignature !== undefined ? { receiverSignature: dto.receiverSignature } : {}),
      };

      const updated = await tx.workOrder.update({ where: { id }, data: data as any });

      const entries: any[] = [];
      if (dto.technicianSignature !== undefined) {
        entries.push(
          this.buildAuditEntry(
            actorUserId,
            'technicianSignature',
            undefined,
            !!(current as any).technicianSignature,
            !!dto.technicianSignature,
          ),
        );
      }
      if (dto.receiverSignature !== undefined) {
        entries.push(
          this.buildAuditEntry(
            actorUserId,
            'receiverSignature',
            undefined,
            !!(current as any).receiverSignature,
            !!dto.receiverSignature,
          ),
        );
      }
      if (entries.length) await this.appendAuditMany(tx, tenantId, id, entries);

      return updated;
    });
  }

  async addPart(id: string, dto: AddServiceOrderPartDto) {
    const tenantId = this.getTenantId();
    const actorUserId = this.getUserId();

    if (!dto.inventoryItemId && !dto.freeText) throw new BadRequestException('inventoryItemId or freeText is required');
    const qty = dto.qty ?? 1;
    if (typeof qty !== 'number' || !isFinite(qty) || qty <= 0) throw new BadRequestException('qty must be > 0');

    return this.prisma.$transaction(async (tx) => {
      const so = await tx.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
      if (!so) throw new NotFoundException('Service order not found');

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const created = await tx.serviceOrderPart.create({
        data: {
          tenantId,
          workOrderId: id,
          inventoryItemId: dto.inventoryItemId ?? undefined,
          freeText: dto.freeText ?? undefined,
          qty,
          notes: dto.notes,
          stage: (dto as any).stage ?? 'REQUIRED',
        } as any,
        include: { inventoryItem: true },
      });

      const itemLabel = created.inventoryItemId ? `inventoryItem:${created.inventoryItemId}` : `freeText:${created.freeText ?? ''}`;
      await this.appendAuditMany(tx, tenantId, id, [
        this.buildAuditEntry(actorUserId, 'parts', 'add', null, { id: created.id, qty: created.qty, stage: (created as any).stage, item: itemLabel }),
      ]);

      return created;
    });
  }


  /**
   * Marca un repuesto (línea ServiceOrderPart) como "cambiado" (REPLACED) con manejo pro de cantidades:
   * - Si qtyReplaced == qty => convierte la línea a REPLACED.
   * - Si qtyReplaced < qty => reduce la línea REQUIRED y crea una nueva línea REPLACED.
   * Permisos: ADMIN o TECH asignado (assignment ACTIVE role TECHNICIAN).
   */
  async markPartReplaced(id: string, partId: string, dto: MarkServiceOrderPartReplacedDto) {
    const tenantId = this.getTenantId();
    const actorUserId = this.getUserId();
    const qtyReplaced = Number((dto as any)?.qtyReplaced);
    if (!isFinite(qtyReplaced) || qtyReplaced <= 0) throw new BadRequestException('qtyReplaced must be > 0');

    return this.prisma.$transaction(async (tx) => {
      const so = await tx.workOrder.findFirst({
        where: { id, tenantId, kind: 'SERVICE_ORDER' },
        select: { id: true },
      });
      if (!so) throw new NotFoundException('Service order not found');

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      const isAdmin = role === 'ADMIN';
      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      const isAssignedTech = role === 'TECH' ? await this.isActiveTechnicianAssignment(tx, tenantId, id, actorUserId) : false;
      if (!isAdmin && !isAssignedTech) throw new ForbiddenException('Not allowed');

      const part = await tx.serviceOrderPart.findFirst({
        where: { id: partId, tenantId, workOrderId: id },
      });
      if (!part) throw new NotFoundException('Part not found');

      const curStage = String((part as any).stage || 'REQUIRED');
      if (curStage !== 'REQUIRED') throw new BadRequestException('Only REQUIRED parts can be marked as REPLACED');

      const curQty = Number((part as any).qty ?? 0);
      if (!isFinite(curQty) || curQty <= 0) throw new BadRequestException('Invalid current qty');
      if (qtyReplaced > curQty) throw new BadRequestException('qtyReplaced cannot exceed current qty');

      const now = new Date();

      // Copiamos campos para la nueva línea (si aplica)
      const baseData: any = {
        tenantId,
        workOrderId: id,
        inventoryItemId: (part as any).inventoryItemId ?? undefined,
        freeText: (part as any).freeText ?? undefined,
        notes: (part as any).notes ?? undefined,
      };

      if (qtyReplaced === curQty) {
        const updated = await tx.serviceOrderPart.update({
          where: { id: partId },
          data: {
            stage: 'REPLACED' as any,
            replacedAt: now,
            replacedByUserId: actorUserId,
          } as any,
          include: { inventoryItem: true },
        });

        await this.appendAuditMany(tx, tenantId, id, [
          this.buildAuditEntry(actorUserId, 'parts', 'markReplaced', { id: partId, stage: 'REQUIRED', qty: curQty }, { id: partId, stage: 'REPLACED', qty: qtyReplaced }),
        ]);

        return updated;
      }

      // qtyReplaced < curQty => reduce REQUIRED y crea REPLACED
      const remaining = curQty - qtyReplaced;
      await tx.serviceOrderPart.update({
        where: { id: partId },
        data: { qty: remaining } as any,
      });

      const created = await tx.serviceOrderPart.create({
        data: {
          ...baseData,
          qty: qtyReplaced,
          stage: 'REPLACED',
          replacedAt: now,
          replacedByUserId: actorUserId,
        } as any,
        include: { inventoryItem: true },
      });

      await this.appendAuditMany(tx, tenantId, id, [
        this.buildAuditEntry(actorUserId, 'parts', 'markReplaced:split', { id: partId, stage: 'REQUIRED', qty: curQty }, { requiredRemaining: remaining, replacedCreatedId: created.id, replacedQty: qtyReplaced }),
      ]);

      return created;
    });
  }

  async removePart(id: string, partId: string) {
    const tenantId = this.getTenantId();
    const actorUserId = this.getUserId();

    return this.prisma.$transaction(async (tx) => {
      const part = await tx.serviceOrderPart.findFirst({ where: { id: partId, tenantId, workOrderId: id } });
      if (!part) throw new NotFoundException('Part not found');

      await tx.serviceOrderPart.delete

      const role = await this.getCurrentUserRole(tx, tenantId, actorUserId);
      await this.assertTechCanMutateServiceOrder(tx, tenantId, actorUserId, id, role);

      await tx.serviceOrderPart.delete({ where: { id: partId } });
      await this.appendAuditMany(tx, tenantId, id, [
        this.buildAuditEntry(actorUserId, 'parts', 'remove', { id: partId, qty: (part as any).qty, stage: (part as any).stage }, null),
      ]);

      return { ok: true };
    });
  }

  // ---------------------------
  // Reportes / Resumen de OS (versionado)
  // ---------------------------
  private calcDurationMin(a?: Date | null, b?: Date | null): number | null {
    if (!a || !b) return null;
    const ms = b.getTime() - a.getTime();
    if (!isFinite(ms) || ms < 0) return null;
    return Math.round(ms / 60000);
  }

  private buildOperationalTimes(so: any) {
    const takenAt = so.takenAt ? new Date(so.takenAt) : null;
    const arrivedAt = so.arrivedAt ? new Date(so.arrivedAt) : null;
    const checkInAt = so.checkInAt ? new Date(so.checkInAt) : null;
    const activityStartedAt = so.activityStartedAt ? new Date(so.activityStartedAt) : null;
    const activityFinishedAt = so.activityFinishedAt ? new Date(so.activityFinishedAt) : null;
    const deliveredAt = so.deliveredAt ? new Date(so.deliveredAt) : null;

    const seg = (key: string, label: string, a: Date | null, b: Date | null) => {
      const durationMin = this.calcDurationMin(a, b);
      return {
        key,
        label,
        start: a ? a.toISOString() : null,
        end: b ? b.toISOString() : null,
        durationMin,
      };
    };

    return {
      segments: [
        seg('taken_arrived', 'Desplazamiento (takenAt → arrivedAt)', takenAt, arrivedAt),
        seg('arrived_checkin', 'Proceso de ingreso (arrivedAt → checkInAt)', arrivedAt, checkInAt),
        seg('checkin_start', 'Entrega del equipo (checkInAt → activityStartedAt)', checkInAt, activityStartedAt),
        seg('start_finish', 'Trabajo en sitio (activityStartedAt → activityFinishedAt)', activityStartedAt, activityFinishedAt),
        seg('finish_delivered', 'Entrega final (activityFinishedAt → deliveredAt)', activityFinishedAt, deliveredAt),
        seg('arrived_delivered', 'Duración del servicio (arrivedAt → deliveredAt)', arrivedAt, deliveredAt),
      ],
    };
  }

  async listReports(serviceOrderId: string) {
    const tenantId = this.getTenantId();
    await this.assertSo(serviceOrderId);
    const items = await this.prisma.workOrderReport.findMany({
      where: { tenantId, workOrderId: serviceOrderId },
      orderBy: [{ audience: 'asc' }, { version: 'desc' }],
      select: { id: true, audience: true, version: true, createdAt: true, createdByUserId: true },
    });
    return { items };
  }

  async getReport(serviceOrderId: string, reportId: string) {
    const tenantId = this.getTenantId();
    await this.assertSo(serviceOrderId);
    const rep = await this.prisma.workOrderReport.findFirst({
      where: { id: reportId, tenantId, workOrderId: serviceOrderId },
      select: { id: true, audience: true, version: true, createdAt: true, createdByUserId: true, data: true },
    });
    if (!rep) throw new NotFoundException('Report not found');
    return rep;
  }

  async createReport(serviceOrderId: string, dto: CreateServiceOrderReportDto) {
    const tenantId = this.getTenantId();
    const actorUserId = this.getUserId();
    const audience = String((dto as any)?.audience || '').toUpperCase();
    if (audience !== 'CUSTOMER' && audience !== 'INTERNAL') throw new BadRequestException('Invalid audience');

    // Solo generar cuando está cerrada
    const so = await this.prisma.workOrder.findFirst({
      where: { id: serviceOrderId, tenantId, kind: 'SERVICE_ORDER' },
      include: {
        assignments: { where: { state: 'ACTIVE' }, include: { user: true } },
        pmPlan: true,
        serviceOrderParts: {
          orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
          include: { inventoryItem: true, replacedByUser: { select: { id: true, name: true, email: true, role: true } } },
        },
        workLogs: { orderBy: { startedAt: 'asc' } },
      },
    });
    if (!so) throw new NotFoundException('Service order not found');
    const st = String((so as any).status || '').toUpperCase();
    if (st !== 'COMPLETED' && st !== 'CLOSED') {
      throw new BadRequestException('Solo puedes generar el resumen cuando la OS está COMPLETED o CLOSED');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        legalName: true,
        taxId: true,
        address: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
      },
    });

    const asset = await this.prisma.asset.findFirst({
      where: { tenantId, code: (so as any).assetCode },
      select: { code: true, customer: true, name: true, brand: true, model: true, serialNumber: true },
    });

    // Enriquecer workLogs con user (WorkLog no tiene relación directa en el schema actual)
    const rawLogs = ((so as any).workLogs ?? []) as any[];
    const logUserIds = Array.from(new Set(rawLogs.map((w) => w.userId).filter(Boolean)));
    const logUsers = logUserIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: logUserIds } },
          select: { id: true, name: true, email: true, role: true },
        })
      : [];
    const logUserById = new Map(logUsers.map((u) => [u.id, u]));
    const enrichedLogs = rawLogs.map((w) => ({
      id: w.id,
      userId: w.userId,
      startedAt: w.startedAt,
      endedAt: w.endedAt,
      note: w.note ?? null,
      source: w.source ?? null,
      user: logUserById.get(w.userId) ?? null,
    }));

    const opTimes = this.buildOperationalTimes(so);

    const requiredParts = ((so as any).serviceOrderParts ?? []).filter((p: any) => String(p.stage || 'REQUIRED') === 'REQUIRED');
    const replacedParts = ((so as any).serviceOrderParts ?? []).filter((p: any) => String(p.stage || 'REQUIRED') === 'REPLACED');

    const payload: any = {
      generatedAt: new Date().toISOString(),
      tenant: tenant ?? null,
      audience,
      serviceOrder: {
        id: (so as any).id,
        title: (so as any).title,
        description: (so as any).description ?? null,
        status: (so as any).status,
        serviceOrderType: (so as any).serviceOrderType ?? null,
        hasIssue: !!(so as any).hasIssue,
        dueDate: (so as any).dueDate ?? null,
        formData: (so as any).formData ?? null,
        takenAt: (so as any).takenAt ?? null,
        arrivedAt: (so as any).arrivedAt ?? null,
        checkInAt: (so as any).checkInAt ?? null,
        activityStartedAt: (so as any).activityStartedAt ?? null,
        activityFinishedAt: (so as any).activityFinishedAt ?? null,
        deliveredAt: (so as any).deliveredAt ?? null,
        technicianSignature: (so as any).technicianSignature ?? null,
        receiverSignature: (so as any).receiverSignature ?? null,
        completedAt: (so as any).completedAt ?? null,
        createdAt: (so as any).createdAt ?? null,
        updatedAt: (so as any).updatedAt ?? null,
        assignments: ((so as any).assignments ?? []).map((a: any) => ({
          id: a.id,
          userId: a.userId,
          role: a.role,
          state: a.state,
          user: a.user ? { id: a.user.id, name: a.user.name, email: a.user.email, role: a.user.role } : null,
        })),
      },
      asset: asset ?? null,
      operationalTimes: opTimes,
      parts: {
        required: requiredParts.map((p: any) => ({
          id: p.id,
          qty: p.qty,
          notes: p.notes ?? null,
          freeText: p.freeText ?? null,
          inventoryItem: p.inventoryItem ? { id: p.inventoryItem.id, sku: p.inventoryItem.sku, name: p.inventoryItem.name, model: p.inventoryItem.model ?? null } : null,
        })),
        replaced: replacedParts.map((p: any) => ({
          id: p.id,
          qty: p.qty,
          notes: p.notes ?? null,
          freeText: p.freeText ?? null,
          replacedAt: p.replacedAt ?? null,
          replacedByUser: p.replacedByUser ? { id: p.replacedByUser.id, name: p.replacedByUser.name, email: p.replacedByUser.email, role: p.replacedByUser.role } : null,
          inventoryItem: p.inventoryItem ? { id: p.inventoryItem.id, sku: p.inventoryItem.sku, name: p.inventoryItem.name, model: p.inventoryItem.model ?? null } : null,
        })),
      },
    };

    if (audience === 'INTERNAL') {
      payload.workLogs = enrichedLogs;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.workOrderReport.findFirst({
        where: { tenantId, workOrderId: serviceOrderId, audience: audience as any },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      payload.version = version;

      return tx.workOrderReport.create({
        data: {
          tenantId,
          workOrderId: serviceOrderId,
          audience: audience as any,
          version,
          data: payload,
          createdByUserId: actorUserId,
        } as any,
        select: { id: true, audience: true, version: true, createdAt: true },
      });
    });

    return created;
  }

  // ---------------------------
  // Adjuntos (filesystem): imágenes, videos, documentos
  // ---------------------------
  private uploadsRoot(): string {
    // En Docker, por defecto cae en /app/uploads. En local, en <repo>/uploads
    return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  }

  /** Directorio base por ServiceOrder (compat: aquí quedan también las imágenes). */
  private soRootDir(tenantId: string, serviceOrderId: string): string {
    return path.join(this.uploadsRoot(), 'service-orders', tenantId, serviceOrderId);
  }

  private dirForType(tenantId: string, serviceOrderId: string, type: 'IMAGE' | 'VIDEO' | 'DOCUMENT'): string {
    const root = this.soRootDir(tenantId, serviceOrderId);
    if (type === 'IMAGE') return root; // compat con implementación anterior
    if (type === 'VIDEO') return path.join(root, 'videos');
    return path.join(root, 'documents');
  }

  private parseType(type: any): 'IMAGE' | 'VIDEO' | 'DOCUMENT' {
    const t = String(type || 'IMAGE').toUpperCase();
    if (t === 'IMAGE' || t === 'VIDEO' || t === 'DOCUMENT') return t as any;
    throw new BadRequestException('Invalid attachment type. Use IMAGE|VIDEO|DOCUMENT');
  }

  private async assertServiceOrderExists(serviceOrderId: string, tenantId: string) {
    const so = await this.prisma.workOrder.findFirst({
      where: { id: serviceOrderId, tenantId, kind: 'SERVICE_ORDER' },
      select: { id: true },
    });
    if (!so) throw new NotFoundException('Service order not found');
    return so;
  }

  async listAttachments(serviceOrderId: string, type: any) {
    const tenantId = this.getTenantId();
    await this.assertServiceOrderExists(serviceOrderId, tenantId);

    const t = this.parseType(type);
    const dir = this.dirForType(tenantId, serviceOrderId, t);

    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch (e: any) {
      if (e?.code === 'ENOENT') return { items: [] };
      throw e;
    }

    // Solo archivos (ignora directorios)
    const filtered: string[] = [];
    for (const f of files) {
      try {
        const st = await fs.stat(path.join(dir, f));
        if (st.isFile()) filtered.push(f);
      } catch {}
    }

    // Más nuevo primero si el nombre incluye Date.now()
    filtered.sort((a, b) => (a < b ? 1 : -1));
    return { items: filtered };
  }

  async uploadAttachments(serviceOrderId: string, type: any, files: any[]) {
    const tenantId = this.getTenantId();
    await this.assertServiceOrderExists(serviceOrderId, tenantId);

    const t = this.parseType(type);
    const dir = this.dirForType(tenantId, serviceOrderId, t);
    await fs.mkdir(dir, { recursive: true });

    // Validación por tipo
    for (const file of files ?? []) {
      const mime = String(file?.mimetype || '');
      if (t === 'IMAGE' && !mime.startsWith('image/')) {
        await this.safeUnlink(file?.path);
        throw new BadRequestException('Only images allowed');
      }
      if (t === 'VIDEO' && !mime.startsWith('video/')) {
        await this.safeUnlink(file?.path);
        throw new BadRequestException('Only videos allowed');
      }
      // DOCUMENT: permitimos cualquier mimetype
    }

    for (const file of files ?? []) {
      // diskStorage: multer guarda en file.path
      const diskPath = String(file?.path || '');
      if (diskPath) {
        const extRaw = path.extname(String(file?.originalname || '')).toLowerCase();
        const ext = extRaw && extRaw.length <= 10 ? extRaw : path.extname(diskPath);
        const filename = `${Date.now()}-${randomUUID()}${ext || ''}`;
        const target = path.join(dir, filename);

        try {
          await fs.rename(diskPath, target);
        } catch (e: any) {
          // fallback: copy + unlink
          const buf = await fs.readFile(diskPath);
          await fs.writeFile(target, buf);
          await this.safeUnlink(diskPath);
        }
        continue;
      }

      // fallback: memoryStorage (compat)
      const buf: Buffer = file?.buffer;
      if (!buf?.length) continue;

      const extRaw = path.extname(String(file?.originalname || '')).toLowerCase();
      const ext = extRaw && extRaw.length <= 10 ? extRaw : '';
      const filename = `${Date.now()}-${randomUUID()}${ext}`;
      const fp = path.join(dir, filename);
      await fs.writeFile(fp, buf);
    }

    return this.listAttachments(serviceOrderId, t);
  }

  private async safeUnlink(p?: string) {
    if (!p) return;
    try {
      await fs.unlink(p);
    } catch {}
  }


  async getAttachmentPath(serviceOrderId: string, type: any, filename: string) {
    const tenantId = this.getTenantId();
    await this.assertServiceOrderExists(serviceOrderId, tenantId);

    const t = this.parseType(type);

    // Prevent path traversal
    const safe = path.basename(filename);
    if (safe !== filename) throw new BadRequestException('Invalid filename');

    const fp = path.join(this.dirForType(tenantId, serviceOrderId, t), safe);
    try {
      const st = await fs.stat(fp);
      if (!st.isFile()) throw new Error('not-file');
    } catch {
      throw new NotFoundException('Attachment not found');
    }
    return fp;
  }

  async deleteAttachment(serviceOrderId: string, type: any, filename: string) {
    const tenantId = this.getTenantId();
    await this.assertServiceOrderExists(serviceOrderId, tenantId);

    const t = this.parseType(type);
    const safe = path.basename(filename);
    if (safe !== filename) throw new BadRequestException('Invalid filename');

    const fp = path.join(this.dirForType(tenantId, serviceOrderId, t), safe);
    try {
      await fs.unlink(fp);
    } catch (e: any) {
      if (e?.code === 'ENOENT') throw new NotFoundException('Attachment not found');
      throw e;
    }
    return { ok: true };
  }

  // ---------------------------
  // Back-compat: Imágenes (endpoints antiguos)
  // ---------------------------
  async listImages(serviceOrderId: string) {
    return this.listAttachments(serviceOrderId, 'IMAGE');
  }

  async uploadImages(serviceOrderId: string, files: any[]) {
    return this.uploadAttachments(serviceOrderId, 'IMAGE', files);
  }

  async getImagePath(serviceOrderId: string, filename: string) {
    return this.getAttachmentPath(serviceOrderId, 'IMAGE', filename);
  }

  async deleteImage(serviceOrderId: string, filename: string) {
    return this.deleteAttachment(serviceOrderId, 'IMAGE', filename);
  }

}
