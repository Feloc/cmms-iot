import { assertIndependentApproval } from './manufacturing-approval';
import { promises as fs } from 'fs';
import { DISPATCH_CHECKLIST_BATCH_MAX_BYTES, DISPATCH_CHECKLIST_MAX_FILES, DispatchDocumentFile, DispatchDocumentMetadata, dispatchDocumentPath, storeDispatchDocument, validateDispatchDocument } from './manufacturing-dispatch-files';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CancelManufacturingDispatchDto, CreateManufacturingDispatchChecklistEvidenceDto, CreateManufacturingDispatchDocumentDto, CreateManufacturingDispatchDto, CreateManufacturingDispatchPackageDto, DeliverManufacturingDispatchDto, ExecuteManufacturingDispatchDto, ManufacturingDispatchVersionDto, UpdateManufacturingDispatchChecklistDto, UpdateManufacturingDispatchDto } from './dto/manufacturing-dispatch.dto';

type Actor = { id: string; name: string; role: string };
const PACKAGE_TYPES = new Set(['CRATE', 'PALLET', 'BOX', 'LOOSE', 'OTHER']);
const DOCUMENT_TYPES = new Set(['PACKING_LIST', 'TRANSPORT_DOCUMENT', 'COMMERCIAL_INVOICE', 'INSURANCE', 'CERTIFICATE', 'MANUAL', 'FAT_REPORT', 'OTHER']);
const DEFAULT_CHECKLIST = [
  { position: 10, name: 'Identificación y serial verificados', description: 'La placa, el serial y la documentación corresponden a la unidad.', evidenceRequired: true },
  { position: 20, name: 'Anclaje y embalaje mecánico', description: 'La máquina está inmovilizada y protegida para transporte.' },
  { position: 30, name: 'Protección ambiental', description: 'Se aplicaron barreras contra humedad, polvo y corrosión.' },
  { position: 40, name: 'Accesorios y repuestos incluidos', description: 'Los elementos sueltos están identificados dentro del despacho.' },
  { position: 50, name: 'Documentación incluida', description: 'Manuales, certificados y lista de empaque están controlados.' },
  { position: 60, name: 'Registro fotográfico final', description: 'Existe evidencia del estado y cierre del embalaje.', evidenceRequired: true },
];

