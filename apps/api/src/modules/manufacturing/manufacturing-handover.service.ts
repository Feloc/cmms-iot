import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import {
  AcceptManufacturingHandoverDto,
  CreateManufacturingHandoverDto,
  CreateManufacturingHandoverSpareDto,
  CreateManufacturingHandoverTrainingDto,
  ManufacturingHandoverVersionDto,
  UpdateManufacturingHandoverDocumentDto,
} from './dto/manufacturing-handover.dto';

type Actor = { id: string; name: string; role: string };
const DOCUMENTS = [
  ['AS_BUILT_MECHANICAL', 'Planos mecánicos as-built'],
  ['AS_BUILT_ELECTRICAL', 'Planos eléctricos as-built'],
  ['SOFTWARE_BACKUP', 'Respaldo de PLC, HMI y variadores'],
  ['FAT_REPORT', 'Protocolo e informe FAT'],
  ['SAT_REPORT', 'Protocolo e informe SAT'],
  ['OPERATION_MANUAL', 'Manual de operación'],
  ['MAINTENANCE_MANUAL', 'Manual de mantenimiento'],
  ['CERTIFICATES', 'Certificados y declaraciones aplicables'],
  ['WARRANTY', 'Certificado de garantía'],
  ['SPARE_PARTS_LIST', 'Listado de repuestos recomendados'],
  ['TRAINING_RECORD', 'Registro y evidencia de capacitación'],
] as const;

