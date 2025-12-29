import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
    };

    if (q.status) where.status = q.status as any;
    if (q.type) where.serviceOrderType = q.type as any;

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
    if (q.technicianId) {
      where.assignments = {
        some: {
          tenantId,
          state: 'ACTIVE',
          role: 'TECHNICIAN',
          userId: q.technicianId,
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
    await this.assertSo(id);
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.status !== undefined ? { status: dto.status as any } : {}),
        ...(dto.serviceOrderType !== undefined ? { serviceOrderType: dto.serviceOrderType as any } : {}),
        ...(dto.pmPlanId !== undefined ? { pmPlanId: dto.pmPlanId } : {}),
        ...(dto.hasIssue !== undefined ? { hasIssue: dto.hasIssue } : {}),
      },
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
    await this.assertSo(id);
    return this.prisma.workOrder.update({
      where: { id },
      data: {
        takenAt: this.coerceDate(dto.takenAt ?? undefined),
        arrivedAt: this.coerceDate(dto.arrivedAt ?? undefined),
        checkInAt: this.coerceDate(dto.checkInAt ?? undefined),
        activityStartedAt: this.coerceDate(dto.activityStartedAt ?? undefined),
        activityFinishedAt: this.coerceDate(dto.activityFinishedAt ?? undefined),
        deliveredAt: this.coerceDate(dto.deliveredAt ?? undefined),
      } as any,
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
// Imágenes / Galería (filesystem)
// ---------------------------
private uploadsRoot(): string {
  // En Docker, por defecto cae en /app/uploads. En local, en <repo>/uploads
  return process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
}

private imagesDir(tenantId: string, serviceOrderId: string): string {
  return path.join(this.uploadsRoot(), 'service-orders', tenantId, serviceOrderId);
}

private async assertServiceOrderExists(serviceOrderId: string, tenantId: string) {
  const so = await this.prisma.workOrder.findFirst({
    where: { id: serviceOrderId, tenantId },
    select: { id: true },
  });
  if (!so) throw new NotFoundException('Service order not found');
  return so;
}

async listImages(serviceOrderId: string) {
  const tenantId = this.getTenantId();
  await this.assertServiceOrderExists(serviceOrderId, tenantId);

  const dir = this.imagesDir(tenantId, serviceOrderId);
  let files: string[] = [];
  try {
    files = await fs.readdir(dir);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return { items: [] };
    throw e;
  }

  const items: Array<{ filename: string; size: number; updatedAt: string }> = [];
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      const st = await fs.stat(fp);
      if (!st.isFile()) continue;
      items.push({ filename: f, size: st.size, updatedAt: st.mtime.toISOString() });
    } catch {
      // ignore
    }
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)); // newest first
  return { items };
}

async uploadImages(serviceOrderId: string, files: Array<any>) {
  const tenantId = this.getTenantId();
  await this.assertServiceOrderExists(serviceOrderId, tenantId);

  if (!files || files.length === 0) {
    throw new BadRequestException('No files uploaded');
  }

  const dir = this.imagesDir(tenantId, serviceOrderId);
  await fs.mkdir(dir, { recursive: true });

  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
  };

  for (const file of files) {
    const mimetype: string = file?.mimetype || '';
    if (!mimetype.startsWith('image/')) continue;

    const buf: Buffer | undefined = file?.buffer;
    if (!buf || buf.length === 0) continue;

    let ext = (file?.originalname ? path.extname(file.originalname) : '').toLowerCase();
    if (!ext || ext.length > 10) ext = '';
    if (!ext) ext = mimeToExt[mimetype] || '.img';

    const filename = `${Date.now()}-${randomUUID()}${ext}`;
    const fp = path.join(dir, filename);
    await fs.writeFile(fp, buf);
  }

  return this.listImages(serviceOrderId);
}

async getImagePath(serviceOrderId: string, filename: string) {
  const tenantId = this.getTenantId();
  await this.assertServiceOrderExists(serviceOrderId, tenantId);

  // Prevent path traversal
  const safe = path.basename(filename);
  if (safe !== filename) throw new BadRequestException('Invalid filename');

  const fp = path.join(this.imagesDir(tenantId, serviceOrderId), safe);
  try {
    const st = await fs.stat(fp);
    if (!st.isFile()) throw new Error('not-file');
  } catch {
    throw new NotFoundException('Image not found');
  }
  return fp;
}

}
