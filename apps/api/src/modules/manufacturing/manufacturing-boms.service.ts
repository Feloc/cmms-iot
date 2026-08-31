import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { bomHierarchyLevels, normalizeEngineeringCode } from './manufacturing.domain';
import {
  CreateManufacturingBomDto,
  CreateManufacturingBomRevisionDto,
  ManufacturingBomLineInput,
  ReplaceManufacturingBomLinesDto,
  ReviewManufacturingBomRevisionDto,
} from './dto/manufacturing-bom.dto';

const SUPPLY_TYPES = new Set(['STOCK', 'BUY', 'MAKE', 'SUBCONTRACT']);
const CRITICALITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingBomsService {
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

  private async orderContext(tx: any, orderId: string, tenantId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { members: { where: { userId: actor.id }, select: { function: true } } },
    });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    const memberFunctions = new Set<string>(order.members.map((member: any) => member.function));
    if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !memberFunctions.size) throw new NotFoundException('Orden de manufactura no encontrada');
    return { order, memberFunctions };
  }

  private requireEngineering(actor: Actor, functions: Set<string>) {
    if (actor.role === 'ADMIN' || functions.has('ENGINEERING')) return;
    throw new ForbiddenException('Debes pertenecer al equipo de Ingeniería');
  }

  private requireReviewer(actor: Actor, functions: Set<string>) {
    if (actor.role === 'ADMIN' || functions.has('REVIEWER')) return;
    throw new ForbiddenException('Debes estar asignado como revisor');
  }

  private mutableOrder(order: any) {
    if (['CANCELED', 'COMPLETED'].includes(order.status)) throw new ConflictException('La orden está cerrada');
    if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
  }

  private text(value: unknown, field: string, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw new BadRequestException(`${field} es obligatorio`);
    return normalized || null;
  }

  private async audit(tx: any, input: { tenantId: string; orderId: string; entityType: string; entityId: string; action: string; summary: string; actor: Actor; beforeData?: unknown; afterData?: unknown; metadata?: unknown }) {
    await tx.manufacturingAuditEvent.create({ data: {
      tenantId: input.tenantId, manufacturingOrderId: input.orderId, entityType: input.entityType, entityId: input.entityId,
      action: input.action, summary: input.summary, actorUserId: input.actor.id, actorName: input.actor.name,
      beforeData: input.beforeData === undefined ? undefined : JSON.parse(JSON.stringify(input.beforeData)),
      afterData: input.afterData === undefined ? undefined : JSON.parse(JSON.stringify(input.afterData)),
      metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata)),
    } });
  }

  private serializeRevision(revision: any) {
    return {
      ...revision,
      lineCount: Number(revision._count?.lines ?? revision.lines?.length ?? 0),
      lines: revision.lines?.map((line: any) => ({ ...line, quantityPerUnit: Number(line.quantityPerUnit) })),
    };
  }

  private serializeBom(bom: any) {
    const revisions = (bom.revisions || []).map((revision: any) => this.serializeRevision(revision));
    return {
      ...bom,
      revisions,
      latestRevision: revisions[0] || null,
      approvedRevision: revisions.find((revision: any) => ['APPROVED', 'RELEASED'].includes(revision.status)) || null,
      releasedRevision: revisions.find((revision: any) => revision.status === 'RELEASED') || null,
    };
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.orderContext(this.prisma as any, orderId, tenantId, actor);
    const boms = await (this.prisma as any).manufacturingBom.findMany({
      where: { tenantId, manufacturingOrderId: orderId },
      include: { revisions: { include: { _count: { select: { lines: true } } }, orderBy: { sequence: 'desc' } } },
      orderBy: { code: 'asc' },
    });
    return boms.map((bom: any) => this.serializeBom(bom));
  }

  async create(orderId: string, dto: CreateManufacturingBomDto) {
    const { tenantId, userId } = this.context();
    const code = normalizeEngineeringCode(dto?.code);
    const revisionCode = normalizeEngineeringCode(dto?.revisionCode || '00');
    if (!code) throw new BadRequestException('code es obligatorio');
    if (!revisionCode) throw new BadRequestException('revisionCode es obligatorio');
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
        this.requireEngineering(actor, memberFunctions); this.mutableOrder(order);
        const bom = await tx.manufacturingBom.create({ data: {
          tenantId, manufacturingOrderId: orderId, code, name: this.text(dto.name, 'name', true),
          description: this.text(dto.description, 'description'), createdByUserId: actor.id,
        } });
        const revision = await tx.manufacturingBomRevision.create({ data: {
          tenantId, bomId: bom.id, sequence: 1, revisionCode,
          changeSummary: this.text(dto.changeSummary || 'Emisión inicial', 'changeSummary', true), createdByUserId: actor.id,
        } });
        await tx.manufacturingOrder.update({ where: { id: orderId }, data: { status: order.status === 'DRAFT' ? 'ENGINEERING' : order.status, version: { increment: 1 } } });
        await this.audit(tx, { tenantId, orderId, entityType: 'ManufacturingBom', entityId: bom.id, action: 'BOM_CREATED', summary: `BOM ${code} creada`, actor, afterData: { bom, revision } });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException(`Ya existe la BOM ${code} en esta orden`);
      throw error;
    }
    return this.list(orderId);
  }

  async createRevision(bomId: string, dto: CreateManufacturingBomRevisionDto) {
    const { tenantId, userId } = this.context();
    const revisionCode = normalizeEngineeringCode(dto?.revisionCode);
    if (!revisionCode) throw new BadRequestException('revisionCode es obligatorio');
    let orderId = '';
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const bom = await tx.manufacturingBom.findFirst({ where: { id: bomId, tenantId } });
        if (!bom) throw new NotFoundException('BOM no encontrada');
        orderId = bom.manufacturingOrderId;
        const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
        this.requireEngineering(actor, memberFunctions); this.mutableOrder(order);
        await tx.$queryRaw`SELECT "id" FROM "ManufacturingBom" WHERE "id" = ${bomId} FOR UPDATE`;
        const latest = await tx.manufacturingBomRevision.findFirst({ where: { tenantId, bomId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
        const revision = await tx.manufacturingBomRevision.create({ data: {
          tenantId, bomId, sequence: Number(latest?.sequence || 0) + 1, revisionCode,
          changeSummary: this.text(dto.changeSummary, 'changeSummary', true), createdByUserId: actor.id,
        } });
        let copied = 0;
        if (dto.copyFromRevisionId) {
          const source = await tx.manufacturingBomRevision.findFirst({
            where: { id: dto.copyFromRevisionId, tenantId, bomId }, include: { lines: { orderBy: { position: 'asc' } } },
          });
          if (!source) throw new BadRequestException('La revisión origen no pertenece a esta BOM');
          const ids = new Map<string, string>();
          for (const line of source.lines) {
            const created = await tx.manufacturingBomLine.create({ data: {
              tenantId, bomRevisionId: revision.id, position: line.position,
              parentLineId: line.parentLineId ? ids.get(line.parentLineId) || null : null, level: line.level,
              inventoryItemId: line.inventoryItemId, itemCode: line.itemCode, description: line.description,
              quantityPerUnit: line.quantityPerUnit, uom: line.uom, supplyType: line.supplyType,
              isOptional: line.isOptional, criticality: line.criticality,
              drawingDocumentId: line.drawingDocumentId, drawingRevisionId: line.drawingRevisionId,
              materialSpecification: line.materialSpecification, manufacturer: line.manufacturer,
              manufacturerPartNo: line.manufacturerPartNo, preferredSupplier: line.preferredSupplier,
              leadTimeDays: line.leadTimeDays, notes: line.notes,
            } });
            ids.set(line.id, created.id); copied++;
          }
        }
        await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
        await this.audit(tx, { tenantId, orderId, entityType: 'ManufacturingBomRevision', entityId: revision.id, action: 'BOM_REVISION_CREATED', summary: `${bom.code} revisión ${revisionCode} creada`, actor, afterData: { revisionCode, sequence: revision.sequence, copiedLines: copied } });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException(`Ya existe la revisión ${revisionCode}`);
      throw error;
    }
    return this.list(orderId);
  }

  async getRevision(revisionId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const revision = await (this.prisma as any).manufacturingBomRevision.findFirst({
      where: { id: revisionId, tenantId },
      include: { bom: true, lines: { include: { parentLine: { select: { position: true } }, inventoryItem: { select: { id: true, sku: true, name: true, uom: true, qty: true, status: true } }, drawingDocument: { select: { id: true, code: true, name: true } }, drawingRevision: { select: { id: true, revisionCode: true, status: true } } }, orderBy: { position: 'asc' } } },
    });
    if (!revision) throw new NotFoundException('Revisión de BOM no encontrada');
    await this.orderContext(this.prisma as any, revision.bom.manufacturingOrderId, tenantId, actor);
    return this.serializeRevision(revision);
  }

  async replaceLines(revisionId: string, dto: ReplaceManufacturingBomLinesDto, importMetadata?: unknown) {
    const { tenantId, userId } = this.context();
    if (!Array.isArray(dto?.lines)) throw new BadRequestException('lines debe ser una lista');
    if (dto.lines.length > 5000) throw new BadRequestException('La BOM no puede superar 5000 líneas por revisión');
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const revision = await tx.manufacturingBomRevision.findFirst({ where: { id: revisionId, tenantId }, include: { bom: true } });
      if (!revision) throw new NotFoundException('Revisión de BOM no encontrada');
      orderId = revision.bom.manufacturingOrderId;
      const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
      this.requireEngineering(actor, memberFunctions); this.mutableOrder(order);
      if (revision.status !== 'DRAFT') throw new ConflictException('Solo una revisión en borrador puede editarse');
      const prepared = await this.prepareLines(tx, tenantId, orderId, dto.lines);
      const beforeCount = await tx.manufacturingBomLine.count({ where: { tenantId, bomRevisionId: revisionId } });
      await tx.manufacturingBomLine.deleteMany({ where: { tenantId, bomRevisionId: revisionId } });
      const ids = new Map<number, { id: string; level: number }>();
      for (const line of prepared) {
        const parent = line.parentPosition == null ? null : ids.get(line.parentPosition);
        const created = await tx.manufacturingBomLine.create({ data: {
          tenantId, bomRevisionId: revisionId, position: line.position, parentLineId: parent?.id || null,
          level: parent ? parent.level + 1 : 0, inventoryItemId: line.inventoryItemId,
          itemCode: line.itemCode, description: line.description, quantityPerUnit: line.quantityPerUnit,
          uom: line.uom, supplyType: line.supplyType, isOptional: line.isOptional,
          criticality: line.criticality, drawingDocumentId: line.drawingDocumentId,
          drawingRevisionId: line.drawingRevisionId, materialSpecification: line.materialSpecification,
          manufacturer: line.manufacturer, manufacturerPartNo: line.manufacturerPartNo,
          preferredSupplier: line.preferredSupplier, leadTimeDays: line.leadTimeDays, notes: line.notes,
        } });
        ids.set(line.position, { id: created.id, level: parent ? parent.level + 1 : 0 });
      }
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, { tenantId, orderId, entityType: 'ManufacturingBomRevision', entityId: revisionId,
        action: importMetadata ? 'BOM_IMPORTED' : 'BOM_LINES_REPLACED', summary: `${revision.bom.code} revisión ${revision.revisionCode}: ${prepared.length} líneas guardadas`, actor,
        beforeData: { lineCount: beforeCount }, afterData: { lineCount: prepared.length }, metadata: importMetadata,
      });
    });
    return this.getRevision(revisionId);
  }

  private async prepareLines(tx: any, tenantId: string, orderId: string, lines: ManufacturingBomLineInput[]) {
    const inventoryIds = new Set<string>();
    const documentIds = new Set<string>();
    const revisionIds = new Set<string>();
    const normalized = lines.map((raw, index) => {
      const position = Number(raw?.position);
      if (!Number.isInteger(position) || position < 1) throw new BadRequestException(`Línea ${index + 1}: position debe ser entero positivo`);
      const parentPosition = raw.parentPosition === undefined || raw.parentPosition === null ? null : Number(raw.parentPosition);
      const quantityPerUnit = Number(raw.quantityPerUnit);
      if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) throw new BadRequestException(`Línea ${position}: quantityPerUnit debe ser mayor que cero`);
      const supplyType = String(raw.supplyType || '').toUpperCase();
      if (!SUPPLY_TYPES.has(supplyType)) throw new BadRequestException(`Línea ${position}: supplyType inválido`);
      const criticality = String(raw.criticality || 'MEDIUM').toUpperCase();
      if (!CRITICALITIES.has(criticality)) throw new BadRequestException(`Línea ${position}: criticality inválida`);
      const leadTimeDays = raw.leadTimeDays === undefined || raw.leadTimeDays === null || raw.leadTimeDays === '' ? null : Number(raw.leadTimeDays);
      if (leadTimeDays !== null && (!Number.isInteger(leadTimeDays) || leadTimeDays < 0)) throw new BadRequestException(`Línea ${position}: leadTimeDays debe ser entero no negativo`);
      const inventoryItemId = this.text(raw.inventoryItemId, 'inventoryItemId');
      const drawingDocumentId = this.text(raw.drawingDocumentId, 'drawingDocumentId');
      const drawingRevisionId = this.text(raw.drawingRevisionId, 'drawingRevisionId');
      if (inventoryItemId) inventoryIds.add(inventoryItemId);
      if (drawingDocumentId) documentIds.add(drawingDocumentId);
      if (drawingRevisionId) revisionIds.add(drawingRevisionId);
      return { ...raw, position, parentPosition, quantityPerUnit, supplyType, criticality, leadTimeDays, inventoryItemId, drawingDocumentId, drawingRevisionId };
    });
    try { bomHierarchyLevels(normalized); } catch (error: any) { throw new BadRequestException(error?.message || 'Jerarquía de BOM inválida'); }
    const inventory = await tx.inventoryItem.findMany({ where: { tenantId, id: { in: [...inventoryIds] } }, select: { id: true, sku: true, name: true, description: true, uom: true, preferredSupplier: true, leadTimeDays: true, criticality: true } });
    if (inventory.length !== inventoryIds.size) throw new BadRequestException('Uno o más artículos de Inventario no pertenecen al tenant');
    const inventoryMap = new Map<string, any>(inventory.map((item: any) => [item.id, item]));
    const documents = await tx.engineeringDocument.findMany({ where: { tenantId, manufacturingOrderId: orderId, id: { in: [...documentIds] } }, select: { id: true } });
    if (documents.length !== documentIds.size) throw new BadRequestException('Uno o más planos no pertenecen a la orden');
    const revisions = await tx.engineeringDocumentRevision.findMany({ where: { tenantId, id: { in: [...revisionIds] } }, select: { id: true, documentId: true } });
    const revisionMap = new Map<string, string>(revisions.map((item: any) => [item.id, item.documentId]));
    if (revisions.length !== revisionIds.size) throw new BadRequestException('Una o más revisiones de plano son inválidas');
    return normalized.sort((a, b) => a.position - b.position).map((line) => {
      const item = line.inventoryItemId ? inventoryMap.get(line.inventoryItemId) : null;
      if (line.drawingRevisionId && (!line.drawingDocumentId || revisionMap.get(line.drawingRevisionId) !== line.drawingDocumentId)) throw new BadRequestException(`Línea ${line.position}: la revisión no pertenece al plano seleccionado`);
      return {
        ...line,
        itemCode: this.text(line.itemCode, 'itemCode') || item?.sku || (() => { throw new BadRequestException(`Línea ${line.position}: itemCode es obligatorio`); })(),
        description: this.text(line.description, 'description') || item?.name || item?.description || (() => { throw new BadRequestException(`Línea ${line.position}: description es obligatoria`); })(),
        uom: this.text(line.uom, 'uom') || item?.uom || 'UND',
        isOptional: !!line.isOptional,
        preferredSupplier: this.text(line.preferredSupplier, 'preferredSupplier') || item?.preferredSupplier || null,
        leadTimeDays: line.leadTimeDays ?? item?.leadTimeDays ?? null,
        materialSpecification: this.text(line.materialSpecification, 'materialSpecification'),
        manufacturer: this.text(line.manufacturer, 'manufacturer'), manufacturerPartNo: this.text(line.manufacturerPartNo, 'manufacturerPartNo'), notes: this.text(line.notes, 'notes'),
      };
    });
  }

  async submit(revisionId: string) { return this.transition(revisionId, 'submit'); }
  async review(revisionId: string, approved: boolean, dto: ReviewManufacturingBomRevisionDto) { return this.transition(revisionId, approved ? 'approve' : 'reject', dto?.comment); }

  private async transition(revisionId: string, action: 'submit' | 'approve' | 'reject', rawComment?: string | null) {
    const { tenantId, userId } = this.context();
    const comment = String(rawComment || '').trim();
    if (action === 'reject' && !comment) throw new BadRequestException('El comentario es obligatorio al rechazar');
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const revision = await tx.manufacturingBomRevision.findFirst({ where: { id: revisionId, tenantId }, include: { bom: true, _count: { select: { lines: true } } } });
      if (!revision) throw new NotFoundException('Revisión de BOM no encontrada');
      orderId = revision.bom.manufacturingOrderId;
      const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor); this.mutableOrder(order);
      let data: any; let auditAction: string; let summary: string;
      if (action === 'submit') {
        this.requireEngineering(actor, memberFunctions);
        if (revision.status !== 'DRAFT') throw new ConflictException('Solo un borrador puede enviarse a revisión');
        if (!revision._count.lines) throw new ConflictException('La BOM debe tener al menos una línea');
        data = { status: 'IN_REVIEW', submittedAt: new Date(), submittedByUserId: actor.id, reviewComment: null };
        auditAction = 'BOM_SUBMITTED'; summary = `${revision.bom.code} revisión ${revision.revisionCode} enviada a revisión`;
      } else {
        this.requireReviewer(actor, memberFunctions);
        if (revision.status !== 'IN_REVIEW') throw new ConflictException('La BOM no está pendiente de decisión');
        if (actor.role !== 'ADMIN' && revision.createdByUserId === actor.id) throw new ForbiddenException('El autor no puede revisar su propia BOM');
        const approved = action === 'approve';
        data = { status: approved ? 'APPROVED' : 'REJECTED', reviewedAt: new Date(), reviewedByUserId: actor.id, reviewComment: comment || null };
        auditAction = approved ? 'BOM_APPROVED' : 'BOM_REJECTED'; summary = `${revision.bom.code} revisión ${revision.revisionCode} ${approved ? 'aprobada' : 'rechazada'}`;
      }
      const updated = await tx.manufacturingBomRevision.update({ where: { id: revisionId }, data });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, { tenantId, orderId, entityType: 'ManufacturingBomRevision', entityId: revisionId, action: auditAction, summary, actor, beforeData: { status: revision.status }, afterData: { status: updated.status, reviewComment: updated.reviewComment } });
    });
    return this.list(orderId);
  }
}