@Injectable()
export class ManufacturingDispatchService {
  constructor(private readonly prisma: PrismaService) {}
  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); return actor; }
  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }
  private positive(value: unknown, label: string, nullable = false) { if (nullable && (value === undefined || value === null || value === '')) return null; const number = Number(value); if (!Number.isFinite(number) || number <= 0) throw new BadRequestException(`${label} debe ser mayor que cero`); return number; }
  private date(value: unknown) { const text = this.text(value); if (!text) return null; const date = new Date(text); if (Number.isNaN(date.getTime())) throw new BadRequestException('La fecha planeada no es válida'); return date; }
  private version(entity: any, raw: unknown) { const version = Number(raw); if (!Number.isInteger(version) || version !== entity.lockVersion) throw new ConflictException('El despacho cambió; actualiza la pantalla'); }
  private async visibleOrder(tx: any, tenantId: string, orderId: string, actor: Actor) { const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id } } } }); if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new NotFoundException('Orden de manufactura no encontrada'); return order; }
  private include() { return { manufacturedUnit: { include: { fatExecutions: { orderBy: { sequence: 'desc' }, take: 1, select: { id: true, status: true } } } }, fatExecution: { select: { id: true, executionCode: true, sequence: true, status: true, decidedAt: true } }, checklistItems: { include: { evidence: { orderBy: { createdAt: 'desc' } } }, orderBy: { position: 'asc' } }, packages: { orderBy: { sequence: 'asc' } }, documents: { orderBy: { createdAt: 'desc' } } }; }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    const order = await this.visibleOrder(this.prisma as any, tenantId, orderId, actor);
    const canOperate = actor.role === 'ADMIN' || (actor.role === 'TECH' && (order.responsibleUserId === actor.id || order.members.some((member: any) => member.userId === actor.id && member.function !== 'OBSERVER')));
    const rows = await (this.prisma as any).manufacturingDispatch.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.include(), orderBy: { manufacturedUnit: { unitNumber: 'asc' } } });
    return rows.map((row: any) => ({ ...this.serialize(row), permissions: { canOperate } }));
  }

  async create(unitId: string, dto: CreateManufacturingDispatchDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede crear despachos');
      await tx.$queryRaw`SELECT "id" FROM "ManufacturedUnit" WHERE "id" = ${unitId} FOR UPDATE`;
      const unit = await tx.manufacturedUnit.findFirst({ where: { id: unitId, tenantId }, include: { manufacturingOrder: true } }); if (!unit) throw new NotFoundException('Unidad fabricada no encontrada'); orderId = unit.manufacturingOrderId;
      if (unit.status === 'CANCELED') throw new ConflictException('La unidad está cancelada'); if (await tx.manufacturingDispatch.count({ where: { tenantId, manufacturedUnitId: unit.id } })) throw new ConflictException('La unidad ya tiene un expediente de despacho');
      const fat = await tx.manufacturingFatExecution.findFirst({ where: { tenantId, manufacturedUnitId: unit.id }, orderBy: { sequence: 'desc' } }); this.assertOrderActive(unit.manufacturingOrder);
      let responsible = actor; const requestedResponsible = this.text(dto?.responsibleUserId); if (requestedResponsible) { const user = await tx.user.findFirst({ where: { id: requestedResponsible, tenantId }, select: { id: true, name: true, role: true } }); if (!user) throw new BadRequestException('Responsable no válido'); responsible = user; }
      const dispatchCode = `${unit.manufacturingOrder.number}-U${String(unit.unitNumber).padStart(2, '0')}-DSP`;
      const dispatch = await tx.manufacturingDispatch.create({ data: { tenantId, manufacturingOrderId: orderId, manufacturedUnitId: unit.id, fatExecutionId: fat?.id ?? null, dispatchCode, serialNumberSnapshot: unit.serialNumber, destination: this.text(dto?.destination) || unit.manufacturingOrder.destination, deliveryAddress: this.text(dto?.deliveryAddress), contactName: this.text(dto?.contactName), contactPhone: this.text(dto?.contactPhone), responsibleUserId: responsible.id, responsibleName: responsible.name, plannedDispatchAt: this.date(dto?.plannedDispatchAt), notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingDispatchChecklistItem.createMany({ data: DEFAULT_CHECKLIST.map((item) => ({ tenantId, dispatchId: dispatch.id, ...item })) });
      await this.audit(tx, tenantId, orderId, dispatch.id, 'MANUFACTURING_DISPATCH_CREATED', `${dispatchCode}: expediente creado`, actor, { unitId, fatExecutionId: fat?.id ?? null }); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' }); return this.list(orderId);
  }

  async update(dispatchId: string, dto: UpdateManufacturingDispatchDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede modificar la logística'); const dispatch = await this.locked(tx, tenantId, dispatchId, actor); orderId = dispatch.manufacturingOrderId; this.version(dispatch, dto?.lockVersion); if (!['DRAFT', 'PREPARING'].includes(dispatch.status)) throw new ConflictException('El despacho ya no admite cambios logísticos'); const data: any = { lockVersion: { increment: 1 } }; for (const key of ['destination', 'deliveryAddress', 'contactName', 'contactPhone', 'carrierName', 'carrierReference', 'driverName', 'vehiclePlate', 'trackingNumber', 'notes']) if ((dto as any)[key] !== undefined) data[key] = this.text((dto as any)[key]); if (dto.plannedDispatchAt !== undefined) data.plannedDispatchAt = this.date(dto.plannedDispatchAt); if (dto.responsibleUserId !== undefined) { const id = this.text(dto.responsibleUserId); if (!id) throw new BadRequestException('El responsable es obligatorio'); const user = await tx.user.findFirst({ where: { id, tenantId }, select: { id: true, name: true } }); if (!user) throw new BadRequestException('Responsable no válido'); data.responsibleUserId = user.id; data.responsibleName = user.name; } await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data }); await this.audit(tx, tenantId, orderId, dispatch.id, 'MANUFACTURING_DISPATCH_UPDATED', `${dispatch.dispatchCode}: logística actualizada`, actor, data); }); return this.list(orderId);
  }

  async start(dispatchId: string, dto: ManufacturingDispatchVersionDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'DRAFT') throw new ConflictException('Solo un despacho en borrador puede iniciarse'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'PREPARING', lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_PREPARING', `${dispatch.dispatchCode}: preparación iniciada`, actor, {}); }); }

  async updateChecklist(itemId: string, dto: UpdateManufacturingDispatchChecklistDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const item = await this.lockedChecklist(tx, tenantId, itemId, actor);
      orderId = item.dispatch.manufacturingOrderId;
      this.version(item, dto?.lockVersion);
      const status = String(dto?.status || '').toUpperCase();
      if (!['PENDING', 'COMPLETED', 'NOT_APPLICABLE'].includes(status)) throw new BadRequestException('Estado de checklist inválido');
      if (status === 'NOT_APPLICABLE' && item.required) throw new ConflictException('Un control obligatorio no puede omitirse');
      if (status === 'NOT_APPLICABLE' && actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede omitir controles');
      const evidenceReference = dto?.evidenceReference === undefined ? item.evidenceReference : this.text(dto.evidenceReference);
      const notes = dto?.notes === undefined ? item.notes : this.text(dto.notes);
      if (status === 'COMPLETED' && item.evidenceRequired && !this.text(evidenceReference) && !item.evidence.length) throw new BadRequestException('Este control requiere un archivo o una referencia de evidencia');
      const completed = status !== 'PENDING';
      const keepCompletion = completed && status === item.status && item.completedAt;
      await tx.manufacturingDispatchChecklistItem.update({ where: { id: item.id }, data: { status, evidenceReference, notes, completedAt: completed ? keepCompletion ? item.completedAt : new Date() : null, completedByUserId: completed ? keepCompletion ? item.completedByUserId : actor.id : null, completedByName: completed ? keepCompletion ? item.completedByName : actor.name : null, lockVersion: { increment: 1 } } });
      await tx.manufacturingDispatch.update({ where: { id: item.dispatch.id }, data: { lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, item.id, 'DISPATCH_CHECKLIST_UPDATED', `${item.name}: ${status}`, actor, { status, evidenceReference, notes, evidenceCount: item.evidence.length });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  private async lockedChecklist(tx: any, tenantId: string, itemId: string, actor: Actor) {
    const lookup = await tx.manufacturingDispatchChecklistItem.findFirst({ where: { id: itemId, tenantId }, select: { dispatchId: true } });
    if (!lookup) throw new NotFoundException('Punto de checklist no encontrado');
    // Use the same first lock as closing the packaging, so evidence cannot change after closure.
    const dispatch = await this.locked(tx, tenantId, lookup.dispatchId, actor);
    this.assertOperationalDispatch(dispatch, actor);
    if (dispatch.status !== 'PREPARING') throw new ConflictException('El despacho no está en preparación');
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingDispatchChecklistItem" WHERE "id" = ${itemId} FOR UPDATE`;
    const item = await tx.manufacturingDispatchChecklistItem.findFirst({ where: { id: itemId, tenantId, dispatchId: dispatch.id }, include: { evidence: { orderBy: { createdAt: 'desc' } } } });
    if (!item) throw new NotFoundException('Punto de checklist no encontrado');
    return { ...item, dispatch };
  }

  async uploadChecklistEvidence(itemId: string, dto: CreateManufacturingDispatchChecklistEvidenceDto, file?: DispatchDocumentFile) {
    return this.uploadChecklistEvidenceBatch(itemId, dto, file ? [file] : []);
  }

  async uploadChecklistEvidenceBatch(itemId: string, dto: CreateManufacturingDispatchChecklistEvidenceDto, files?: DispatchDocumentFile[]) {
    if (!Array.isArray(files) || !files.length) throw new BadRequestException('Selecciona al menos un archivo de evidencia');
    if (files.length > DISPATCH_CHECKLIST_MAX_FILES) throw new BadRequestException('Puedes adjuntar hasta 10 archivos a la vez');
    for (const file of files) {
      try { validateDispatchDocument(file); }
      catch (error) {
        if (error instanceof BadRequestException) {
          const filename = String(file?.originalname || 'Archivo').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200);
          throw new BadRequestException(`${filename}: ${error.message}`);
        }
        throw error;
      }
    }
    if (files.reduce((size, file) => size + file.buffer.length, 0) > DISPATCH_CHECKLIST_BATCH_MAX_BYTES) throw new BadRequestException('El conjunto de archivos supera 50 MB');
    const { tenantId, userId } = this.context(); let orderId = '';
    const stored: DispatchDocumentMetadata[] = [];
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const item = await this.lockedChecklist(tx, tenantId, itemId, actor);
        orderId = item.dispatch.manufacturingOrderId;
        const title = this.text(dto?.title);
        if (!title) throw new BadRequestException('El título de la evidencia es obligatorio');
        for (const file of files) {
          const media = await storeDispatchDocument(file);
          stored.push(media);
          const evidence = await tx.manufacturingDispatchChecklistEvidence.create({ data: { tenantId, checklistItemId: item.id, title, notes: this.text(dto?.notes), ...media, createdByUserId: actor.id, createdByName: actor.name } });
          await this.audit(tx, tenantId, orderId, evidence.id, 'DISPATCH_CHECKLIST_EVIDENCE_ADDED', `${item.name}: ${title}`, actor, { checklistItemId: item.id, title, notes: this.text(dto?.notes), filename: media.filename, mimeType: media.mimeType, size: media.size });
        }
        await tx.manufacturingDispatchChecklistItem.update({ where: { id: item.id }, data: { lockVersion: { increment: 1 } } });
        await tx.manufacturingDispatch.update({ where: { id: item.dispatch.id }, data: { lockVersion: { increment: 1 } } });
      }, { isolationLevel: 'Serializable', timeout: 20000 });
    } catch (error) {
      await Promise.all(stored.map(media => fs.unlink(dispatchDocumentPath(media.storageKey)).catch(() => undefined)));
      throw error;
    }
    return this.list(orderId);
  }

  async checklistEvidenceFile(evidenceId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma, tenantId, userId);
    const evidence = await (this.prisma as any).manufacturingDispatchChecklistEvidence.findFirst({ where: { id: evidenceId, tenantId }, include: { checklistItem: { include: { dispatch: { select: { manufacturingOrderId: true } } } } } });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    await this.visibleOrder(this.prisma, tenantId, evidence.checklistItem.dispatch.manufacturingOrderId, actor);
    let location: string;
    try {
      location = dispatchDocumentPath(evidence.storageKey);
      const stat = await fs.stat(location);
      if (!stat.isFile() || stat.size !== evidence.size) throw new Error('Invalid file');
    } catch { throw new NotFoundException('Archivo no disponible en almacenamiento'); }
    return { path: location, filename: evidence.filename, mimeType: evidence.mimeType, size: evidence.size };
  }

  async removeChecklistEvidence(evidenceId: string) {
    const { tenantId, userId } = this.context(); let orderId = ''; let storageKey: string | undefined;
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const lookup = await tx.manufacturingDispatchChecklistEvidence.findFirst({ where: { id: evidenceId, tenantId } });
      if (!lookup) throw new NotFoundException('Evidencia no encontrada');
      const item = await this.lockedChecklist(tx, tenantId, lookup.checklistItemId, actor);
      const evidence = item.evidence.find((entry: any) => entry.id === evidenceId);
      if (!evidence) throw new NotFoundException('Evidencia no encontrada');
      orderId = item.dispatch.manufacturingOrderId;
      if (item.status === 'COMPLETED' && item.evidenceRequired && !this.text(item.evidenceReference) && item.evidence.length <= 1) throw new ConflictException('Este control completado requiere evidencia. Reabre el punto o registra otra evidencia antes de retirar el último archivo');
      await tx.manufacturingDispatchChecklistEvidence.delete({ where: { id: evidenceId } });
      await tx.manufacturingDispatchChecklistItem.update({ where: { id: item.id }, data: { lockVersion: { increment: 1 } } });
      await tx.manufacturingDispatch.update({ where: { id: item.dispatch.id }, data: { lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, evidence.id, 'DISPATCH_CHECKLIST_EVIDENCE_REMOVED', `${item.name}: ${evidence.title} retirada`, actor, { checklistItemId: item.id, title: evidence.title, filename: evidence.filename, mimeType: evidence.mimeType, size: evidence.size });
      storageKey = evidence.storageKey;
    }, { isolationLevel: 'Serializable' });
    if (storageKey) await fs.unlink(dispatchDocumentPath(storageKey)).catch(() => undefined);
    return this.list(orderId);
  }

  async addPackage(dispatchId: string, dto: CreateManufacturingDispatchPackageDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); const dispatch = await this.locked(tx, tenantId, dispatchId, actor); orderId = dispatch.manufacturingOrderId; if (dispatch.status !== 'PREPARING') throw new ConflictException('Los bultos solo pueden registrarse durante la preparación'); const packageType = String(dto?.packageType || '').toUpperCase(); if (!PACKAGE_TYPES.has(packageType)) throw new BadRequestException('Tipo de bulto inválido'); const description = this.text(dto?.description); if (!description) throw new BadRequestException('La descripción del bulto es obligatoria'); const grossWeightKg = this.positive(dto?.grossWeightKg, 'El peso bruto') as number; const netWeightKg = this.positive(dto?.netWeightKg, 'El peso neto', true); if (netWeightKg !== null && netWeightKg > grossWeightKg) throw new BadRequestException('El peso neto no puede superar el peso bruto'); const latest = await tx.manufacturingDispatchPackage.aggregate({ where: { tenantId, dispatchId: dispatch.id }, _max: { sequence: true } }); const sequence = Number(latest._max.sequence || 0) + 1; const row = await tx.manufacturingDispatchPackage.create({ data: { tenantId, dispatchId: dispatch.id, sequence, packageCode: `${dispatch.dispatchCode}-B${String(sequence).padStart(2, '0')}`, packageType, description, lengthCm: this.positive(dto?.lengthCm, 'El largo', true), widthCm: this.positive(dto?.widthCm, 'El ancho', true), heightCm: this.positive(dto?.heightCm, 'El alto', true), netWeightKg, grossWeightKg, serialNumber: this.text(dto?.serialNumber) || dispatch.manufacturedUnit.serialNumber, sealNumber: this.text(dto?.sealNumber), notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name } }); await this.audit(tx, tenantId, orderId, row.id, 'DISPATCH_PACKAGE_ADDED', `${row.packageCode}: bulto registrado`, actor, { grossWeightKg, packageType }); }); return this.list(orderId);
  }

  async removePackage(packageId: string) { const { tenantId, userId } = this.context(); let orderId = ''; await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); const row = await tx.manufacturingDispatchPackage.findFirst({ where: { id: packageId, tenantId } }); if (!row) throw new NotFoundException('Bulto no encontrado'); const dispatch = await this.locked(tx, tenantId, row.dispatchId, actor); orderId = dispatch.manufacturingOrderId; if (dispatch.status !== 'PREPARING') throw new ConflictException('Los bultos solo pueden retirarse durante la preparación'); await tx.manufacturingDispatchPackage.delete({ where: { id: row.id } }); await this.audit(tx, tenantId, orderId, row.id, 'DISPATCH_PACKAGE_REMOVED', `${row.packageCode}: bulto retirado`, actor, { packageCode: row.packageCode }); }); return this.list(orderId); }

  async uploadDocument(dispatchId: string, dto: CreateManufacturingDispatchDocumentDto, file?: DispatchDocumentFile) {
    validateDispatchDocument(file);
    return this.addDocument(dispatchId, dto, file);
  }

  private assertOperationalDispatch(dispatch: any, actor: Actor) {
    const order = dispatch.manufacturingOrder;
    if (actor.role !== 'ADMIN' && (actor.role !== 'TECH' || (order.responsibleUserId !== actor.id && !order.members.some((member: any) => member.userId === actor.id && member.function !== 'OBSERVER')))) throw new ForbiddenException('No tienes una función operativa en esta orden');
    this.assertOrderActive(order);
  }

  private assertDocumentEditable(dispatch: any, actor: Actor) {
    this.assertOperationalDispatch(dispatch, actor);
    if (!['PREPARING', 'READY', 'AUTHORIZED'].includes(dispatch.status)) throw new ConflictException('El despacho ya no admite cambios en documentos');
  }

  async addDocument(dispatchId: string, dto: CreateManufacturingDispatchDocumentDto, file?: DispatchDocumentFile) {
    const { tenantId, userId } = this.context(); let orderId = '';
    let media: DispatchDocumentMetadata | undefined;
    try {
      await this.prisma.$transaction(async (tx: any) => {
        const actor = await this.actor(tx, tenantId, userId);
        const dispatch = await this.locked(tx, tenantId, dispatchId, actor);
        orderId = dispatch.manufacturingOrderId;
        this.assertDocumentEditable(dispatch, actor);
        const documentType = String(dto?.documentType || '').toUpperCase();
        if (!DOCUMENT_TYPES.has(documentType)) throw new BadRequestException('Tipo de documento inválido');
        const title = this.text(dto?.title);
        if (!title) throw new BadRequestException('El título del documento es obligatorio');
        if (!file && !this.text(dto?.reference) && !this.text(dto?.url) && !this.text(dto?.notes)) throw new BadRequestException('Incluye un archivo, referencia, URL o nota');
        if (file) media = await storeDispatchDocument(file);
        const row = await tx.manufacturingDispatchDocument.create({ data: { tenantId, dispatchId: dispatch.id, documentType, title, reference: this.text(dto?.reference), url: this.text(dto?.url), notes: this.text(dto?.notes), ...media, createdByUserId: actor.id, createdByName: actor.name } });
        await this.audit(tx, tenantId, orderId, row.id, 'DISPATCH_DOCUMENT_ADDED', `${dispatch.dispatchCode}: ${title}`, actor, { documentType, reference: this.text(dto?.reference), filename: media?.filename, mimeType: media?.mimeType, size: media?.size });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (media) await fs.unlink(dispatchDocumentPath(media.storageKey)).catch(() => undefined);
      throw error;
    }
    return this.list(orderId);
  }

  async documentFile(documentId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma, tenantId, userId);
    const document = await (this.prisma as any).manufacturingDispatchDocument.findFirst({ where: { id: documentId, tenantId }, include: { dispatch: { select: { manufacturingOrderId: true } } } });
    if (!document?.storageKey) throw new NotFoundException('Archivo no encontrado');
    await this.visibleOrder(this.prisma, tenantId, document.dispatch.manufacturingOrderId, actor);
    let location: string;
    try {
      location = dispatchDocumentPath(document.storageKey);
      const stat = await fs.stat(location);
      if (!stat.isFile() || stat.size !== document.size) throw new Error('Invalid file');
    } catch { throw new NotFoundException('Archivo no disponible en almacenamiento'); }
    return { path: location, filename: document.filename, mimeType: document.mimeType, size: document.size };
  }

  async removeDocument(documentId: string) {
    const { tenantId, userId } = this.context(); let orderId = ''; let storageKey: string | undefined;
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const row = await tx.manufacturingDispatchDocument.findFirst({ where: { id: documentId, tenantId } });
      if (!row) throw new NotFoundException('Documento no encontrado');
      const dispatch = await this.locked(tx, tenantId, row.dispatchId, actor);
      orderId = dispatch.manufacturingOrderId;
      this.assertDocumentEditable(dispatch, actor);
      await tx.manufacturingDispatchDocument.delete({ where: { id: row.id } });
      await this.audit(tx, tenantId, orderId, row.id, 'DISPATCH_DOCUMENT_REMOVED', `${dispatch.dispatchCode}: ${row.title} retirado`, actor, { documentType: row.documentType, filename: row.filename, mimeType: row.mimeType, size: row.size });
      storageKey = row.storageKey;
    }, { isolationLevel: 'Serializable' });
    if (storageKey) await fs.unlink(dispatchDocumentPath(storageKey)).catch(() => undefined);
    return this.list(orderId);
  }

  async markReady(dispatchId: string, dto: ManufacturingDispatchVersionDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'PREPARING') throw new ConflictException('El despacho no está en preparación'); if (!dispatch.manufacturedUnit.serialNumber) throw new ConflictException('Asigna el serial de la unidad antes de cerrar el embalaje'); if (!this.text(dispatch.destination) || !this.text(dispatch.deliveryAddress) || !this.text(dispatch.carrierName)) throw new ConflictException('Completa destino, dirección y transportista'); if (!dispatch.packages.length) throw new ConflictException('Registra al menos un bulto'); if (dispatch.checklistItems.some((item: any) => item.status === 'PENDING' || (item.required && item.status !== 'COMPLETED'))) throw new ConflictException('Completa todos los controles de embalaje'); if (dispatch.checklistItems.some((item: any) => item.status === 'COMPLETED' && item.evidenceRequired && !this.text(item.evidenceReference) && !item.evidence?.length)) throw new ConflictException('Cada control con evidencia obligatoria requiere un archivo o una referencia antes de cerrar el embalaje'); if (!dispatch.documents.some((item: any) => item.documentType === 'PACKING_LIST')) throw new ConflictException('Adjunta la referencia de la lista de empaque'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'READY', serialNumberSnapshot: dispatch.manufacturedUnit.serialNumber, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_READY', `${dispatch.dispatchCode}: embalaje listo`, actor, {}); }); }

  async authorize(dispatchId: string, dto: ManufacturingDispatchVersionDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede autorizar la salida'); this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'READY') throw new ConflictException('El despacho no está listo para autorizar');  assertIndependentApproval(actor.id, [dispatch.createdByUserId, ...dispatch.checklistItems.map((item: any) => item.completedByUserId)], dto.approvalExceptionReason); if (dto.approvalExceptionReason) await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_APPROVAL_EXCEPTION', dto.approvalExceptionReason, actor, { reason: dto.approvalExceptionReason }); const latestFat = await tx.manufacturingFatExecution.findFirst({ where: { tenantId: dispatch.tenantId, manufacturedUnitId: dispatch.manufacturedUnitId }, orderBy: { sequence: 'desc' } }); if (!latestFat || latestFat.status !== 'APPROVED') throw new ConflictException('La salida requiere que el FAT más reciente de la unidad esté aprobado'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'AUTHORIZED', fatExecutionId: latestFat.id, authorizedAt: new Date(), authorizedByUserId: actor.id, authorizedByName: actor.name, authorizedByRole: actor.role, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_AUTHORIZED', `${dispatch.dispatchCode}: salida autorizada`, actor, { fatExecutionId: latestFat.id }); }); }

  async dispatch(dispatchId: string, dto: ExecuteManufacturingDispatchDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'AUTHORIZED') throw new ConflictException('La salida no está autorizada'); const latestFat = await tx.manufacturingFatExecution.findFirst({ where: { tenantId: dispatch.tenantId, manufacturedUnitId: dispatch.manufacturedUnitId }, orderBy: { sequence: 'desc' } }); if (!latestFat || latestFat.status !== 'APPROVED') throw new ConflictException('La salida requiere que el FAT más reciente de la unidad esté aprobado'); if (latestFat.id !== dispatch.fatExecutionId) throw new ConflictException('El FAT cambió desde la autorización. Cancela y reabre el expediente para autorizarlo nuevamente'); if (!dispatch.documents.some((item: any) => item.documentType === 'TRANSPORT_DOCUMENT')) throw new ConflictException('Registra el documento de transporte antes de la salida'); const trackingNumber = this.text(dto?.trackingNumber); if (!trackingNumber) throw new BadRequestException('La guía o número de seguimiento es obligatorio'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'DISPATCHED', trackingNumber, driverName: this.text(dto?.driverName) || dispatch.driverName, vehiclePlate: this.text(dto?.vehiclePlate) || dispatch.vehiclePlate, carrierReference: this.text(dto?.carrierReference) || dispatch.carrierReference, notes: this.text(dto?.notes) || dispatch.notes, dispatchedAt: new Date(), dispatchedByUserId: actor.id, dispatchedByName: actor.name, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_DISPATCHED', `${dispatch.dispatchCode}: unidad despachada`, actor, { trackingNumber }); }); }

  async deliver(dispatchId: string, dto: DeliverManufacturingDispatchDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'DISPATCHED') throw new ConflictException('La unidad no está en tránsito'); const receivedByName = this.text(dto?.receivedByName); const proof = this.text(dto?.proofReference); if (!receivedByName || !proof) throw new BadRequestException('Registra receptor y soporte de entrega'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), receivedByName, deliveryProofReference: proof, notes: this.text(dto?.notes) || dispatch.notes, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_DELIVERED', `${dispatch.dispatchCode}: entrega confirmada`, actor, { receivedByName, proof }); }); }

  async cancel(dispatchId: string, dto: CancelManufacturingDispatchDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede cancelar el despacho'); this.version(dispatch, dto?.lockVersion); if (['DISPATCHED', 'DELIVERED', 'CANCELED'].includes(dispatch.status)) throw new ConflictException('El despacho ya no puede cancelarse'); const reason = this.text(dto?.reason); if (!reason || reason.length < 5) throw new BadRequestException('La cancelación requiere un motivo'); await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: reason, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_CANCELED', `${dispatch.dispatchCode}: despacho cancelado`, actor, { reason }); }); }

  async reopen(dispatchId: string, dto: ManufacturingDispatchVersionDto) { return this.command(dispatchId, async (tx, dispatch, actor) => { if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede reabrir el despacho'); this.version(dispatch, dto?.lockVersion); if (dispatch.status !== 'CANCELED') throw new ConflictException('Solo un despacho cancelado puede reabrirse');  await tx.manufacturingDispatch.update({ where: { id: dispatch.id }, data: { status: 'DRAFT', fatExecutionId: null, canceledAt: null, canceledReason: null, authorizedAt: null, authorizedByUserId: null, authorizedByName: null, authorizedByRole: null, lockVersion: { increment: 1 } } }); await this.audit(tx, dispatch.tenantId, dispatch.manufacturingOrderId, dispatch.id, 'MANUFACTURING_DISPATCH_REOPENED', `${dispatch.dispatchCode}: despacho reabierto`, actor, {}); }); }

  private assertOrderActive(order: any) { if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(order.status)) throw new ConflictException('La orden no permite gestionar el despacho'); }

  private async command(dispatchId: string, handler: (tx: any, dispatch: any, actor: Actor) => Promise<void>) { const { tenantId, userId } = this.context(); let orderId = ''; await this.prisma.$transaction(async (tx: any) => { const actor = await this.actor(tx, tenantId, userId); const dispatch = await this.locked(tx, tenantId, dispatchId, actor); orderId = dispatch.manufacturingOrderId; if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(dispatch.manufacturingOrder.status)) throw new ConflictException('La orden no permite gestionar el despacho'); await handler(tx, dispatch, actor); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } }); }, { isolationLevel: 'Serializable' }); return this.list(orderId); }
  private async locked(tx: any, tenantId: string, dispatchId: string, actor: Actor) { await tx.$queryRaw`SELECT "id" FROM "ManufacturingDispatch" WHERE "id" = ${dispatchId} FOR UPDATE`; const dispatch = await tx.manufacturingDispatch.findFirst({ where: { id: dispatchId, tenantId }, include: { ...this.include(), manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } }); if (!dispatch) throw new NotFoundException('Despacho no encontrado'); if (actor.role === 'TECH' && dispatch.manufacturingOrder.responsibleUserId !== actor.id && !dispatch.manufacturingOrder.members.length) throw new NotFoundException('Despacho no encontrado'); return dispatch; }
  private serialize(dispatch: any) { const packages = dispatch.packages.map((item: any) => ({ ...item, lengthCm: item.lengthCm === null ? null : Number(item.lengthCm), widthCm: item.widthCm === null ? null : Number(item.widthCm), heightCm: item.heightCm === null ? null : Number(item.heightCm), netWeightKg: item.netWeightKg === null ? null : Number(item.netWeightKg), grossWeightKg: Number(item.grossWeightKg) })); return { ...dispatch, packages, summary: { checklistCount: dispatch.checklistItems.length, checklistCompletedCount: dispatch.checklistItems.filter((item: any) => item.status !== 'PENDING').length, checklistPendingCount: dispatch.checklistItems.filter((item: any) => item.status === 'PENDING').length, packageCount: packages.length, grossWeightKg: packages.reduce((sum: number, item: any) => sum + item.grossWeightKg, 0), documentCount: dispatch.documents.length, fatGateOpen: dispatch.manufacturedUnit.fatExecutions?.[0]?.status === 'APPROVED', progressPercent: dispatch.checklistItems.length ? Math.round(dispatch.checklistItems.filter((item: any) => item.status !== 'PENDING').length * 100 / dispatch.checklistItems.length) : 0 } }; }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('CHECKLIST_EVIDENCE') ? 'ManufacturingDispatchChecklistEvidence' : action.includes('CHECKLIST') ? 'ManufacturingDispatchChecklistItem' : action.includes('PACKAGE') ? 'ManufacturingDispatchPackage' : action.includes('DOCUMENT') ? 'ManufacturingDispatchDocument' : 'ManufacturingDispatch', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
