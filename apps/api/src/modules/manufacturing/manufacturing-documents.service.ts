import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { MulterFile } from '../../common/multer-file';
import {
  CreateEngineeringDocumentDto,
  CreateEngineeringRevisionDto,
  ReviewEngineeringRevisionDto,
  UpdateEngineeringDocumentDto,
} from './dto/engineering-documents.dto';
import { isAllowedEngineeringFilename, normalizeEngineeringCode } from './manufacturing.domain';

const DISCIPLINES = new Set(['MECHANICAL', 'ELECTRICAL', 'PNEUMATIC', 'HYDRAULIC', 'AUTOMATION', 'SOFTWARE', 'QUALITY', 'GENERAL']);
const DOCUMENT_TYPES = new Set(['DRAWING', 'SCHEMATIC', 'SPECIFICATION', 'DATASHEET', 'PROGRAM', 'MANUAL', 'CALCULATION', 'PROCEDURE', 'OTHER']);

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingDocumentsService {
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

  private text(value: unknown, field: string, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw new BadRequestException(`${field} es obligatorio`);
    return normalized || null;
  }

  private enumValue(value: unknown, allowed: Set<string>, field: string) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!allowed.has(normalized)) throw new BadRequestException(`${field} inválido`);
    return normalized;
  }

  private async orderContext(tx: any, orderId: string, tenantId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { members: { where: { userId: actor.id }, select: { function: true } } },
    });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    const memberFunctions = new Set<string>(order.members.map((member: any) => member.function));
    if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !memberFunctions.size) {
      throw new NotFoundException('Orden de manufactura no encontrada');
    }
    return { order, memberFunctions };
  }

  private requireEngineering(actor: Actor, memberFunctions: Set<string>) {
    if (actor.role === 'ADMIN' || memberFunctions.has('ENGINEERING')) return;
    throw new ForbiddenException('Debes pertenecer al equipo de Ingeniería');
  }

  private requireReviewer(actor: Actor, memberFunctions: Set<string>) {
    if (actor.role === 'ADMIN' || memberFunctions.has('REVIEWER')) return;
    throw new ForbiddenException('Debes estar asignado como revisor');
  }

  private mutableOrder(order: any) {
    if (['CANCELED', 'COMPLETED'].includes(order.status)) throw new ConflictException('La orden está cerrada');
    if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
  }

  private async audit(tx: any, input: {
    tenantId: string; orderId: string; entityType: string; entityId: string;
    action: string; summary: string; actor: Actor; beforeData?: unknown; afterData?: unknown;
  }) {
    return tx.manufacturingAuditEvent.create({
      data: {
        tenantId: input.tenantId,
        manufacturingOrderId: input.orderId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        summary: input.summary,
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        beforeData: input.beforeData === undefined ? undefined : JSON.parse(JSON.stringify(input.beforeData)),
        afterData: input.afterData === undefined ? undefined : JSON.parse(JSON.stringify(input.afterData)),
      },
    });
  }

  private documentInclude() {
    return {
      revisions: {
        include: { fileAttachment: { select: { id: true, filename: true, mimeType: true, size: true, createdAt: true } } },
        orderBy: { sequence: 'desc' },
      },
    };
  }

  private serializeDocument(document: any) {
    const revisions = document.revisions || [];
    return {
      ...document,
      latestRevision: revisions[0] || null,
      approvedRevision: revisions.find((revision: any) => revision.status === 'APPROVED') || null,
      releasedRevision: revisions.find((revision: any) => revision.status === 'RELEASED') || null,
    };
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.orderContext(this.prisma as any, orderId, tenantId, actor);
    const documents = await (this.prisma as any).engineeringDocument.findMany({
      where: { tenantId, manufacturingOrderId: orderId },
      include: this.documentInclude(),
      orderBy: [{ active: 'desc' }, { discipline: 'asc' }, { code: 'asc' }],
    });
    return documents.map((document: any) => this.serializeDocument(document));
  }

  async create(orderId: string, dto: CreateEngineeringDocumentDto) {
    const { tenantId, userId } = this.context();
    const code = normalizeEngineeringCode(dto?.code);
    if (!code) throw new BadRequestException('code es obligatorio');
    const name = this.text(dto?.name, 'name', true)!;
    const discipline = this.enumValue(dto?.discipline, DISCIPLINES, 'discipline');
    const documentType = this.enumValue(dto?.documentType, DOCUMENT_TYPES, 'documentType');

    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
        this.requireEngineering(actor, memberFunctions);
        this.mutableOrder(order);
        const document = await tx.engineeringDocument.create({
          data: {
            tenantId, manufacturingOrderId: orderId, code, name, discipline, documentType,
            systemName: this.text(dto.systemName, 'systemName'),
            description: this.text(dto.description, 'description'),
            createdByUserId: actor.id,
          },
        });
        await tx.manufacturingOrder.update({
          where: { id: orderId },
          data: { status: order.status === 'DRAFT' ? 'ENGINEERING' : order.status, version: { increment: 1 } },
        });
        await this.audit(tx, {
          tenantId, orderId, entityType: 'EngineeringDocument', entityId: document.id,
          action: 'DOCUMENT_CREATED', summary: `Documento ${code} creado`, actor, afterData: document,
        });
      });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException(`Ya existe el documento ${code} en esta orden`);
      throw error;
    }
    return this.list(orderId);
  }

  async update(documentId: string, dto: UpdateEngineeringDocumentDto) {
    const { tenantId, userId } = this.context();
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const document = await tx.engineeringDocument.findFirst({ where: { id: documentId, tenantId } });
      if (!document) throw new NotFoundException('Documento de Ingeniería no encontrado');
      orderId = document.manufacturingOrderId;
      const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
      this.requireEngineering(actor, memberFunctions);
      this.mutableOrder(order);
      const data: any = {};
      if (dto.name !== undefined) data.name = this.text(dto.name, 'name', true);
      if (dto.discipline !== undefined) data.discipline = this.enumValue(dto.discipline, DISCIPLINES, 'discipline');
      if (dto.documentType !== undefined) data.documentType = this.enumValue(dto.documentType, DOCUMENT_TYPES, 'documentType');
      if (dto.systemName !== undefined) data.systemName = this.text(dto.systemName, 'systemName');
      if (dto.description !== undefined) data.description = this.text(dto.description, 'description');
      if (dto.active !== undefined) data.active = !!dto.active;
      if (!Object.keys(data).length) throw new BadRequestException('No hay cambios para aplicar');
      const updated = await tx.engineeringDocument.update({ where: { id: documentId }, data });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, {
        tenantId, orderId, entityType: 'EngineeringDocument', entityId: documentId,
        action: 'DOCUMENT_UPDATED', summary: `Documento ${document.code} actualizado`, actor,
        beforeData: document, afterData: updated,
      });
    });
    return this.list(orderId);
  }

  async createRevision(documentId: string, dto: CreateEngineeringRevisionDto, file: MulterFile) {
    const { tenantId, userId } = this.context();
    const revisionCode = normalizeEngineeringCode(dto?.revisionCode);
    const changeSummary = this.text(dto?.changeSummary, 'changeSummary', true)!;
    if (!revisionCode) {
      await this.removeFile(file.path);
      throw new BadRequestException('revisionCode es obligatorio');
    }
    if (!isAllowedEngineeringFilename(file.originalname)) {
      await this.removeFile(file.path);
      throw new BadRequestException('Tipo de archivo no permitido para documentación de Ingeniería');
    }

    const fileSha256 = createHash('sha256').update(await fs.promises.readFile(file.path)).digest('hex');
    let orderId = '';
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const document = await tx.engineeringDocument.findFirst({ where: { id: documentId, tenantId } });
        if (!document) throw new NotFoundException('Documento de Ingeniería no encontrado');
        orderId = document.manufacturingOrderId;
        const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
        this.requireEngineering(actor, memberFunctions);
        this.mutableOrder(order);
        if (!document.active) throw new ConflictException('El documento está inactivo');

        await tx.$queryRaw`SELECT "id" FROM "EngineeringDocument" WHERE "id" = ${documentId} FOR UPDATE`;
        const latest = await tx.engineeringDocumentRevision.findFirst({
          where: { tenantId, documentId }, orderBy: { sequence: 'desc' }, select: { sequence: true },
        });
        const attachment = await tx.attachment.create({
          data: {
            tenantId, manufacturingOrderId: orderId, type: 'DOCUMENT', filename: file.originalname,
            mimeType: file.mimetype || 'application/octet-stream', size: file.size, url: file.path, createdBy: actor.id,
          },
        });
        const revision = await tx.engineeringDocumentRevision.create({
          data: {
            tenantId, documentId, sequence: Number(latest?.sequence || 0) + 1, revisionCode,
            changeSummary, fileAttachmentId: attachment.id, sourceFilename: file.originalname,
            fileSha256, createdByUserId: actor.id,
          },
        });
        await tx.manufacturingOrder.update({
          where: { id: orderId },
          data: { status: order.status === 'DRAFT' ? 'ENGINEERING' : order.status, version: { increment: 1 } },
        });
        await this.audit(tx, {
          tenantId, orderId, entityType: 'EngineeringDocumentRevision', entityId: revision.id,
          action: 'DOCUMENT_REVISION_CREATED', summary: `${document.code} revisión ${revisionCode} creada`, actor,
          afterData: { revisionCode, sequence: revision.sequence, fileSha256, sourceFilename: file.originalname },
        });
      });
    } catch (error: any) {
      await this.removeFile(file.path);
      if (error?.code === 'P2002') throw new ConflictException(`Ya existe la revisión ${revisionCode}`);
      throw error;
    }
    return this.list(orderId);
  }

  async submit(revisionId: string) {
    return this.transition(revisionId, 'submit');
  }

  async review(revisionId: string, approved: boolean, dto: ReviewEngineeringRevisionDto) {
    return this.transition(revisionId, approved ? 'approve' : 'reject', dto?.comment);
  }

  private async transition(revisionId: string, action: 'submit' | 'approve' | 'reject', rawComment?: string | null) {
    const { tenantId, userId } = this.context();
    const comment = String(rawComment || '').trim();
    if (action === 'reject' && !comment) throw new BadRequestException('El comentario es obligatorio al rechazar');
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const revision = await tx.engineeringDocumentRevision.findFirst({
        where: { id: revisionId, tenantId }, include: { document: true },
      });
      if (!revision) throw new NotFoundException('Revisión documental no encontrada');
      orderId = revision.document.manufacturingOrderId;
      const { order, memberFunctions } = await this.orderContext(tx, orderId, tenantId, actor);
      this.mutableOrder(order);

      let data: any;
      let auditAction: string;
      let summary: string;
      if (action === 'submit') {
        this.requireEngineering(actor, memberFunctions);
        if (revision.status !== 'DRAFT') throw new ConflictException('Solo una revisión en borrador puede enviarse a revisión');
        data = { status: 'IN_REVIEW', submittedAt: new Date(), submittedByUserId: actor.id, reviewComment: null };
        auditAction = 'DOCUMENT_SUBMITTED';
        summary = `${revision.document.code} revisión ${revision.revisionCode} enviada a revisión`;
      } else {
        this.requireReviewer(actor, memberFunctions);
        if (revision.status !== 'IN_REVIEW') throw new ConflictException('La revisión no está pendiente de decisión');
        if (actor.role !== 'ADMIN' && revision.createdByUserId === actor.id) {
          throw new ForbiddenException('El autor no puede revisar su propia revisión');
        }
        const approved = action === 'approve';
        data = {
          status: approved ? 'APPROVED' : 'REJECTED', reviewedAt: new Date(), reviewedByUserId: actor.id,
          reviewComment: comment || null,
        };
        auditAction = approved ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED';
        summary = `${revision.document.code} revisión ${revision.revisionCode} ${approved ? 'aprobada' : 'rechazada'}`;
      }
      const updated = await tx.engineeringDocumentRevision.update({ where: { id: revisionId }, data });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, {
        tenantId, orderId, entityType: 'EngineeringDocumentRevision', entityId: revisionId,
        action: auditAction, summary, actor,
        beforeData: { status: revision.status }, afterData: { status: updated.status, reviewComment: updated.reviewComment },
      });
    });
    return this.list(orderId);
  }

  private async removeFile(filePath: string) {
    try { await fs.promises.unlink(filePath); } catch {}
  }
}
