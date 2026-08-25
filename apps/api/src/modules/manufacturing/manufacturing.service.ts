import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import {
  CreateManufacturingOrderDto,
  ManufacturingReasonDto,
  ReplaceManufacturingMembersDto,
  UpdateManufacturedUnitDto,
  UpdateManufacturingOrderDto,
  type ManufacturingMemberInput,
} from './dto/manufacturing.dto';
import { formatManufacturingOrderNumber, resumableManufacturingStatus } from './manufacturing.domain';

const ORDER_STATUSES = new Set(['DRAFT', 'ENGINEERING', 'RELEASED', 'ON_HOLD', 'CANCELED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const MEMBER_FUNCTIONS = new Set(['RESPONSIBLE', 'ENGINEERING', 'REVIEWER', 'OBSERVER']);
const UNIT_STATUSES = new Set(['PLANNED', 'CANCELED']);

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingService {
  constructor(private readonly prisma: PrismaService) {}

  private context() {
    const store = tenantStorage.getStore();
    if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    return { tenantId: store.tenantId, userId: store.userId };
  }

  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return user;
  }

  private async requireAdmin(tx: any, tenantId: string, userId: string) {
    const actor = await this.actor(tx, tenantId, userId);
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Se requiere rol ADMIN');
    return actor;
  }

  private text(value: unknown, field: string, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw new BadRequestException(`${field} es obligatorio`);
    return normalized || null;
  }

  private date(value: unknown, field: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value as any);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} no es una fecha válida`);
    return parsed;
  }

  private quantity(value: unknown) {
    const quantity = Math.round(Number(value ?? 1));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new BadRequestException('quantity debe ser un entero entre 1 y 1000');
    }
    return quantity;
  }

  private priority(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const priority = String(value).toUpperCase();
    if (!PRIORITIES.has(priority)) throw new BadRequestException('Prioridad inválida');
    return priority;
  }

  private dates(dto: { requestedDeliveryAt?: unknown; plannedStartAt?: unknown; plannedEndAt?: unknown }) {
    const requestedDeliveryAt = this.date(dto.requestedDeliveryAt, 'requestedDeliveryAt');
    const plannedStartAt = this.date(dto.plannedStartAt, 'plannedStartAt');
    const plannedEndAt = this.date(dto.plannedEndAt, 'plannedEndAt');
    if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt) {
      throw new BadRequestException('plannedEndAt no puede ser anterior a plannedStartAt');
    }
    return { requestedDeliveryAt, plannedStartAt, plannedEndAt };
  }

  private async requireTenantUser(tx: any, tenantId: string, userId: unknown) {
    const id = String(userId || '').trim();
    if (!id) throw new BadRequestException('responsibleUserId es obligatorio');
    const user = await tx.user.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new BadRequestException('El responsable no pertenece al tenant actual');
    return user;
  }

  private normalizeMembers(members: ManufacturingMemberInput[] | undefined, responsibleUserId: string) {
    if (members !== undefined && !Array.isArray(members)) throw new BadRequestException('members debe ser una lista');
    const normalized = (members || []).map((member, index) => {
      const userId = String(member?.userId || '').trim();
      const fn = String(member?.function || '').trim().toUpperCase();
      if (!userId || !MEMBER_FUNCTIONS.has(fn)) throw new BadRequestException(`Participante ${index + 1} inválido`);
      return { userId, function: fn };
    });
    normalized.push({ userId: responsibleUserId, function: 'RESPONSIBLE' });
    const unique = new Map(normalized.map((member) => [`${member.userId}:${member.function}`, member]));
    if (unique.size > 100) throw new BadRequestException('La orden no puede tener más de 100 asignaciones');
    return Array.from(unique.values());
  }

  private async validateMemberUsers(tx: any, tenantId: string, members: Array<{ userId: string; function: string }>) {
    const ids = Array.from(new Set(members.map((member) => member.userId)));
    const users = await tx.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true } });
    if (users.length !== ids.length) throw new BadRequestException('Uno o más participantes no pertenecen al tenant actual');
  }

  private orderSnapshot(order: any) {
    return {
      number: order.number,
      status: order.status,
      version: order.version,
      projectName: order.projectName,
      productCode: order.productCode,
      productName: order.productName,
      model: order.model,
      quantity: order.quantity,
      priority: order.priority,
      customerName: order.customerName,
      customerReference: order.customerReference,
      commercialReference: order.commercialReference,
      destination: order.destination,
      description: order.description,
      requestedDeliveryAt: order.requestedDeliveryAt,
      plannedStartAt: order.plannedStartAt,
      plannedEndAt: order.plannedEndAt,
      responsibleUserId: order.responsibleUserId,
    };
  }

  private async audit(tx: any, input: {
    tenantId: string;
    orderId: string;
    entityType?: string;
    entityId?: string;
    action: string;
    summary: string;
    actor: Actor;
    beforeData?: unknown;
    afterData?: unknown;
    metadata?: unknown;
  }) {
    return tx.manufacturingAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        manufacturingOrderId: input.orderId,
        entityType: input.entityType || 'ManufacturingOrder',
        entityId: input.entityId || input.orderId,
        action: input.action,
        summary: input.summary,
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        beforeData: input.beforeData === undefined ? undefined : JSON.parse(JSON.stringify(input.beforeData)),
        afterData: input.afterData === undefined ? undefined : JSON.parse(JSON.stringify(input.afterData)),
        metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata)),
      },
    });
  }

  private visibilityWhere(actor: Actor, userId: string) {
    if (actor.role !== 'TECH') return {};
    return {
      OR: [
        { responsibleUserId: userId },
        { members: { some: { userId } } },
      ],
    };
  }

  private async assertVisible(tx: any, id: string, tenantId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id, tenantId, ...this.visibilityWhere(actor, actor.id) },
    });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    return order;
  }

  private includeDetail() {
    return {
      responsibleUser: { select: { id: true, name: true, email: true, role: true } },
      createdByUser: { select: { id: true, name: true } },
      units: { orderBy: { unitNumber: 'asc' } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: [{ function: 'asc' }, { createdAt: 'asc' }],
      },
      engineeringDocuments: {
        where: { active: true },
        select: { revisions: { select: { sequence: true, status: true } } },
      },
      boms: {
        select: { revisions: { select: { sequence: true, status: true, _count: { select: { lines: true } } } } },
      },
      engineeringReleases: { select: { releaseCode: true, sequence: true, status: true, releasedAt: true } },
      _count: { select: { auditEvents: true } },
    };
  }

  private serialize(order: any) {
    const documents = order.engineeringDocuments || [];
    const approvedCount = documents.filter((document: any) => document.revisions.some((revision: any) => ['APPROVED', 'RELEASED'].includes(revision.status))).length;
    const releasedCount = documents.filter((document: any) => document.revisions.some((revision: any) => revision.status === 'RELEASED')).length;
    const boms = order.boms || [];
    const bomApprovedCount = boms.filter((bom: any) => bom.revisions.some((revision: any) => ['APPROVED', 'RELEASED'].includes(revision.status))).length;
    const bomReleasedCount = boms.filter((bom: any) => bom.revisions.some((revision: any) => revision.status === 'RELEASED')).length;
    const releases = order.engineeringReleases || [];
    const currentRelease = [...releases].filter((release: any) => release.status === 'RELEASED').sort((a: any, b: any) => Number(b.sequence) - Number(a.sequence))[0];
    const documentChanges = documents.some((document: any) => {
      const latest = Math.max(0, ...document.revisions.map((revision: any) => Number(revision.sequence)));
      const released = Math.max(0, ...document.revisions.filter((revision: any) => revision.status === 'RELEASED').map((revision: any) => Number(revision.sequence)));
      return latest > released;
    });
    const bomChanges = boms.some((bom: any) => {
      const latest = Math.max(0, ...bom.revisions.map((revision: any) => Number(revision.sequence)));
      const released = Math.max(0, ...bom.revisions.filter((revision: any) => revision.status === 'RELEASED').map((revision: any) => Number(revision.sequence)));
      return latest > released;
    });
    return {
      ...order,
      metrics: {
        unitCount: Number(order._count?.units ?? order.units?.length ?? order.quantity ?? 0),
        memberCount: Number(order._count?.members ?? order.members?.length ?? 0),
        engineeringDocumentCount: documents.length,
        engineeringApprovedCount: approvedCount,
        engineeringReleasedCount: releasedCount,
        bomCount: boms.length,
        bomApprovedCount,
        bomReleasedCount,
        bomLineCount: boms.reduce((sum: number, bom: any) => {
          const latest = [...bom.revisions].sort((a: any, b: any) => Number(b.sequence) - Number(a.sequence))[0];
          return sum + Number(latest?._count?.lines || 0);
        }, 0),
        engineeringReleaseCount: releases.filter((release: any) => release.status !== 'DRAFT' && release.status !== 'CANCELED').length,
        currentEngineeringReleaseCode: currentRelease?.releaseCode || null,
        pendingEngineeringChanges: documentChanges || bomChanges,
      },
    };
  }

  async listOrders(query: Record<string, string | undefined>) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const page = Math.max(1, Number(query.page || 1) || 1);
    const size = Math.min(100, Math.max(1, Number(query.size || 25) || 25));
    const where: any = { tenantId, ...this.visibilityWhere(actor, userId) };

    const q = String(query.q || '').trim();
    if (q) {
      const search = [
        { number: { contains: q, mode: 'insensitive' } },
        { projectName: { contains: q, mode: 'insensitive' } },
        { productCode: { contains: q, mode: 'insensitive' } },
        { productName: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerReference: { contains: q, mode: 'insensitive' } },
      ];
      if (where.OR) where.AND = [{ OR: where.OR }, { OR: search }], delete where.OR;
      else where.OR = search;
    }
    if (query.status) {
      const status = query.status.toUpperCase();
      if (!ORDER_STATUSES.has(status)) throw new BadRequestException('Estado inválido');
      where.status = status;
    }
    if (query.priority) {
      const priority = query.priority.toUpperCase();
      if (!PRIORITIES.has(priority)) throw new BadRequestException('Prioridad inválida');
      where.priority = priority;
    }
    if (query.responsibleUserId) where.responsibleUserId = query.responsibleUserId;
    if (query.engineeringPending === 'true') where.status = { not: 'RELEASED' };
    if (query.engineeringPending === 'false') where.status = 'RELEASED';
    if (query.deliveryFrom || query.deliveryTo) {
      where.requestedDeliveryAt = {};
      if (query.deliveryFrom) where.requestedDeliveryAt.gte = this.date(query.deliveryFrom, 'deliveryFrom');
      if (query.deliveryTo) where.requestedDeliveryAt.lte = this.date(query.deliveryTo, 'deliveryTo');
    }

    const sort = String(query.sort || 'updatedAt:desc');
    const [sortField, sortDirection] = sort.split(':');
    const allowedSort = new Set(['updatedAt', 'requestedDeliveryAt', 'number', 'createdAt']);
    const orderBy = { [allowedSort.has(sortField) ? sortField : 'updatedAt']: sortDirection === 'asc' ? 'asc' : 'desc' };

    const prisma = this.prisma as any;
    const [items, total] = await prisma.$transaction([
      prisma.manufacturingOrder.findMany({
        where,
        skip: (page - 1) * size,
        take: size,
        orderBy,
        include: {
          responsibleUser: { select: { id: true, name: true } },
          engineeringDocuments: {
            where: { active: true },
            select: { revisions: { select: { sequence: true, status: true } } },
          },
          boms: {
            select: { revisions: { select: { sequence: true, status: true, _count: { select: { lines: true } } } } },
          },
          engineeringReleases: { select: { releaseCode: true, sequence: true, status: true, releasedAt: true } },
          _count: { select: { units: true, members: true } },
        },
      }),
      prisma.manufacturingOrder.count({ where }),
    ]);
    return { items: items.map((item: any) => this.serialize(item)), total, page, size, pages: Math.ceil(total / size) };
  }

  async createOrder(dto: CreateManufacturingOrderDto) {
    const { tenantId, userId } = this.context();
    const projectName = this.text(dto?.projectName, 'projectName', true)!;
    const productName = this.text(dto?.productName, 'productName', true)!;
    const quantity = this.quantity(dto?.quantity);
    const dates = this.dates(dto || {});

    const created = await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const responsible = await this.requireTenantUser(tx, tenantId, dto?.responsibleUserId);
      const members = this.normalizeMembers(dto?.members, responsible.id);
      await this.validateMemberUsers(tx, tenantId, members);

      const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date()));
      const sequence = await tx.manufacturingNumberSequence.upsert({
        where: { tenantId_year: { tenantId, year } },
        create: { tenantId, year, lastValue: 1 },
        update: { lastValue: { increment: 1 } },
      });
      const number = formatManufacturingOrderNumber(year, sequence.lastValue);
      const order = await tx.manufacturingOrder.create({
        data: {
          tenantId,
          number,
          projectName,
          productCode: this.text(dto.productCode, 'productCode'),
          productName,
          model: this.text(dto.model, 'model'),
          quantity,
          priority: this.priority(dto.priority),
          customerName: this.text(dto.customerName, 'customerName'),
          customerReference: this.text(dto.customerReference, 'customerReference'),
          commercialReference: this.text(dto.commercialReference, 'commercialReference'),
          destination: this.text(dto.destination, 'destination'),
          description: this.text(dto.description, 'description'),
          ...dates,
          responsibleUserId: responsible.id,
          createdByUserId: actor.id,
          units: { create: Array.from({ length: quantity }, (_, index) => ({ tenantId, unitNumber: index + 1 })) },
          members: { create: members.map((member) => ({ tenantId, userId: member.userId, function: member.function })) },
        },
      });
      await this.audit(tx, {
        tenantId, orderId: order.id, action: 'ORDER_CREATED',
        summary: `Orden ${number} creada`, actor, afterData: this.orderSnapshot(order),
      });
      return order;
    });
    return this.getOrder(created.id);
  }

  async getOrder(id: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.assertVisible(this.prisma as any, id, tenantId, actor);
    const order = await (this.prisma as any).manufacturingOrder.findFirst({
      where: { id, tenantId },
      include: this.includeDetail(),
    });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    return this.serialize(order);
  }

  async updateOrder(id: string, dto: UpdateManufacturingOrderDto) {
    const { tenantId, userId } = this.context();
    const version = Number(dto?.version);
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('version es obligatoria');

    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const current = await tx.manufacturingOrder.findFirst({
        where: { id, tenantId }, include: { units: { orderBy: { unitNumber: 'asc' } } },
      });
      if (!current) throw new NotFoundException('Orden de manufactura no encontrada');
      if (current.status === 'CANCELED') throw new ConflictException('No se puede modificar una orden cancelada');
      if (current.version !== version) throw new ConflictException('La orden cambió desde que fue abierta; actualiza la página');

      const data: any = {};
      const requiredTextFields = ['projectName', 'productName'] as const;
      for (const field of requiredTextFields) if (dto[field] !== undefined) data[field] = this.text(dto[field], field, true);
      const optionalTextFields = ['productCode', 'model', 'customerName', 'customerReference', 'commercialReference', 'destination', 'description'] as const;
      for (const field of optionalTextFields) if (dto[field] !== undefined) data[field] = this.text(dto[field], field);
      if (dto.priority !== undefined) data.priority = this.priority(dto.priority);
      const dateFields = ['requestedDeliveryAt', 'plannedStartAt', 'plannedEndAt'] as const;
      for (const field of dateFields) if (dto[field] !== undefined) data[field] = this.date(dto[field], field);
      const nextStart = data.plannedStartAt === undefined ? current.plannedStartAt : data.plannedStartAt;
      const nextEnd = data.plannedEndAt === undefined ? current.plannedEndAt : data.plannedEndAt;
      if (nextStart && nextEnd && nextEnd < nextStart) throw new BadRequestException('plannedEndAt no puede ser anterior a plannedStartAt');

      if (dto.responsibleUserId !== undefined && dto.responsibleUserId !== current.responsibleUserId) {
        const responsible = await this.requireTenantUser(tx, tenantId, dto.responsibleUserId);
        data.responsibleUserId = responsible.id;
      }

      const nextQuantity = dto.quantity === undefined ? current.quantity : this.quantity(dto.quantity);
      if (nextQuantity < current.quantity) {
        const removable = current.units.filter((unit: any) => unit.unitNumber > nextQuantity);
        if (removable.some((unit: any) => unit.serialNumber || unit.internalCode || unit.assetId)) {
          throw new ConflictException('No se puede reducir la cantidad porque las últimas unidades ya tienen información');
        }
        await tx.manufacturedUnit.deleteMany({ where: { tenantId, manufacturingOrderId: id, unitNumber: { gt: nextQuantity } } });
      } else if (nextQuantity > current.quantity) {
        await tx.manufacturedUnit.createMany({
          data: Array.from({ length: nextQuantity - current.quantity }, (_, index) => ({
            tenantId, manufacturingOrderId: id, unitNumber: current.quantity + index + 1,
          })),
        });
      }
      if (nextQuantity !== current.quantity) data.quantity = nextQuantity;

      if (!Object.keys(data).length) throw new BadRequestException('No hay cambios para aplicar');
      const updated = await tx.manufacturingOrder.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      if (data.responsibleUserId) {
        await tx.manufacturingOrderMember.upsert({
          where: { manufacturingOrderId_userId_function: { manufacturingOrderId: id, userId: data.responsibleUserId, function: 'RESPONSIBLE' } },
          create: { tenantId, manufacturingOrderId: id, userId: data.responsibleUserId, function: 'RESPONSIBLE' },
          update: {},
        });
        await tx.manufacturingOrderMember.deleteMany({
          where: { tenantId, manufacturingOrderId: id, function: 'RESPONSIBLE', userId: { not: data.responsibleUserId } },
        });
      }
      await this.audit(tx, {
        tenantId, orderId: id, action: 'ORDER_UPDATED', summary: `Orden ${current.number} actualizada`, actor,
        beforeData: this.orderSnapshot(current), afterData: this.orderSnapshot(updated),
      });
    });
    return this.getOrder(id);
  }

  async holdOrder(id: string, dto: ManufacturingReasonDto) {
    return this.changeStatus(id, 'hold', dto?.reason);
  }

  async resumeOrder(id: string) {
    return this.changeStatus(id, 'resume');
  }

  async cancelOrder(id: string, dto: ManufacturingReasonDto) {
    return this.changeStatus(id, 'cancel', dto?.reason);
  }

  private async changeStatus(id: string, action: 'hold' | 'resume' | 'cancel', rawReason?: string) {
    const { tenantId, userId } = this.context();
    const reason = String(rawReason || '').trim();
    if (action !== 'resume' && !reason) throw new BadRequestException('Debes indicar el motivo');
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const current = await tx.manufacturingOrder.findFirst({ where: { id, tenantId } });
      if (!current) throw new NotFoundException('Orden de manufactura no encontrada');
      if (current.status === 'CANCELED') throw new ConflictException('La orden está cancelada');

      let data: any;
      let auditAction: string;
      let summary: string;
      if (action === 'hold') {
        if (current.status === 'ON_HOLD') throw new ConflictException('La orden ya está en pausa');
        data = { status: 'ON_HOLD', statusBeforeHold: current.status, holdReason: reason, version: { increment: 1 } };
        auditAction = 'ORDER_HELD';
        summary = `Orden ${current.number} pausada`;
      } else if (action === 'resume') {
        if (current.status !== 'ON_HOLD') throw new ConflictException('La orden no está en pausa');
        data = { status: resumableManufacturingStatus(current.statusBeforeHold), statusBeforeHold: null, holdReason: null, version: { increment: 1 } };
        auditAction = 'ORDER_RESUMED';
        summary = `Orden ${current.number} reanudada`;
      } else {
        const openReservations = await tx.manufacturingStockReservation.count({
          where: { tenantId, supplyRequirement: { supplyPlan: { manufacturingOrderId: id } }, status: { in: ['ACTIVE', 'PARTIAL'] } },
        });
        if (openReservations) throw new ConflictException('Libera o entrega las reservas de inventario pendientes antes de cancelar la orden');
        const openRequests = await tx.manufacturingSupplyRequest.count({ where: { tenantId, supplyRequirement: { supplyPlan: { manufacturingOrderId: id } }, status: { notIn: ['COMPLETED', 'CANCELED'] } } });
        if (openRequests) throw new ConflictException('Completa o cancela las solicitudes de abastecimiento pendientes antes de cancelar la orden');
        const openInspections = await tx.manufacturingSupplyDelivery.count({ where: { tenantId, supplyRequest: { supplyRequirement: { supplyPlan: { manufacturingOrderId: id } } }, inspectionStatus: { not: 'CLOSED' } } });
        if (openInspections) throw new ConflictException('Resuelve las inspecciones y cuarentenas pendientes antes de cancelar la orden');
        const activeKits = await tx.manufacturingKit.count({ where: { tenantId, manufacturingOrderId: id, status: { not: 'CANCELED' } } });
        if (activeKits) throw new ConflictException('Cancela los kits de materiales antes de cancelar la orden');
        data = { status: 'CANCELED', statusBeforeHold: null, canceledReason: reason, holdReason: null, version: { increment: 1 } };
        auditAction = 'ORDER_CANCELED';
        summary = `Orden ${current.number} cancelada`;
      }
      const updated = await tx.manufacturingOrder.update({ where: { id }, data });
      await this.audit(tx, {
        tenantId, orderId: id, action: auditAction, summary, actor,
        beforeData: { status: current.status, holdReason: current.holdReason },
        afterData: { status: updated.status, holdReason: updated.holdReason, canceledReason: updated.canceledReason },
        metadata: reason ? { reason } : undefined,
      });
    });
    return this.getOrder(id);
  }

  async listUnits(id: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.assertVisible(this.prisma as any, id, tenantId, actor);
    return (this.prisma as any).manufacturedUnit.findMany({
      where: { tenantId, manufacturingOrderId: id }, orderBy: { unitNumber: 'asc' },
    });
  }

  async updateUnit(id: string, unitId: string, dto: UpdateManufacturedUnitDto) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const order = await tx.manufacturingOrder.findFirst({ where: { id, tenantId } });
      if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
      if (order.status === 'CANCELED') throw new ConflictException('No se puede modificar una orden cancelada');
      const unit = await tx.manufacturedUnit.findFirst({ where: { id: unitId, tenantId, manufacturingOrderId: id } });
      if (!unit) throw new NotFoundException('Unidad fabricada no encontrada');
      const data: any = {};
      if (dto.serialNumber !== undefined) data.serialNumber = this.text(dto.serialNumber, 'serialNumber');
      if (dto.internalCode !== undefined) data.internalCode = this.text(dto.internalCode, 'internalCode');
      if (dto.status !== undefined) {
        const status = String(dto.status).toUpperCase();
        if (!UNIT_STATUSES.has(status)) throw new BadRequestException('Estado de unidad inválido');
        if (status === 'CANCELED') {
          const activeKit = await tx.manufacturingKit.count({ where: { tenantId, manufacturedUnitId: unitId, status: { not: 'CANCELED' } } });
          if (activeKit) throw new ConflictException('Cancela el kit de materiales antes de cancelar la unidad');
        }
        data.status = status;
      }
      if (!Object.keys(data).length) throw new BadRequestException('No hay cambios para aplicar');
      try {
        const updated = await tx.manufacturedUnit.update({ where: { id: unitId }, data });
        await tx.manufacturingOrder.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.audit(tx, {
          tenantId, orderId: id, entityType: 'ManufacturedUnit', entityId: unitId,
          action: 'UNIT_UPDATED', summary: `Unidad ${unit.unitNumber} actualizada`, actor,
          beforeData: unit, afterData: updated,
        });
      } catch (error: any) {
        if (error?.code === 'P2002') throw new ConflictException('El número de serie ya está registrado');
        throw error;
      }
    });
    return this.getOrder(id);
  }

  async replaceMembers(id: string, dto: ReplaceManufacturingMembersDto) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.requireAdmin(tx, tenantId, userId);
      const order = await tx.manufacturingOrder.findFirst({
        where: { id, tenantId }, include: { members: true },
      });
      if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
      if (order.status === 'CANCELED') throw new ConflictException('No se puede modificar una orden cancelada');
      const members = this.normalizeMembers(dto?.members, order.responsibleUserId);
      await this.validateMemberUsers(tx, tenantId, members);
      await tx.manufacturingOrderMember.deleteMany({ where: { tenantId, manufacturingOrderId: id } });
      await tx.manufacturingOrderMember.createMany({
        data: members.map((member) => ({ tenantId, manufacturingOrderId: id, userId: member.userId, function: member.function })),
      });
      await tx.manufacturingOrder.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit(tx, {
        tenantId, orderId: id, action: 'MEMBERS_REPLACED', summary: `Participantes de ${order.number} actualizados`, actor,
        beforeData: order.members.map((member: any) => ({ userId: member.userId, function: member.function })),
        afterData: members,
      });
    });
    return this.getOrder(id);
  }

  async history(id: string, pageValue?: string, sizeValue?: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.assertVisible(this.prisma as any, id, tenantId, actor);
    const page = Math.max(1, Number(pageValue || 1) || 1);
    const size = Math.min(100, Math.max(1, Number(sizeValue || 25) || 25));
    const where = { tenantId, manufacturingOrderId: id };
    const prisma = this.prisma as any;
    const [items, total] = await prisma.$transaction([
      prisma.manufacturingAuditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * size, take: size }),
      prisma.manufacturingAuditEvent.count({ where }),
    ]);
    return { items, total, page, size, pages: Math.ceil(total / size) };
  }
}
