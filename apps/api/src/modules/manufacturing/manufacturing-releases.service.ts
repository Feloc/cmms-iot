import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { normalizeEngineeringCode } from './manufacturing.domain';
import { CreateEngineeringReleaseDto, PublishEngineeringReleaseDto, UpdateEngineeringReleaseDto } from './dto/engineering-release.dto';

type Actor = { id: string; name: string; role: string };
type ValidationIssue = { code: string; message: string; entityId?: string };

@Injectable()
export class ManufacturingReleasesService {
  constructor(private readonly prisma: PrismaService) {}

  private context() {
    const store = tenantStorage.getStore();
    if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    return { tenantId: store.tenantId, userId: store.userId };
  }

  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> {
    const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } });
    if (!actor) throw new ForbiddenException('Usuario no encontrado');
    return actor;
  }

  private requireAdmin(actor: Actor) { if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar liberaciones'); }

  private async orderContext(tx: any, orderId: string, tenantId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id }, select: { function: true } } } });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length) throw new NotFoundException('Orden de manufactura no encontrada');
    return order;
  }

  private mutableOrder(order: any) {
    if (order.status === 'CANCELED') throw new ConflictException('La orden está cancelada');
    if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
  }

  private text(value: unknown, field: string, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw new BadRequestException(`${field} es obligatorio`);
    return normalized || null;
  }

  private releaseInclude() {
    return {
      bomRevision: { include: { bom: true, _count: { select: { lines: true } } } },
      documents: {
        include: {
          documentRevision: {
            include: { document: { select: { id: true, code: true, name: true, discipline: true, active: true, manufacturingOrderId: true } }, fileAttachment: { select: { id: true, filename: true, mimeType: true, size: true } } },
          },
        },
        orderBy: [{ disciplineSnapshot: 'asc' }, { documentCodeSnapshot: 'asc' }],
      },
    };
  }

  private serialize(release: any) {
    return { ...release, bomLineCount: Number(release.bomRevision?._count?.lines ?? release.bomLineCountSnapshot ?? 0), documentCount: release.documents?.length || 0 };
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.orderContext(this.prisma as any, orderId, tenantId, actor);
    const releases = await (this.prisma as any).engineeringRelease.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.releaseInclude(), orderBy: { sequence: 'desc' } });
    return releases.map((release: any) => this.serialize(release));
  }

  private async selection(tx: any, tenantId: string, orderId: string, bomRevisionId: unknown, documentRevisionIds: unknown) {
    const bomId = String(bomRevisionId || '').trim();
    if (!bomId) throw new BadRequestException('bomRevisionId es obligatorio');
    const bomRevision = await tx.manufacturingBomRevision.findFirst({ where: { id: bomId, tenantId }, include: { bom: true, _count: { select: { lines: true } } } });
    if (!bomRevision || bomRevision.bom.manufacturingOrderId !== orderId) throw new BadRequestException('La revisión de BOM no pertenece a la orden');
    if (!Array.isArray(documentRevisionIds)) throw new BadRequestException('documentRevisionIds debe ser una lista');
    const ids = documentRevisionIds.map((id) => String(id || '').trim()).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No se puede seleccionar dos veces la misma revisión documental');
    const revisions = await tx.engineeringDocumentRevision.findMany({ where: { tenantId, id: { in: ids } }, include: { document: true } });
    if (revisions.length !== ids.length || revisions.some((revision: any) => revision.document.manufacturingOrderId !== orderId)) throw new BadRequestException('Una o más revisiones documentales no pertenecen a la orden');
    const documentIds = revisions.map((revision: any) => revision.documentId);
    if (new Set(documentIds).size !== documentIds.length) throw new BadRequestException('Solo puede seleccionarse una revisión por documento');
    return { bomRevision, revisions };
  }

  private documentRows(tenantId: string, releaseId: string, revisions: any[]) {
    return revisions.map((revision) => ({ tenantId, releaseId, documentRevisionId: revision.id, documentCodeSnapshot: revision.document.code, documentNameSnapshot: revision.document.name, disciplineSnapshot: revision.document.discipline, revisionCodeSnapshot: revision.revisionCode }));
  }

  async create(orderId: string, dto: CreateEngineeringReleaseDto) {
    const { tenantId, userId } = this.context();
    const releaseCode = normalizeEngineeringCode(dto?.releaseCode);
    if (!releaseCode) throw new BadRequestException('releaseCode es obligatorio');
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
        const order = await this.orderContext(tx, orderId, tenantId, actor); this.mutableOrder(order);
        await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} FOR UPDATE`;
        const existingDraft = await tx.engineeringRelease.findFirst({ where: { tenantId, manufacturingOrderId: orderId, status: 'DRAFT' } });
        if (existingDraft) throw new ConflictException('Ya existe una liberación en borrador para esta orden');
        const { bomRevision, revisions } = await this.selection(tx, tenantId, orderId, dto.bomRevisionId, dto.documentRevisionIds || []);
        const latest = await tx.engineeringRelease.findFirst({ where: { tenantId, manufacturingOrderId: orderId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
        const release = await tx.engineeringRelease.create({ data: {
          tenantId, manufacturingOrderId: orderId, sequence: Number(latest?.sequence || 0) + 1, releaseCode,
          title: this.text(dto.title, 'title', true), notes: this.text(dto.notes, 'notes'), bomRevisionId: bomRevision.id,
          bomCodeSnapshot: bomRevision.bom.code, bomRevisionCodeSnapshot: bomRevision.revisionCode,
          bomLineCountSnapshot: bomRevision._count.lines, createdByUserId: actor.id,
        } });
        if (revisions.length) await tx.engineeringReleaseDocument.createMany({ data: this.documentRows(tenantId, release.id, revisions) });
        await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
        await this.audit(tx, tenantId, orderId, release.id, 'ENGINEERING_RELEASE_CREATED', `Liberación ${releaseCode} creada`, actor, { bomRevisionId: bomRevision.id, documentRevisionIds: revisions.map((item: any) => item.id) });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException(`Ya existe la liberación ${releaseCode}`);
      throw error;
    }
    return this.list(orderId);
  }

  async update(orderId: string, releaseId: string, dto: UpdateEngineeringReleaseDto) {
    const { tenantId, userId } = this.context();
    const observedVersion = Number(dto?.lockVersion);
    if (!Number.isInteger(observedVersion) || observedVersion < 1) throw new BadRequestException('lockVersion inválido');
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
      const order = await this.orderContext(tx, orderId, tenantId, actor); this.mutableOrder(order);
      await tx.$queryRaw`SELECT "id" FROM "EngineeringRelease" WHERE "id" = ${releaseId} FOR UPDATE`;
      const release = await tx.engineeringRelease.findFirst({ where: { id: releaseId, tenantId, manufacturingOrderId: orderId }, include: { documents: true } });
      if (!release) throw new NotFoundException('Liberación no encontrada');
      if (release.status !== 'DRAFT') throw new ConflictException('Una liberación publicada no puede editarse');
      if (release.lockVersion !== observedVersion) throw new ConflictException('La liberación cambió; actualiza la pantalla antes de guardar');
      const replacingSelection = dto.bomRevisionId !== undefined || dto.documentRevisionIds !== undefined;
      let selection: any = null;
      if (replacingSelection) selection = await this.selection(tx, tenantId, orderId, dto.bomRevisionId ?? release.bomRevisionId, dto.documentRevisionIds ?? release.documents.map((item: any) => item.documentRevisionId));
      const data: any = { lockVersion: { increment: 1 } };
      if (dto.title !== undefined) data.title = this.text(dto.title, 'title', true);
      if (dto.notes !== undefined) data.notes = this.text(dto.notes, 'notes');
      if (selection) Object.assign(data, { bomRevisionId: selection.bomRevision.id, bomCodeSnapshot: selection.bomRevision.bom.code, bomRevisionCodeSnapshot: selection.bomRevision.revisionCode, bomLineCountSnapshot: selection.bomRevision._count.lines });
      await tx.engineeringRelease.update({ where: { id: releaseId }, data });
      if (selection && dto.documentRevisionIds !== undefined) {
        await tx.engineeringReleaseDocument.deleteMany({ where: { tenantId, releaseId } });
        if (selection.revisions.length) await tx.engineeringReleaseDocument.createMany({ data: this.documentRows(tenantId, releaseId, selection.revisions) });
      }
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, releaseId, 'ENGINEERING_RELEASE_UPDATED', `Liberación ${release.releaseCode} actualizada`, actor, { lockVersion: observedVersion + 1 });
    });
    return this.list(orderId);
  }

  async validate(orderId: string, releaseId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.orderContext(this.prisma as any, orderId, tenantId, actor);
    const release = await (this.prisma as any).engineeringRelease.findFirst({ where: { id: releaseId, tenantId, manufacturingOrderId: orderId }, include: this.releaseInclude() });
    if (!release) throw new NotFoundException('Liberación no encontrada');
    return this.buildValidation(this.prisma as any, tenantId, orderId, release);
  }

  private async buildValidation(tx: any, tenantId: string, orderId: string, release: any) {
    const errors: ValidationIssue[] = []; const warnings: ValidationIssue[] = [];
    const published = release.status !== 'DRAFT';
    const allowedBomStatuses = published ? ['RELEASED', 'SUPERSEDED'] : ['APPROVED', 'RELEASED'];
    if (!allowedBomStatuses.includes(release.bomRevision.status)) errors.push({ code: 'BOM_NOT_APPROVED', message: `La BOM ${release.bomCodeSnapshot} revisión ${release.bomRevisionCodeSnapshot} no está aprobada`, entityId: release.bomRevisionId });
    const lines = await tx.manufacturingBomLine.findMany({ where: { tenantId, bomRevisionId: release.bomRevisionId }, select: { id: true, position: true, quantityPerUnit: true, inventoryItemId: true, drawingDocumentId: true, drawingRevisionId: true } });
    if (!lines.length) errors.push({ code: 'BOM_EMPTY', message: 'La revisión de BOM no contiene líneas', entityId: release.bomRevisionId });
    if (lines.some((line: any) => Number(line.quantityPerUnit) <= 0)) errors.push({ code: 'BOM_INVALID_QUANTITY', message: 'La BOM contiene cantidades inválidas', entityId: release.bomRevisionId });
    const unlinked = lines.filter((line: any) => !line.inventoryItemId);
    if (unlinked.length) warnings.push({ code: 'UNLINKED_INVENTORY_ITEM', message: `${unlinked.length} líneas no están vinculadas con Inventario`, entityId: unlinked[0].id });
    if (!release.documents.length) errors.push({ code: 'DOCUMENTS_EMPTY', message: 'La liberación debe incluir al menos un documento', entityId: release.id });
    const selectedByDocument = new Map<string, any>();
    for (const item of release.documents) {
      const revision = item.documentRevision;
      if (selectedByDocument.has(revision.documentId)) errors.push({ code: 'DUPLICATE_DOCUMENT', message: `Hay más de una revisión seleccionada para ${item.documentCodeSnapshot}`, entityId: revision.documentId });
      selectedByDocument.set(revision.documentId, revision);
      const allowed = published ? ['RELEASED', 'OBSOLETE'] : ['APPROVED', 'RELEASED'];
      if (!allowed.includes(revision.status)) errors.push({ code: 'DOCUMENT_NOT_APPROVED', message: `${item.documentCodeSnapshot} revisión ${item.revisionCodeSnapshot} no está aprobada`, entityId: revision.id });
      if (!revision.document.active) warnings.push({ code: 'INACTIVE_DOCUMENT', message: `${item.documentCodeSnapshot} está marcado como inactivo`, entityId: revision.documentId });
    }
    const activeDocuments = await tx.engineeringDocument.findMany({ where: { tenantId, manufacturingOrderId: orderId, active: true }, select: { id: true, code: true } });
    for (const document of activeDocuments) if (!selectedByDocument.has(document.id)) errors.push({ code: 'DOCUMENT_NOT_INCLUDED', message: `Falta seleccionar una revisión para ${document.code}`, entityId: document.id });
    for (const line of lines) {
      if (line.drawingRevisionId && selectedByDocument.get(line.drawingDocumentId || '')?.id !== line.drawingRevisionId) errors.push({ code: 'DRAWING_NOT_INCLUDED', message: `La posición ${line.position} referencia un plano/revisión no incluido en el paquete`, entityId: line.id });
      else if (line.drawingDocumentId && !line.drawingRevisionId) warnings.push({ code: 'DRAWING_WITHOUT_REVISION', message: `La posición ${line.position} referencia un plano sin fijar revisión`, entityId: line.id });
    }
    return { valid: errors.length === 0, errors, warnings, summary: { bomCode: release.bomCodeSnapshot, bomRevisionCode: release.bomRevisionCodeSnapshot, bomLineCount: lines.length, documentCount: release.documents.length, releaseCode: release.releaseCode, lockVersion: release.lockVersion } };
  }

  async publish(orderId: string, releaseId: string, dto: PublishEngineeringReleaseDto) {
    const { tenantId, userId } = this.context();
    const observedVersion = Number(dto?.lockVersion);
    if (!Number.isInteger(observedVersion) || observedVersion < 1) throw new BadRequestException('lockVersion inválido');
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await this.orderContext(tx, orderId, tenantId, actor); this.mutableOrder(order);
      await tx.$queryRaw`SELECT "id" FROM "EngineeringRelease" WHERE "id" = ${releaseId} FOR UPDATE`;
      const release = await tx.engineeringRelease.findFirst({ where: { id: releaseId, tenantId, manufacturingOrderId: orderId }, include: this.releaseInclude() });
      if (!release) throw new NotFoundException('Liberación no encontrada');
      if (release.status !== 'DRAFT') throw new ConflictException('La liberación ya no está en borrador');
      if (release.lockVersion !== observedVersion) throw new ConflictException('La liberación cambió; valida nuevamente antes de publicar');
      const notes = this.text(dto?.notes ?? release.notes, 'notes', true)!;
      if (notes.length < 5) throw new BadRequestException('El motivo de liberación debe tener al menos 5 caracteres');
      const validation = await this.buildValidation(tx, tenantId, orderId, release);
      if (!validation.valid) throw new ConflictException({ message: 'La liberación contiene errores bloqueantes', ...validation });
      const now = new Date();
      await tx.engineeringRelease.updateMany({ where: { tenantId, manufacturingOrderId: orderId, status: 'RELEASED', id: { not: releaseId } }, data: { status: 'SUPERSEDED' } });
      await tx.manufacturingSupplyPlan.updateMany({ where: { tenantId, manufacturingOrderId: orderId, status: 'ACTIVE', engineeringReleaseId: { not: releaseId } }, data: { status: 'SUPERSEDED', lockVersion: { increment: 1 } } });
      await tx.manufacturingBomRevision.updateMany({ where: { tenantId, status: 'RELEASED', id: { not: release.bomRevisionId }, bom: { manufacturingOrderId: orderId } }, data: { status: 'SUPERSEDED' } });
      if (release.bomRevision.status === 'APPROVED') await tx.manufacturingBomRevision.update({ where: { id: release.bomRevisionId }, data: { status: 'RELEASED', releasedAt: now, releasedByUserId: actor.id } });
      for (const item of release.documents) {
        const revision = item.documentRevision;
        await tx.engineeringDocumentRevision.updateMany({ where: { tenantId, documentId: revision.documentId, status: 'RELEASED', id: { not: revision.id } }, data: { status: 'OBSOLETE' } });
        if (revision.status === 'APPROVED') await tx.engineeringDocumentRevision.update({ where: { id: revision.id }, data: { status: 'RELEASED', releasedAt: now, releasedByUserId: actor.id } });
      }
      await tx.engineeringRelease.update({ where: { id: releaseId }, data: { status: 'RELEASED', lockVersion: { increment: 1 }, notes, releasedAt: now, releasedByUserId: actor.id, releasedByName: actor.name, validationSnapshot: JSON.parse(JSON.stringify(validation)), bomLineCountSnapshot: validation.summary.bomLineCount } });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { status: 'RELEASED', releasedAt: order.releasedAt || now, version: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, releaseId, 'ENGINEERING_RELEASE_PUBLISHED', `Liberación ${release.releaseCode} publicada`, actor, { bomRevisionId: release.bomRevisionId, documentRevisionIds: release.documents.map((item: any) => item.documentRevisionId), warnings: validation.warnings });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) {
    await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: 'EngineeringRelease', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } });
  }
}
