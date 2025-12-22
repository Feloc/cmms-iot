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

  // valida existencia (tenant + kind)
  const so0 = await this.prisma.workOrder.findFirst({ where: { id, tenantId, kind: 'SERVICE_ORDER' } });
  if (!so0) throw new NotFoundException('Service order not found');

  // dueDate:
  // - undefined => no cambia
  // - null => desprograma (dueDate = null)
  // - string/Date => programa
  const dueDateData =
    dto.dueDate === undefined ? undefined : dto.dueDate === null ? null : this.coerceDate(dto.dueDate);

  // technicianId:
  // - undefined => no cambia
  // - ""/null => quita asignación (REMOVED)
  // - id => reasigna
  const technicianId = dto.technicianId === undefined ? undefined : (dto.technicianId ?? '').trim();

  await this.prisma.$transaction(async (tx) => {
    if (dueDateData !== undefined) {
      await tx.workOrder.update({ where: { id }, data: { dueDate: dueDateData as any } });
    }

    if (technicianId !== undefined) {
      // remueve assignment activo anterior
      await tx.wOAssignment.updateMany({
        where: { tenantId, workOrderId: id, role: 'TECHNICIAN', state: 'ACTIVE' },
        data: { state: 'REMOVED' },
      });

      // si viene id, valida usuario y crea assignment nuevo
      if (technicianId) {
        const tech = await tx.user.findFirst({ where: { id: technicianId, tenantId } });
        if (!tech) throw new BadRequestException('Technician not found for this tenant');

        await tx.wOAssignment.create({
          data: {
            tenantId,
            workOrderId: id,
            userId: technicianId,
            role: 'TECHNICIAN',
            state: 'ACTIVE',
          },
        });
      }
    }
  });

  // Re-consulta y enriquece como en getOne(): assignments + pmPlan + asset (por assetCode)
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
}
