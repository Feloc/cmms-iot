import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { ListServiceOrdersQuery } from './dto/list-service-orders.query';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ScheduleServiceOrderDto } from './dto/schedule-service-order.dto';
import { ServiceOrderTimestampsDto } from './dto/timestamps.dto';
import { ServiceOrderFormDataDto } from './dto/form-data.dto';
import { ServiceOrderSignaturesDto } from './dto/signatures.dto';
import { AddServiceOrderPartDto } from './dto/parts.dto';
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

    // Rango por fecha programada (dueDate)
    const start = this.coerceDate(q.start ?? undefined);
    const end = this.coerceDate(q.end ?? undefined);
    if (start || end) {
      where.dueDate = {};
      if (start) (where.dueDate as any).gte = start;
      if (end) (where.dueDate as any).lte = end;
    }

    // Filtro por técnico: buscamos assignments ACTIVAS de rol TECHNICIAN
const techIds = normalizeQueryArray((q as any).technicianId);
if (techIds.length === 1) {
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

  async get(id: string) {
    const tenantId = this.getTenantId();
    const so = await this.prisma.workOrder.findFirst({
      where: { id, tenantId, kind: 'SERVICE_ORDER' },
      include: {
        assignments: { where: { state: 'ACTIVE' }, include: { user: true } },
        pmPlan: true,
        serviceOrderParts: { include: { inventoryItem: true } },
      },
    });
    if (!so) throw new NotFoundException('Service order not found');

    const asset = await this.prisma.asset.findFirst({
      where: { tenantId, code: so.assetCode },
      select: { code: true, customer: true, name: true, brand: true, model: true, serialNumber: true },
    });

    return { ...so, asset: asset ?? null };
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
  // Solo campos "administrativos" requieren ADMIN.
  // Campos operativos (ej: hasIssue) pueden ser modificados por cualquier rol.
  const adminOnlyKeys = ['assetCode','title','description','status','serviceOrderType','pmPlanId','durationMin'] as const;
  const wantsAdminChange = adminOnlyKeys.some((k) => (dto as any)[k] !== undefined);
  if (wantsAdminChange) await this.assertAdmin();
  const { tenantId } = await this.assertSo(id);

  // Si cambia el activo, valida que exista en el tenant.
  if (dto.assetCode !== undefined) {
    const code = String(dto.assetCode || '').trim();
    if (!code) throw new BadRequestException('assetCode is required');
    const asset = await this.prisma.asset.findFirst({ where: { tenantId, code }, select: { code: true } });
    if (!asset) throw new BadRequestException('Asset not found for given assetCode');
  }

  return this.prisma.workOrder.update({
    where: { id },
    data: {
      ...(dto.assetCode !== undefined ? { assetCode: String(dto.assetCode).trim() } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.status !== undefined ? { status: dto.status as any } : {}),
      ...(dto.serviceOrderType !== undefined ? { serviceOrderType: dto.serviceOrderType as any } : {}),
      ...(dto.pmPlanId !== undefined ? { pmPlanId: dto.pmPlanId } : {}),
      ...(dto.hasIssue !== undefined ? { hasIssue: dto.hasIssue } : {}),
      ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
    } as any,
  });
}
async schedule(id: string, dto: ScheduleServiceOrderDto) {
  const tenantId = this.getTenantId();

  return this.prisma.$transaction(async (tx) => {
    const wo = await tx.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
    if (!wo) throw new NotFoundException('Service order not found');

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

    if (hasTechInstruction) {
      const technicianId = shouldClearTechWhenUnscheduling
        ? ''
        : dto.technicianId
          ? String(dto.technicianId).trim()
          : '';

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

    return updated;
  });
}
async setTimestamps(id: string, dto: ServiceOrderTimestampsDto) {
  const { tenantId } = await this.assertSo(id);

  const current = await this.prisma.workOrder.findFirst({
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

  return this.prisma.workOrder.update({
    where: { id },
    data,
  });
}


  async setFormData(id: string, dto: ServiceOrderFormDataDto) {
    await this.assertSo(id);
    return this.prisma.workOrder.update({
      where: { id },
      data: { formData: dto.formData } as any,
    });
  }

  async setSignatures(id: string, dto: ServiceOrderSignaturesDto) {
    await this.assertSo(id);
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.technicianSignature !== undefined ? { technicianSignature: dto.technicianSignature } : {}),
        ...(dto.receiverSignature !== undefined ? { receiverSignature: dto.receiverSignature } : {}),
      } as any,
    });
  }

  async addPart(id: string, dto: AddServiceOrderPartDto) {
    const tenantId = this.getTenantId();
    const so = await this.prisma.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
    if (!so) throw new NotFoundException('Service order not found');

    if (!dto.inventoryItemId && !dto.freeText) throw new BadRequestException('inventoryItemId or freeText is required');

    return this.prisma.serviceOrderPart.create({
      data: {
        tenantId,
        workOrderId: id,
        inventoryItemId: dto.inventoryItemId ?? undefined,
        freeText: dto.freeText ?? undefined,
        qty: dto.qty ?? 1,
        notes: dto.notes,
      },
      include: { inventoryItem: true },
    });
  }

  async removePart(id: string, partId: string) {
    const tenantId = this.getTenantId();
    const part = await this.prisma.serviceOrderPart.findFirst({ where: { id: partId, tenantId, workOrderId: id } });
    if (!part) throw new NotFoundException('Part not found');
    await this.prisma.serviceOrderPart.delete({ where: { id: partId } });
    return { ok: true };
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