@Injectable()
export class ManufacturingHandoverService {
  constructor(private readonly prisma: PrismaService) {}

  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); return actor; }
  private text(value: unknown) { const result = String(value ?? '').trim(); return result || null; }
  private date(value: unknown, label: string) { const valueText = this.text(value); if (!valueText) throw new BadRequestException(`${label} es obligatoria`); const date = new Date(valueText); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${label} no es válida`); return date; }
  private number(value: unknown, label: string, minimum = 0) { const number = Number(value); if (!Number.isFinite(number) || number < minimum) throw new BadRequestException(`${label} no es válido`); return number; }
  private version(entity: any, raw: unknown) { const version = Number(raw); if (!Number.isInteger(version) || version !== entity.lockVersion) throw new ConflictException('El expediente cambió; actualiza la pantalla'); }
  private requireAdmin(actor: Actor) { if (actor.role !== 'ADMIN') throw new ForbiddenException('Se requiere rol ADMIN'); }

  private include() { return { manufacturedUnit: true, siteDeployment: true, satExecution: { include: { deviations: true } }, asset: true, documents: { orderBy: { position: 'asc' as const } }, trainings: { orderBy: { deliveredAt: 'desc' as const } }, spares: { orderBy: { description: 'asc' as const } }, acceptance: true }; }

  async list(orderId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId);
    const order = await (this.prisma as any).manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id } } } });
    if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new NotFoundException('Orden no encontrada');
    const rows = await (this.prisma as any).manufacturingHandover.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.include(), orderBy: { manufacturedUnit: { unitNumber: 'asc' } } });
    return rows.map((row: any) => this.serialize(row));
  }

  async create(unitId: string, dto: CreateManufacturingHandoverDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturedUnit" WHERE "id" = ${unitId} FOR UPDATE`;
      const unit = await tx.manufacturedUnit.findFirst({ where: { id: unitId, tenantId }, include: { manufacturingOrder: true, asset: true, siteDeployment: true } });
      if (!unit) throw new NotFoundException('Unidad no encontrada'); orderId = unit.manufacturingOrderId;
      if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(unit.manufacturingOrder.status)) throw new ConflictException('La orden no permite crear expedientes de entrega');
      if (unit.status !== 'COMMISSIONED' || !unit.asset || !unit.siteDeployment) throw new ConflictException('La unidad debe estar comisionada y vinculada a su activo e instalación');
      const existing = await tx.manufacturingHandover.findFirst({ where: { tenantId, manufacturedUnitId: unit.id } }); if (existing) throw new ConflictException('La unidad ya tiene expediente de entrega');
      const sat = await tx.manufacturingSatExecution.findFirst({ where: { tenantId, manufacturedUnitId: unit.id }, include: { deviations: true }, orderBy: { sequence: 'desc' } });
      if (!sat || sat.status !== 'ACCEPTED' || sat.deviations.some((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status))) throw new ConflictException('El SAT debe estar aceptado completamente y sin pendientes abiertos');
      const trainingRequired = dto?.trainingRequired !== false; const handoverCode = `${unit.manufacturingOrder.number}-U${String(unit.unitNumber).padStart(2, '0')}-ENT`;
      const handover = await tx.manufacturingHandover.create({ data: { tenantId, manufacturingOrderId: orderId, manufacturedUnitId: unit.id, siteDeploymentId: unit.siteDeployment.id, satExecutionId: sat.id, assetId: unit.asset.id, handoverCode, trainingRequired, notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingHandoverDocument.createMany({ data: DOCUMENTS.map(([documentType, name], index) => {
        const automatic = documentType === 'FAT_REPORT' ? { status: 'PROVIDED', reference: `FAT ${unit.serialNumber || handoverCode}`, providedAt: new Date(), providedByUserId: actor.id, providedByName: actor.name }
          : documentType === 'SAT_REPORT' ? { status: 'PROVIDED', reference: sat.executionCode, providedAt: new Date(), providedByUserId: actor.id, providedByName: actor.name }
          : documentType === 'WARRANTY' && unit.asset.guarantee ? { status: 'PROVIDED', reference: `Garantía hasta ${unit.asset.guarantee.toISOString().slice(0, 10)}`, providedAt: new Date(), providedByUserId: actor.id, providedByName: actor.name }
          : documentType === 'TRAINING_RECORD' && !trainingRequired ? { status: 'WAIVED', waiverReason: 'Capacitación no requerida para esta entrega' }
          : {};
        return { tenantId, handoverId: handover.id, position: index + 1, documentType, name, required: documentType !== 'TRAINING_RECORD' || trainingRequired, ...automatic };
      }) });
      await this.audit(tx, tenantId, orderId, handover.id, 'MANUFACTURING_HANDOVER_CREATED', `${handoverCode}: expediente de entrega creado`, actor, { unitId, satExecutionId: sat.id, trainingRequired });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async updateDocument(documentId: string, dto: UpdateManufacturingHandoverDocumentDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); await tx.$queryRaw`SELECT "id" FROM "ManufacturingHandoverDocument" WHERE "id" = ${documentId} FOR UPDATE`;
      const document = await tx.manufacturingHandoverDocument.findFirst({ where: { id: documentId, tenantId }, include: { handover: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } } });
      if (!document) throw new NotFoundException('Documento de entrega no encontrado'); orderId = document.handover.manufacturingOrderId; this.visible(document.handover.manufacturingOrder, actor);
      if (document.handover.status !== 'DRAFT') throw new ConflictException('El expediente ya no admite cambios documentales'); this.version(document, dto?.lockVersion);
      const status = String(dto?.status || '').toUpperCase(); if (!['PENDING', 'PROVIDED', 'WAIVED'].includes(status)) throw new BadRequestException('Estado documental inválido');
      if (status === 'WAIVED') this.requireAdmin(actor);
      const reference = this.text(dto?.reference); const url = this.text(dto?.url); const waiverReason = this.text(dto?.waiverReason);
      if (status === 'PROVIDED' && !reference && !url) throw new BadRequestException('Registra una referencia o enlace del documento');
      if (status === 'WAIVED' && (!waiverReason || waiverReason.length < 5)) throw new BadRequestException('La omisión requiere una justificación');
      await tx.manufacturingHandoverDocument.update({ where: { id: document.id }, data: { status, reference: status === 'PROVIDED' ? reference : null, url: status === 'PROVIDED' ? url : null, revision: this.text(dto?.revision), notes: this.text(dto?.notes), waiverReason: status === 'WAIVED' ? waiverReason : null, providedAt: status === 'PROVIDED' ? new Date() : null, providedByUserId: status === 'PROVIDED' ? actor.id : null, providedByName: status === 'PROVIDED' ? actor.name : null, lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, document.id, 'MANUFACTURING_HANDOVER_DOCUMENT_UPDATED', `${document.name}: ${status}`, actor, { status, reference, url, waiverReason });
    }, { isolationLevel: 'Serializable' }); return this.list(orderId);
  }

  async addTraining(handoverId: string, dto: CreateManufacturingHandoverTrainingDto) {
    return this.command(handoverId, async (tx, handover, actor) => {
      if (handover.status !== 'DRAFT') throw new ConflictException('El expediente ya no admite capacitaciones');
      const topic = this.text(dto?.topic); const instructorName = this.text(dto?.instructorName); const clientContactName = this.text(dto?.clientContactName); const evidenceReference = this.text(dto?.evidenceReference);
      if (!topic || !instructorName || !clientContactName || !evidenceReference) throw new BadRequestException('Completa tema, instructor, contacto del cliente y evidencia');
      const durationHours = this.number(dto?.durationHours, 'La duración', 0.01); const attendeeCount = Math.round(this.number(dto?.attendeeCount, 'La cantidad de asistentes', 1));
      await tx.manufacturingHandoverTraining.create({ data: { tenantId: handover.tenantId, handoverId: handover.id, topic, deliveredAt: this.date(dto?.deliveredAt, 'La fecha'), durationHours, instructorName, clientContactName, attendeeCount, evidenceReference, notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingHandoverDocument.updateMany({ where: { tenantId: handover.tenantId, handoverId: handover.id, documentType: 'TRAINING_RECORD' }, data: { status: 'PROVIDED', reference: evidenceReference, providedAt: new Date(), providedByUserId: actor.id, providedByName: actor.name, waiverReason: null, lockVersion: { increment: 1 } } });
      await this.audit(tx, handover.tenantId, handover.manufacturingOrderId, handover.id, 'MANUFACTURING_HANDOVER_TRAINING_ADDED', `${handover.handoverCode}: capacitación registrada`, actor, { topic, attendeeCount, durationHours });
    });
  }

  async addSpare(handoverId: string, dto: CreateManufacturingHandoverSpareDto) {
    return this.command(handoverId, async (tx, handover, actor) => {
      if (handover.status !== 'DRAFT') throw new ConflictException('El expediente ya no admite repuestos'); const description = this.text(dto?.description); const unit = this.text(dto?.unit); if (!description || !unit) throw new BadRequestException('Descripción y unidad son obligatorias');
      const quantity = this.number(dto?.quantity, 'La cantidad', 0.000001); const recommendedStock = dto?.recommendedStock === undefined || dto?.recommendedStock === null || dto?.recommendedStock === '' ? null : this.number(dto.recommendedStock, 'El inventario recomendado');
      await tx.manufacturingHandoverSpare.create({ data: { tenantId: handover.tenantId, handoverId: handover.id, itemCode: this.text(dto?.itemCode), description, quantity, unit, recommendedStock, notes: this.text(dto?.notes) } });
      await tx.manufacturingHandoverDocument.updateMany({ where: { tenantId: handover.tenantId, handoverId: handover.id, documentType: 'SPARE_PARTS_LIST' }, data: { status: 'PROVIDED', reference: 'Listado de repuestos registrado en CMMS', providedAt: new Date(), providedByUserId: actor.id, providedByName: actor.name, waiverReason: null, lockVersion: { increment: 1 } } });
      await this.audit(tx, handover.tenantId, handover.manufacturingOrderId, handover.id, 'MANUFACTURING_HANDOVER_SPARE_ADDED', `${handover.handoverCode}: repuesto recomendado agregado`, actor, { description, quantity, unit });
    });
  }

  async removeTraining(id: string) { return this.removeChild('manufacturingHandoverTraining', id, 'capacitación'); }
  async removeSpare(id: string) { return this.removeChild('manufacturingHandoverSpare', id, 'repuesto'); }

  async markReady(handoverId: string, dto: ManufacturingHandoverVersionDto) {
    return this.command(handoverId, async (tx, handover, actor) => {
      this.requireAdmin(actor); this.version(handover, dto?.lockVersion); if (handover.status !== 'DRAFT') throw new ConflictException('Solo un expediente en preparación puede liberarse');
      if (handover.satExecution.status !== 'ACCEPTED' || handover.satExecution.deviations.some((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status))) throw new ConflictException('El SAT tiene pendientes o dejó de estar aceptado');
      const pending = handover.documents.filter((item: any) => item.required && item.status === 'PENDING'); if (pending.length) throw new ConflictException(`Faltan ${pending.length} documentos obligatorios`);
      if (handover.trainingRequired && !handover.trainings.length) throw new ConflictException('Registra la capacitación al cliente');
      await tx.manufacturingHandover.update({ where: { id: handover.id }, data: { status: 'READY_FOR_DELIVERY', readyAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit(tx, handover.tenantId, handover.manufacturingOrderId, handover.id, 'MANUFACTURING_HANDOVER_READY', `${handover.handoverCode}: expediente listo para entrega`, actor, {});
    });
  }

  async accept(handoverId: string, dto: AcceptManufacturingHandoverDto) {
    return this.command(handoverId, async (tx, handover, actor) => {
      this.requireAdmin(actor); this.version(handover, dto?.lockVersion); if (handover.status !== 'READY_FOR_DELIVERY') throw new ConflictException('El expediente no está listo para entrega');
      const clientName = this.text(dto?.clientName); const clientRole = this.text(dto?.clientRole); const clientSignature = this.text(dto?.clientSignature); if (!clientName || !clientRole || !clientSignature) throw new BadRequestException('Nombre, cargo y firma del cliente son obligatorios');
      const now = new Date(); await tx.manufacturingHandoverAcceptance.create({ data: { tenantId: handover.tenantId, handoverId: handover.id, clientName, clientRole, clientCompany: this.text(dto?.clientCompany), clientSignature, comments: this.text(dto?.comments), deliveredByUserId: actor.id, deliveredByName: actor.name, deliveredByRole: actor.role, signedAt: now } });
      await tx.manufacturingHandover.update({ where: { id: handover.id }, data: { status: 'CLOSED', closedAt: now, lockVersion: { increment: 1 } } });
      await tx.asset.update({ where: { id: handover.assetId }, data: { maintenanceTransferredAt: now } });
      const activeUnits = await tx.manufacturedUnit.count({ where: { tenantId: handover.tenantId, manufacturingOrderId: handover.manufacturingOrderId, status: { not: 'CANCELED' } } });
      const closedHandovers = await tx.manufacturingHandover.count({ where: { tenantId: handover.tenantId, manufacturingOrderId: handover.manufacturingOrderId, status: 'CLOSED', id: { not: handover.id } } });
      if (activeUnits > 0 && closedHandovers + 1 === activeUnits) await tx.manufacturingOrder.update({ where: { id: handover.manufacturingOrderId }, data: { status: 'COMPLETED', completedAt: now } });
      await this.audit(tx, handover.tenantId, handover.manufacturingOrderId, handover.id, 'MANUFACTURING_HANDOVER_ACCEPTED', `${handover.handoverCode}: entrega final aceptada`, actor, { clientName, clientRole, maintenanceTransferredAt: now, orderCompleted: closedHandovers + 1 === activeUnits });
    });
  }

  private async command(handoverId: string, handler: (tx: any, handover: any, actor: Actor) => Promise<void>) { const { tenantId, userId } = this.context(); let orderId = ''; await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); await tx.$queryRaw`SELECT "id" FROM "ManufacturingHandover" WHERE "id" = ${handoverId} FOR UPDATE`; const handover = await tx.manufacturingHandover.findFirst({ where: { id: handoverId, tenantId }, include: { ...this.include(), manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } }); if (!handover) throw new NotFoundException('Expediente de entrega no encontrado'); orderId = handover.manufacturingOrderId; this.visible(handover.manufacturingOrder, actor); if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(handover.manufacturingOrder.status)) throw new ConflictException('La orden no permite gestionar el expediente'); await handler(tx, handover, actor); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } }); }, { isolationLevel: 'Serializable' }); return this.list(orderId); }
  private visible(order: any, actor: Actor) { if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members?.length) throw new NotFoundException('Expediente de entrega no encontrado'); }
  private async removeChild(model: 'manufacturingHandoverTraining' | 'manufacturingHandoverSpare', id: string, label: string) { const { tenantId, userId } = this.context(); let orderId = ''; await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); const row = await tx[model].findFirst({ where: { id, tenantId }, include: { handover: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } } }); if (!row) throw new NotFoundException(`${label} no encontrado`); orderId = row.handover.manufacturingOrderId; this.visible(row.handover.manufacturingOrder, actor); if (row.handover.status !== 'DRAFT') throw new ConflictException('El expediente ya no admite cambios'); await tx[model].delete({ where: { id } }); await this.audit(tx, tenantId, orderId, id, 'MANUFACTURING_HANDOVER_ITEM_REMOVED', `${row.handover.handoverCode}: ${label} eliminado`, actor, {}); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } }); }, { isolationLevel: 'Serializable' }); return this.list(orderId); }
  private serialize(row: any) { const documents = row.documents || []; return { ...row, trainings: (row.trainings || []).map((item: any) => ({ ...item, durationHours: Number(item.durationHours) })), spares: (row.spares || []).map((item: any) => ({ ...item, quantity: Number(item.quantity), recommendedStock: item.recommendedStock === null ? null : Number(item.recommendedStock) })), summary: { documentCount: documents.length, providedCount: documents.filter((item: any) => item.status === 'PROVIDED').length, waivedCount: documents.filter((item: any) => item.status === 'WAIVED').length, pendingRequiredCount: documents.filter((item: any) => item.required && item.status === 'PENDING').length, trainingComplete: !row.trainingRequired || !!row.trainings?.length, spareCount: row.spares?.length || 0, progressPercent: documents.length ? Math.round(documents.filter((item: any) => item.status !== 'PENDING').length * 100 / documents.length) : 0, transferredToMaintenance: !!row.asset?.maintenanceTransferredAt } }; }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('DOCUMENT') ? 'ManufacturingHandoverDocument' : action.includes('TRAINING') ? 'ManufacturingHandoverTraining' : action.includes('SPARE') ? 'ManufacturingHandoverSpare' : action.includes('ACCEPTED') ? 'ManufacturingHandoverAcceptance' : 'ManufacturingHandover', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
