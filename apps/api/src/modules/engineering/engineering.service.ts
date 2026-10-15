import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { MulterFile } from '../../common/multer-file';
import { CreateEngineeringRequestDto, EngineeringActionDto, ProposalDto, UpdateEngineeringRequestDto } from './engineering.dto';
import { ManufacturingService } from '../manufacturing/manufacturing.service';
import { CreateEngineeringManufacturingDto } from './engineering.dto';
import { assertPermission, nextStatus } from './engineering.domain';

const assetSelect = { id: true, code: true, name: true, serialNumber: true, customer: true };
const fileSelect = { id: true, filename: true, mimeType: true, size: true, createdAt: true, createdBy: true };
const detailInclude = {
  asset: { select: assetSelect },
  revisions: { orderBy: { revision: 'desc' } },
  events: { orderBy: { createdAt: 'asc' } },
  orders: { include: { workOrder: { select: { id: true, title: true, status: true, kind: true, assetCode: true } } } },
  manufacturingOrders: { include: {
    revision: { select: { revision: true } },
    manufacturingOrder: { select: { id: true, number: true, productName: true, status: true, quantity: true, outputReceipts: { select: { quantity: true } } } },
  }, orderBy: { createdAt: 'asc' } },
  attachments: { select: fileSelect, orderBy: { createdAt: 'desc' } },
};
@Injectable()
export class EngineeringService {
  constructor(private readonly prisma: PrismaService, private readonly manufacturing: ManufacturingService) {}
  private async actor() {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Inicia sesión');
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } });
    if (!user) throw new ForbiddenException('Usuario no encontrado');
    return { ...user, tenantId };
  }
  private db() { return this.prisma as any; }
  private async find(tx: any, tenantId: string, id: string, include?: any) {
    const row = await tx.engineeringRequest.findFirst({ where: { id, tenantId }, ...(include ? { include } : {}) });
    if (!row) throw new NotFoundException('Solicitud no encontrada');
    return row;
  }
  async list(query: { assetId?: string; status?: string; q?: string; responsibleUserId?: string; priority?: string; page?: string }) {
    const actor = await this.actor();
    const page = Math.max(1, Math.min(100000, Number(query.page) || 1));
    if (!Number.isInteger(page)) throw new BadRequestException('Página inválida');
    const q = query.q?.trim();
    const where = {
      tenantId: actor.tenantId,
      ...(query.assetId ? { assetId: query.assetId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.responsibleUserId ? { responsibleUserId: query.responsibleUserId } : {}),
      ...(q ? { OR: [
        { title: { contains: q, mode: 'insensitive' } }, { number: { contains: q, mode: 'insensitive' } },
        { asset: { OR: [{ code: { contains: q, mode: 'insensitive' } }, { customer: { contains: q, mode: 'insensitive' } }] } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.db().engineeringRequest.findMany({ where, include: { asset: { select: assetSelect } }, orderBy: { updatedAt: 'desc' }, take: 30, skip: (page - 1) * 30 }),
      this.db().engineeringRequest.count({ where }),
    ]);
    return { items, total, page, pages: Math.ceil(total / 30) };
  }
  async detail(id: string) {
    const actor = await this.actor();
    return this.find(this.db(), actor.tenantId, id, detailInclude);
  }
  async context(workOrderId?: string, noticeId?: string) {
    const actor = await this.actor();
    if (!workOrderId && !noticeId) throw new BadRequestException('Origen requerido');
    const source = workOrderId
      ? await this.prisma.workOrder.findFirst({ where: { id: workOrderId, tenantId: actor.tenantId }, select: { assetCode: true, title: true } })
      : await this.prisma.notice.findFirst({ where: { id: noticeId, tenantId: actor.tenantId }, select: { assetCode: true, title: true } });
    if (!source) throw new NotFoundException('Origen no encontrado');
    const asset = await this.prisma.asset.findFirst({ where: { tenantId: actor.tenantId, code: source.assetCode }, select: assetSelect });
    if (!asset) throw new NotFoundException('Activo no encontrado');
    return { asset, title: source.title };
  }
  async eligibleOrders(id: string) {
    const actor = await this.actor();
    const row = await this.find(this.db(), actor.tenantId, id, { asset: true });
    return this.prisma.workOrder.findMany({
      where: { tenantId: actor.tenantId, assetCode: row.asset.code, status: { not: 'CANCELED' } },
      select: { id: true, title: true, status: true, kind: true }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }
  private async event(tx: any, row: any, actor: any, action: string, note?: string, details?: any, toStatus = row.status) {
    return tx.engineeringRequestEvent.create({ data: {
      tenantId: actor.tenantId, requestId: row.id, actorId: actor.id, actorName: actor.name || actor.id,
      action, fromStatus: row.status, toStatus, note, ...(details ? { details } : {}),
    } });
  }
  async create(dto: CreateEngineeringRequestDto) {
    const actor = await this.actor();
    if (!['ADMIN','TECH'].includes(actor.role)) throw new ForbiddenException('Solo lectura');
    return this.prisma.$transaction(async (tx: any) => {
      const asset = await tx.asset.findFirst({ where: { id: dto.assetId, tenantId: actor.tenantId }, select: assetSelect });
      if (!asset) throw new NotFoundException('Activo no encontrado');
      for (const [model, sourceId] of [['workOrder', dto.originWorkOrderId], ['notice', dto.originNoticeId]]) {
        if (sourceId && !await tx[model!].findFirst({ where: { id: sourceId, tenantId: actor.tenantId, assetCode: asset.code }, select: { id: true } })) {
          throw new BadRequestException('El origen no pertenece al activo');
        }
      }
      const row = await tx.engineeringRequest.create({ data: {
        ...dto, desiredDate: dto.desiredDate ? new Date(dto.desiredDate) : null,
        tenantId: actor.tenantId, requestedByUserId: actor.id,
        number: 'SI-' + new Date().getUTCFullYear() + '-' + randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(),
        assetSnapshot: asset,
      } });
      await this.event(tx, row, actor, 'created');
      return row;
    });
  }
  private async mutate(id: string, version: number, fn: (tx: any, row: any, actor: any) => Promise<void>) {
    const actor = await this.actor();
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Versión requerida');
    return this.prisma.$transaction(async (tx: any) => {
      const row = await this.find(tx, actor.tenantId, id);
      if (actor.role === 'VIEWER') throw new ForbiddenException('Solo lectura');
      const updated = await tx.engineeringRequest.updateMany({ where: { id, tenantId: actor.tenantId, version }, data: { version: { increment: 1 } } });
      if (updated.count !== 1) throw new ConflictException('La solicitud cambió. Recarga antes de continuar.');
      await fn(tx, row, actor);
      return this.find(tx, actor.tenantId, id, detailInclude);
    });
  }
  async proposal(id: string, version: number, proposal: ProposalDto) {
    return this.mutate(id, version, async (tx, row, actor) => {
      if (row.status !== 'STUDY') throw new ConflictException('La propuesta solo se edita durante el estudio');
      assertPermission('engineer', row, actor);
      if (!proposal) throw new BadRequestException('Propuesta requerida');
      await tx.engineeringRequest.update({ where: { id }, data: { proposal, proposalAuthorId: actor.id } });
      await this.event(tx, row, actor, 'proposal-saved', undefined, { proposal });
    });
  }
  async update(id: string, dto: UpdateEngineeringRequestDto) {
    return this.mutate(id, dto.version, async (tx, row, actor) => {
      assertPermission('requester', row, actor);
      if (!['DRAFT','NEEDS_INFO'].includes(row.status)) throw new ConflictException('La solicitud no admite edición en este estado');
      const { version, desiredDate, ...fields } = dto;
      await tx.engineeringRequest.update({ where: { id }, data: { ...fields, desiredDate: desiredDate ? new Date(desiredDate) : null } });
      await this.event(tx, row, actor, 'request-updated', undefined, fields);
    });
  }
  async action(id: string, dto: EngineeringActionDto) {
    return this.mutate(id, dto.version, async (tx, row, actor) => {
      const status = nextStatus(row, dto.action, actor);
      const data: any = { status };
      if (['request-info','revise','reject','hold','cancel','rework'].includes(dto.action) && !dto.note?.trim()) throw new BadRequestException('El motivo es obligatorio');
      if (dto.action === 'authorize-study') {
        for (const field of ['responsibleUserId','reviewerUserId','validatorUserId'] as const) {
          const userId = dto[field];
          const user = userId && await tx.user.findFirst({ where: { id: userId, tenantId: actor.tenantId, role: { in: ['ADMIN','TECH'] } }, select: { id: true } });
          if (!user) throw new BadRequestException('Asigna responsable, revisor y validador válidos');
          data[field] = userId;
        }
        if (data.responsibleUserId === data.reviewerUserId) throw new BadRequestException('Responsable y revisor deben ser distintos');
      }
      if (dto.action === 'submit' && row.status === 'NEEDS_INFO' && !dto.note?.trim()) throw new BadRequestException('Incluye la información solicitada');
      if (dto.action === 'submit-review') {
        if (!row.proposal) throw new BadRequestException('Guarda una propuesta completa');
        const latest = await tx.engineeringRequestRevision.findFirst({ where: { requestId: id, tenantId: actor.tenantId }, orderBy: { revision: 'desc' } });
        const attachments = await tx.attachment.findMany({ where: { engineeringRequestId: id, tenantId: actor.tenantId }, select: fileSelect });
        await tx.engineeringRequestRevision.create({ data: {
          tenantId: actor.tenantId, requestId: id, revision: (latest?.revision || 0) + 1,
          snapshot: { proposal: row.proposal, attachments, asset: row.assetSnapshot, title: row.title },
          createdByUserId: actor.id,
        } });
      }
      if (dto.action === 'approve') {
        const revision = await tx.engineeringRequestRevision.findFirst({ where: { requestId: id, tenantId: actor.tenantId }, orderBy: { revision: 'desc' } });
        if (!revision) throw new ConflictException('Falta la revisión técnica');
        data.approvedRevision = revision.revision;
      }
      if (dto.action === 'start') {
        if (!row.approvedRevision) throw new ConflictException('Se requiere una propuesta aprobada');
        const count = await tx.engineeringRequestOrder.count({ where: { requestId: id, tenantId: actor.tenantId } });
        if (!count) throw new ConflictException('Vincula al menos una OT/OS de ejecución');
      }
      if (dto.action === 'close') {
        if (!dto.criteriaMet || !dto.validationResult?.trim() || !dto.documentUpdates?.trim()) {
          throw new BadRequestException('Confirma los criterios, registra el resultado y la actualización documental');
        }
        const orders = await tx.engineeringRequestOrder.findMany({ where: { requestId: id, tenantId: actor.tenantId }, include: { workOrder: true } });
        if (!orders.length || orders.some((o: any) => !['COMPLETED','CLOSED'].includes(o.workOrder.status))) {
          throw new ConflictException('Todas las órdenes vinculadas deben estar completadas o cerradas');
        }
        const manufacturing = await tx.engineeringManufacturingOrder.findMany({ where: { requestId: id, tenantId: actor.tenantId }, include: { manufacturingOrder: true } });
        if (manufacturing.some((link: any) => link.manufacturingOrder.status !== 'COMPLETED')) {
          throw new ConflictException('Todas las OF vinculadas deben estar completadas');
        }
        data.closedAt = new Date();
      }
      if (dto.action === 'cancel') {
        const pending = await tx.engineeringManufacturingOrder.count({ where: { requestId: id, tenantId: actor.tenantId, manufacturingOrder: { status: { notIn: ['CANCELED', 'COMPLETED'] } } } });
        if (pending) throw new ConflictException('Cancela o completa las OF vinculadas antes de cancelar la solicitud');
      }
      if (dto.action === 'hold') data.previousStatus = row.status;
      if (dto.action === 'resume') data.previousStatus = null;
      await tx.engineeringRequest.update({ where: { id }, data });
      await this.event(tx, row, actor, dto.action, dto.note, {
        ...data, ...(data.closedAt ? { closedAt: data.closedAt.toISOString() } : {}),
        ...(dto.action === 'close' ? { criteriaMet: dto.criteriaMet, validationResult: dto.validationResult, documentUpdates: dto.documentUpdates } : {}),
      }, status);
    });
  }
  async linkOrder(id: string, version: number, workOrderId: string) {
    return this.mutate(id, version, async (tx, row, actor) => {
      assertPermission('engineer', row, actor);
      if (!['APPROVED','EXECUTION'].includes(row.status)) throw new ConflictException('Vincula órdenes después de la aprobación');
      const asset = await tx.asset.findFirst({ where: { id: row.assetId, tenantId: actor.tenantId } });
      const order = await tx.workOrder.findFirst({ where: { id: workOrderId, tenantId: actor.tenantId, assetCode: asset.code, status: { not: 'CANCELED' } } });
      if (!order) throw new BadRequestException('La orden no pertenece al equipo o está cancelada');
      const existing = await tx.engineeringRequestOrder.findUnique({ where: { requestId_workOrderId: { requestId: id, workOrderId } } });
      if (existing) throw new ConflictException('La orden ya está vinculada');
      await tx.engineeringRequestOrder.create({ data: { tenantId: actor.tenantId, requestId: id, workOrderId } });
      await this.event(tx, row, actor, 'order-linked', order.title, { workOrderId });
    });
  }
  private async manufacturingRevision(tx: any, row: any, actor: any) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo administración gestiona vínculos de fabricación');
    if (!['APPROVED', 'EXECUTION'].includes(row.status) || !row.approvedRevision) throw new ConflictException('Se requiere una solicitud aprobada o en ejecución');
    const revision = await tx.engineeringRequestRevision.findFirst({ where: { tenantId: actor.tenantId, requestId: row.id, revision: row.approvedRevision } });
    if (!revision) throw new ConflictException('No existe la revisión aprobada');
    return revision;
  }
  async eligibleManufacturingOrders(id: string) {
    const actor = await this.actor();
    const row = await this.find(this.db(), actor.tenantId, id);
    await this.manufacturingRevision(this.db(), row, actor);
    return this.db().manufacturingOrder.findMany({
      where: { tenantId: actor.tenantId, status: 'DRAFT', orderType: 'SPARE_PART', outputInventoryItemId: { not: null }, engineeringRequestLink: null, fulfillingAfterSalesDemands: { none: {} } },
      select: { id: true, number: true, productName: true, quantity: true }, orderBy: { createdAt: 'desc' }, take: 200,
    });
  }
  private async manufacturingEvent(tx: any, row: any, actor: any, order: any, revision: any, action: string, note?: string) {
    const details = { manufacturingOrderId: order.id, revisionId: revision.id, revision: revision.revision };
    await this.event(tx, row, actor, action, note || order.number, details);
    await tx.manufacturingAuditEvent.create({ data: {
      tenantId: actor.tenantId, manufacturingOrderId: order.id, entityType: 'EngineeringRequest', entityId: row.id, action: action.toUpperCase().replace(/-/g, '_'),
      summary: row.number + ' / revisión ' + revision.revision, actorUserId: actor.id, actorName: actor.name || actor.id,
      afterData: { requestId: row.id, ...details, ...(note ? { note } : {}) },
    } });
  }
  async createManufacturingOrder(id: string, dto: CreateEngineeringManufacturingDto) {
    return this.mutate(id, dto.version, async (tx, row, actor) => {
      const revision = await this.manufacturingRevision(tx, row, actor);
      const item = await tx.inventoryItem.findFirst({ where: { id: dto.inventoryItemId, tenantId: actor.tenantId, status: 'ACTIVE' } });
      if (!item) throw new BadRequestException('Componente no encontrado o inactivo');
      if (!await tx.user.findFirst({ where: { id: dto.responsibleUserId, tenantId: actor.tenantId, role: { in: ['ADMIN', 'TECH'] } } })) throw new BadRequestException('Responsable no válido');
      const proposal = revision.snapshot.proposal;
      const order = await this.manufacturing.createOrderInTransaction(tx, {
        projectName: row.number + ' - ' + row.title, productName: item.name, productCode: item.sku,
        quantity: dto.quantity, responsibleUserId: dto.responsibleUserId, priority: row.priority,
        customerName: row.assetSnapshot?.customer, requestedDeliveryAt: dto.requestedDeliveryAt,
        description: proposal.solution + '\n\n' + proposal.scope,
        members: [
          { userId: row.responsibleUserId, function: 'ENGINEERING' as const },
          { userId: row.reviewerUserId, function: 'REVIEWER' as const },
        ].filter(member => member.userId !== dto.responsibleUserId),
      }, item.id);
      await tx.engineeringManufacturingOrder.create({ data: { tenantId: actor.tenantId, requestId: id, revisionId: revision.id, manufacturingOrderId: order.id, createdByUserId: actor.id } });
      await this.manufacturingEvent(tx, row, actor, order, revision, 'manufacturing-created');
    });
  }
  async linkManufacturingOrder(id: string, version: number, manufacturingOrderId: string) {
    return this.mutate(id, version, async (tx, row, actor) => {
      const revision = await this.manufacturingRevision(tx, row, actor);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${manufacturingOrderId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
      const order = await tx.manufacturingOrder.findFirst({
        where: { id: manufacturingOrderId, tenantId: actor.tenantId, status: 'DRAFT', orderType: 'SPARE_PART', outputInventoryItemId: { not: null }, engineeringRequestLink: null, fulfillingAfterSalesDemands: { none: {} } },
      });
      if (!order) throw new ConflictException('Selecciona una OF de componente en borrador, sin otra solicitud o demanda vinculada');
      await tx.engineeringManufacturingOrder.create({ data: { tenantId: actor.tenantId, requestId: id, revisionId: revision.id, manufacturingOrderId, createdByUserId: actor.id } });
      await this.manufacturingEvent(tx, row, actor, order, revision, 'manufacturing-linked');
    });
  }
  async unlinkManufacturingOrder(id: string, version: number, linkId: string, note: string) {
    return this.mutate(id, version, async (tx, row, actor) => {
      await this.manufacturingRevision(tx, row, actor);
      if (!note?.trim()) throw new BadRequestException('Indica el motivo');
      const link = await tx.engineeringManufacturingOrder.findFirst({ where: { id: linkId, requestId: id, tenantId: actor.tenantId }, include: { revision: true } });
      if (!link) throw new NotFoundException('Vínculo no encontrado');
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${link.manufacturingOrderId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
      const order = await tx.manufacturingOrder.findFirst({ where: { id: link.manufacturingOrderId, tenantId: actor.tenantId } });
      if (!order || !['DRAFT', 'CANCELED'].includes(order.status)) throw new ConflictException('Solo se desvinculan OF en borrador o canceladas');
      await tx.engineeringManufacturingOrder.delete({ where: { id: link.id } });
      await this.manufacturingEvent(tx, row, actor, order, link.revision, 'manufacturing-unlinked', note);
    });
  }
  async comment(id: string, version: number, note: string) {
    return this.mutate(id, version, async (tx, row, actor) => {
      this.assertContributor(row, actor);
      await this.event(tx, row, actor, 'comment', note);
    });
  }
  async unlinkOrder(id: string, version: number, linkId: string, note: string) {
    return this.mutate(id, version, async (tx, row, actor) => {
      assertPermission('engineer', row, actor);
      if (!['APPROVED','EXECUTION'].includes(row.status)) throw new ConflictException('No se pueden desvincular órdenes en este estado');
      const link = await tx.engineeringRequestOrder.findFirst({ where: { id: linkId, requestId: id, tenantId: actor.tenantId } });
      if (!link) throw new NotFoundException('Vínculo no encontrado');
      await tx.engineeringRequestOrder.delete({ where: { id: linkId } });
      await this.event(tx, row, actor, 'order-unlinked', note, { workOrderId: link.workOrderId });
    });
  }
  private assertContributor(row: any, actor: any) {
    if (['CLOSED','REJECTED','CANCELED'].includes(row.status)) throw new ConflictException('La solicitud está cerrada');
    if (!['ADMIN','TECH'].includes(actor.role) || (actor.role !== 'ADMIN' &&
      ![row.requestedByUserId,row.responsibleUserId,row.reviewerUserId,row.validatorUserId].includes(actor.id))) throw new ForbiddenException('No participas en esta solicitud');
  }
  async upload(id: string, version: number, file: MulterFile) {
    const sha256 = createHash('sha256').update(await readFile(file.path)).digest('hex');
    return this.mutate(id, version, async (tx, row, actor) => {
      this.assertContributor(row, actor);
      const attachment = await tx.attachment.create({ data: {
        tenantId: actor.tenantId, engineeringRequestId: id, assetId: row.assetId, type: file.mimetype.startsWith('image/') ? 'IMAGE' : 'DOCUMENT',
        filename: file.originalname, mimeType: file.mimetype, size: file.size, url: file.path, createdBy: actor.id,
      } });
      await this.event(tx, row, actor, 'file-added', file.originalname, { attachmentId: attachment.id, sha256 });
    });
  }
}
