import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { assertFatFindingTransition, assertFatReady, FAT_OPEN_FINDING_STATUSES, isBlockingFatFinding } from './manufacturing-fat-findings.domain';
import { assertIndependentApproval } from './manufacturing-approval';
import { normalizeFatSubpoint } from './manufacturing-fat-subpoints.domain';
import { CreateManufacturingFatSubpointDto, VoidManufacturingFatSubpointDto } from './dto/manufacturing-fat.dto';
import { promises as fs } from 'fs';
import { fatMediaPath, FatMediaFile, FatMediaMetadata, storeFatMedia, validateFatMedia } from './manufacturing-fat-media';
import { CreateManufacturingFatDeviationDto, CreateManufacturingFatEvidenceDto, CreateManufacturingFatExecutionDto, CreateManufacturingFatTemplateDto, DecideManufacturingFatDto, ManufacturingFatVersionDto, RecordManufacturingFatCaseDto, UpdateManufacturingFatDeviationDto } from './dto/manufacturing-fat.dto';

type Actor = { id: string; name: string; role: string };
const RESULT_TYPES = new Set(['BOOLEAN', 'NUMERIC', 'TEXT']);
const CASE_RESULTS = new Set(['PASS', 'FAIL', 'NOT_APPLICABLE']);


@Injectable()
export class ManufacturingFatService {
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
  private text(value: unknown) { const valueText = String(value ?? '').trim(); return valueText || null; }
  private number(value: unknown, label: string) { const numberValue = Number(value); if (!Number.isFinite(numberValue)) throw new BadRequestException(`${label} no es válido`); return numberValue; }
  private version(entity: any, raw: unknown) { const version = Number(raw); if (!Number.isInteger(version) || version !== entity.lockVersion) throw new ConflictException('El registro cambió; actualiza la pantalla'); }
  private async visibleOrder(tx: any, tenantId: string, orderId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id } } } });
    if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new NotFoundException('Orden de manufactura no encontrada');
    return order;
  }
  private include() {
    return {
      manufacturedUnit: true,
      assemblyExecution: { select: { id: true, executionCode: true, status: true, completedAt: true } },
      cases: { include: { evidence: { where: { deviationId: null }, orderBy: { createdAt: 'desc' } }, deviations: { include: { evidence: { orderBy: { createdAt: 'desc' } } }, orderBy: { sequence: 'asc' } } }, orderBy: { position: 'asc' } },
      approvals: { orderBy: { signedAt: 'desc' } },
    };
  }

  async listTemplates(rawActive?: string) {
    const { tenantId, userId } = this.context();
    await this.actor(this.prisma as any, tenantId, userId);
    const active = rawActive === undefined ? undefined : String(rawActive).toLowerCase() === 'true';
    return (this.prisma as any).manufacturingFatTemplate.findMany({ where: { tenantId, ...(active === undefined ? {} : { active }) }, include: { cases: { orderBy: { position: 'asc' } } }, orderBy: [{ name: 'asc' }, { version: 'desc' }] });
  }

  async createTemplate(dto: CreateManufacturingFatTemplateDto) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede crear protocolos FAT');
    const code = String(dto?.code || '').trim().toUpperCase().replace(/\s+/g, '-');
    const name = this.text(dto?.name);
    if (!code || !name) throw new BadRequestException('Código y nombre son obligatorios');
    if (!Array.isArray(dto?.cases) || !dto.cases.length) throw new BadRequestException('El protocolo requiere al menos un caso de prueba');
    const subpointCount = dto.cases.reduce((n, c) => n + (c.subpoints?.length || 0), 0);
    if (dto.cases.length + subpointCount > 1000) throw new BadRequestException('El protocolo admite hasta 1000 puntos y subpuntos en total');
    const positions = new Set<number>();
    const cases = dto.cases.map((item, index) => {
      const position = Number(item.position ?? index + 1);
      if (!Number.isInteger(position) || position < 1 || position > 2147483647 - subpointCount || positions.has(position)) throw new BadRequestException('Las posiciones deben ser enteros positivos únicos y dejar espacio para los subpuntos');
      positions.add(position);
      const caseName = this.text(item.name); const criteria = this.text(item.acceptanceCriteria);
      if (!caseName || !criteria) throw new BadRequestException(`El caso ${position} requiere nombre y criterio de aceptación`);
      const resultType = String(item.resultType || 'BOOLEAN').toUpperCase();
      if (!RESULT_TYPES.has(resultType)) throw new BadRequestException(`Tipo de resultado inválido en el caso ${position}`);
      const minimumValue = item.minimumValue === undefined || item.minimumValue === null || item.minimumValue === '' ? null : this.number(item.minimumValue, 'Valor mínimo');
      const maximumValue = item.maximumValue === undefined || item.maximumValue === null || item.maximumValue === '' ? null : this.number(item.maximumValue, 'Valor máximo');
      if (resultType === 'NUMERIC' && minimumValue === null && maximumValue === null) throw new BadRequestException(`El caso numérico ${position} requiere un límite`);
      if (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue) throw new BadRequestException(`El rango del caso ${position} no es válido`);
      if (item.subpoints && (!Array.isArray(item.subpoints) || item.subpoints.length > 50)) throw new BadRequestException('Cada punto admite hasta 50 subpuntos');
      const subpoints = (item.subpoints || []).map(normalizeFatSubpoint);
      return { tenantId, position, section: this.text(item.section), name: caseName, instructions: this.text(item.instructions), acceptanceCriteria: criteria, resultType, minimumValue, maximumValue, unit: this.text(item.unit), required: item.required !== false, evidenceRequired: item.evidenceRequired === true, subpoints };
    });
    return this.prisma.$transaction(async (tx: any) => {
      const latest = await tx.manufacturingFatTemplate.aggregate({ where: { tenantId, code }, _max: { version: true } });
      const template = await tx.manufacturingFatTemplate.create({ data: { tenantId, code, name, description: this.text(dto.description), version: Number(latest._max.version || 0) + 1, createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingFatTemplateCase.createMany({ data: cases.map((item) => ({ ...item, templateId: template.id })) });
      return tx.manufacturingFatTemplate.findUnique({ where: { id: template.id }, include: { cases: { orderBy: { position: 'asc' } } } });
    }, { isolationLevel: 'Serializable' });
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId);
    const order = await this.visibleOrder(this.prisma as any, tenantId, orderId, actor);
    const rows = await (this.prisma as any).manufacturingFatExecution.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.include(), orderBy: [{ manufacturedUnit: { unitNumber: 'asc' } }, { sequence: 'desc' }] });
    const ids = rows.flatMap((row: any) => row.cases.flatMap((c: any) => c.deviations.map((d: any) => d.id)));
    const events = ids.length ? await this.prisma.manufacturingAuditEvent.findMany({ where: { tenantId, entityType: 'ManufacturingFatDeviation', entityId: { in: ids } }, select: { id: true, entityId: true, createdAt: true, actorName: true, summary: true, afterData: true }, orderBy: { createdAt: 'asc' } }) : [];
    for (const row of rows) for (const c of row.cases) for (const d of c.deviations) d.history = events.filter(e => e.entityId === d.id);
    const caseIds = rows.flatMap((r: any) => r.cases.map((c: any) => c.id));
    const history = caseIds.length ? await this.prisma.manufacturingAuditEvent.findMany({ where: { tenantId, entityType: 'ManufacturingFatCase', entityId: { in: caseIds } }, select: { id: true, entityId: true, createdAt: true, actorName: true, summary: true, afterData: true }, orderBy: { createdAt: 'asc' } }) : [];
    for (const row of rows) for (const c of row.cases) c.history = history.filter(e => e.entityId === c.id);
    return rows.map((row: any) => ({ ...this.serialize(row), permissions: this.permissions(order, actor) }));
  }

  private permissions(order: any, actor: Actor) {
    const operational = order.responsibleUserId === actor.id || order.members.some((m: any) => m.userId === actor.id && m.function !== 'OBSERVER');
    return {
      canOperate: actor.role === 'ADMIN' || (actor.role === 'TECH' && operational),
      canVerify: actor.role === 'ADMIN' || (actor.role === 'TECH' && (order.responsibleUserId === actor.id || order.members.some((m: any) => m.userId === actor.id && m.function === 'REVIEWER'))),
    };
  }
  async findingAssignees(orderId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma, tenantId, userId);
    await this.visibleOrder(this.prisma, tenantId, orderId, actor);
    const order = await this.prisma.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: true } });
    const ids = [order!.responsibleUserId, ...order!.members.filter(m => m.function !== 'OBSERVER').map(m => m.userId)];
    return this.prisma.user.findMany({ where: { tenantId, OR: [{ role: 'ADMIN' }, { role: 'TECH', id: { in: ids } }] }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
  private async assignment(tx: any, tenantId: string, orderId: string, dto: { responsibleUserId?: string | null; dueAt?: string | null }) {
    const data: any = {};
    if (dto.responsibleUserId !== undefined) {
      const id = this.text(dto.responsibleUserId);
      const user = id ? await tx.user.findFirst({ where: { id, tenantId }, select: { id: true, name: true, role: true } }) : null;
      if (id && !user) throw new BadRequestException('Responsable no válido para este tenant');
      if (user && user.role !== 'ADMIN') {
        const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: id, function: { not: 'OBSERVER' } } } } });
        if (user.role !== 'TECH' || (order.responsibleUserId !== id && !order.members.length)) throw new BadRequestException('El responsable debe tener acceso operativo a la orden');
      }
      data.responsibleUserId = user?.id || null; data.responsibleName = user?.name || null;
    }
    if (dto.dueAt !== undefined) {
      const value = this.text(dto.dueAt); const date = value ? new Date(value) : null;
      if (date && !Number.isFinite(date.getTime())) throw new BadRequestException('Fecha compromiso inválida');
      data.dueAt = date;
    }
    return data;
  }
  private async bumpExecution(tx: any, fatCase: any) {
    await tx.manufacturingFatExecution.update({ where: { id: fatCase.executionId }, data: { lockVersion: { increment: 1 } } });
    await tx.manufacturingOrder.update({ where: { id: fatCase.execution.manufacturingOrderId }, data: { version: { increment: 1 } } });
  }

  async dispatchReadiness(unitId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId);
    const unit = await (this.prisma as any).manufacturedUnit.findFirst({ where: { id: unitId, tenantId }, include: { manufacturingOrder: true } });
    if (!unit) throw new NotFoundException('Unidad fabricada no encontrada'); await this.visibleOrder(this.prisma as any, tenantId, unit.manufacturingOrderId, actor);
    const assembly = await (this.prisma as any).manufacturingAssemblyExecution.findFirst({ where: { tenantId, kit: { manufacturedUnitId: unit.id } }, select: { id: true, executionCode: true, status: true, completedAt: true } });
    const fat = await (this.prisma as any).manufacturingFatExecution.findFirst({ where: { tenantId, manufacturedUnitId: unit.id }, orderBy: { sequence: 'desc' }, select: { id: true, executionCode: true, sequence: true, status: true, decidedAt: true } });
    const reasons: string[] = [];
    if (!assembly || assembly.status !== 'COMPLETED') reasons.push('ASSEMBLY_NOT_COMPLETED');
    if (!fat) reasons.push('FAT_NOT_CREATED'); else if (fat.status !== 'APPROVED') reasons.push(`FAT_${fat.status}`);
    return { unitId: unit.id, manufacturingOrderId: unit.manufacturingOrderId, gate: 'FAT_APPROVED', ready: reasons.length === 0, reasons, assemblyExecution: assembly, fatExecution: fat };
  }

  async createExecution(unitId: string, dto: CreateManufacturingFatExecutionDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede crear ejecuciones FAT');
      await tx.$queryRaw`SELECT "id" FROM "ManufacturedUnit" WHERE "id" = ${unitId} FOR UPDATE`;
      const unit = await tx.manufacturedUnit.findFirst({ where: { id: unitId, tenantId }, include: { manufacturingOrder: true } });
      if (!unit) throw new NotFoundException('Unidad fabricada no encontrada'); orderId = unit.manufacturingOrderId;
      if (unit.status === 'CANCELED') throw new ConflictException('La unidad está cancelada');
      const assembly = await tx.manufacturingAssemblyExecution.findFirst({ where: { tenantId, manufacturingOrderId: orderId, kit: { manufacturedUnitId: unit.id } } });
      if (!assembly || assembly.status !== 'COMPLETED') throw new ConflictException('El ensamble de la unidad debe estar completado antes del FAT');
      const current = await tx.manufacturingFatExecution.findFirst({ where: { tenantId, manufacturedUnitId: unit.id }, orderBy: { sequence: 'desc' } });
      if (current && !['REJECTED', 'CANCELED'].includes(current.status)) throw new ConflictException(current.status === 'APPROVED' ? 'La unidad ya tiene un FAT aprobado' : 'La unidad ya tiene un FAT activo');
      const template = await tx.manufacturingFatTemplate.findFirst({ where: { id: String(dto?.templateId || ''), tenantId, active: true }, include: { cases: { orderBy: { position: 'asc' } } } });
      if (!template || !template.cases.length) throw new ConflictException('Selecciona un protocolo FAT activo con casos');
      const sequence = Number(current?.sequence || 0) + 1;
      const executionCode = `${unit.manufacturingOrder.number}-U${String(unit.unitNumber).padStart(2, '0')}-FAT-${sequence}`;
      const execution = await tx.manufacturingFatExecution.create({ data: { tenantId, manufacturingOrderId: orderId, manufacturedUnitId: unit.id, assemblyExecutionId: assembly.id, templateId: template.id, sequence, executionCode, templateCode: template.code, templateName: template.name, templateVersion: template.version, createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingFatCase.createMany({ data: template.cases.map((item: any) => ({ tenantId, executionId: execution.id, templateCaseId: item.id, position: item.position, section: item.section, name: item.name, instructions: item.instructions, acceptanceCriteria: item.acceptanceCriteria, resultType: item.resultType, minimumValue: item.minimumValue, maximumValue: item.maximumValue, unit: item.unit, required: item.required, evidenceRequired: item.evidenceRequired })) });
      const parents = await tx.manufacturingFatCase.findMany({ where: { tenantId, executionId: execution.id } });
      let childPosition = Math.max(...template.cases.map((c: any) => c.position));
      const childRows: any[] = [];
      for (const item of template.cases) {
        const parent = parents.find((p: any) => p.templateCaseId === item.id);
        for (const subpoint of item.subpoints || []) childRows.push({ ...normalizeFatSubpoint(subpoint), tenantId, executionId: execution.id, templateCaseId: item.id, parentCaseId: parent.id, position: ++childPosition, section: item.section });
      }
      if (childRows.length) await tx.manufacturingFatCase.createMany({ data: childRows });
      await this.audit(tx, tenantId, orderId, execution.id, 'MANUFACTURING_FAT_CREATED', `${executionCode}: FAT creado`, actor, { unitId, templateId: template.id, cases: template.cases.length });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  private async invalidateParent(tx: any, child: any, actor: Actor, reason: string) {
    const parent = await tx.manufacturingFatCase.findFirst({ where: { id: child.parentCaseId, tenantId: child.tenantId, executionId: child.executionId } });
    if (!parent) throw new ConflictException('No se encontró el punto principal del subpunto');
    await tx.manufacturingFatCase.update({ where: { id: parent.id }, data: { result: 'PENDING', measuredValue: null, observedValue: null, testedAt: null, testedByUserId: null, testedByName: null, lockVersion: { increment: 1 } } });
    await this.audit(tx, parent.tenantId, child.execution.manufacturingOrderId, parent.id, 'FAT_CASE_REVIEW_REQUIRED', `${parent.name}: requiere evaluación final`, actor, { reason, subpointId: child.id, previousResult: parent.result, previousMeasuredValue: parent.measuredValue, previousObservedValue: parent.observedValue, previousNotes: parent.notes, previousTestedByName: parent.testedByName, previousTestedAt: parent.testedAt });
  }

  async createSubpoint(parentId: string, dto: CreateManufacturingFatSubpointDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const parent = await this.lockedCase(tx, tenantId, parentId, actor); orderId = parent.execution.manufacturingOrderId;
      this.version(parent, dto.lockVersion);
      if (parent.parentCaseId) throw new ConflictException('Solo se permite un nivel de subpuntos');
      if (parent.execution.status !== 'IN_PROGRESS') throw new ConflictException('Solo puedes agregar subpuntos durante la ejecución del FAT');
      const reason = this.text(dto.reason);
      if (!reason || reason.length < 5) throw new BadRequestException('Describe por qué se agrega el subpunto (mínimo 5 caracteres)');
      if (await tx.manufacturingFatCase.count({ where: { tenantId, parentCaseId: parent.id } }) >= 50) throw new ConflictException('El punto ya tiene 50 subpuntos, incluyendo anulados');
      if (await tx.manufacturingFatCase.count({ where: { tenantId, executionId: parent.executionId } }) >= 1000) throw new ConflictException('El FAT admite hasta 1000 puntos y subpuntos');
      const latest = await tx.manufacturingFatCase.aggregate({ where: { tenantId, executionId: parent.executionId }, _max: { position: true } });
      if (latest._max.position >= 2147483647) throw new ConflictException('No queda espacio de numeración para nuevos subpuntos');
      const child = await tx.manufacturingFatCase.create({ data: { ...normalizeFatSubpoint(dto), tenantId, executionId: parent.executionId, parentCaseId: parent.id, position: latest._max.position + 1, section: parent.section, origin: 'EXECUTION', addedByUserId: actor.id, addedByName: actor.name, additionReason: reason } });
      if (child.required) await this.invalidateParent(tx, { ...child, execution: parent.execution }, actor, 'Se agregó un subpunto obligatorio');
      else await tx.manufacturingFatCase.update({ where: { id: parent.id }, data: { lockVersion: { increment: 1 } } });
      await this.bumpExecution(tx, parent);
      await this.audit(tx, tenantId, orderId, child.id, 'FAT_CASE_SUBPOINT_ADDED', `${parent.name}: agregado ${child.name}`, actor, { parentCaseId: parent.id, reason, ...normalizeFatSubpoint(dto) });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async voidSubpoint(caseId: string, dto: VoidManufacturingFatSubpointDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo ADMIN puede autorizar la anulación de un subpunto');
      const child = await this.lockedCase(tx, tenantId, caseId, actor); orderId = child.execution.manufacturingOrderId;
      this.version(child, dto.lockVersion);
      if (!child.parentCaseId) throw new ConflictException('Solo pueden anularse subpuntos');
      if (child.execution.status !== 'IN_PROGRESS') throw new ConflictException('La estructura está bloqueada fuera de la ejecución del FAT');
      const reason = this.text(dto.reason);
      if (!reason || reason.length < 10) throw new BadRequestException('Justifica la anulación con al menos 10 caracteres');
      if (await tx.manufacturingFatDeviation.count({ where: { tenantId, fatCaseId: caseId, status: { in: FAT_OPEN_FINDING_STATUSES } } })) throw new ConflictException('Cierra las novedades del subpunto antes de anularlo; no se pueden ocultar pendientes');
      await tx.manufacturingFatCase.update({ where: { id: caseId }, data: { voidedAt: new Date(), voidedByUserId: actor.id, voidedByName: actor.name, voidReason: reason, lockVersion: { increment: 1 } } });
      await this.invalidateParent(tx, child, actor, 'Se anuló un subpunto; revisa el alcance restante');
      await this.bumpExecution(tx, child);
      await this.audit(tx, tenantId, orderId, child.id, 'FAT_CASE_SUBPOINT_VOIDED', `${child.name}: subpunto anulado`, actor, { reason, previousResult: child.result });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async start(executionId: string, dto: ManufacturingFatVersionDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      this.version(execution, dto?.lockVersion); if (execution.status !== 'DRAFT') throw new ConflictException('Solo un FAT en borrador puede iniciarse');
      await tx.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, 'MANUFACTURING_FAT_STARTED', `${execution.executionCode}: FAT iniciado`, actor, {});
    });
  }

  async recordCase(caseId: string, dto: RecordManufacturingFatCaseDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const fatCase = await this.lockedCase(tx, tenantId, caseId, actor); orderId = fatCase.execution.manufacturingOrderId;
      this.version(fatCase, dto?.lockVersion); if (fatCase.execution.status !== 'IN_PROGRESS') throw new ConflictException('El FAT no está en ejecución');
      let result = String(dto?.result || '').toUpperCase(); let measuredValue: number | null = null; const observedValue = this.text(dto?.observedValue); const notes = this.text(dto?.notes);
      if (fatCase.resultType === 'NUMERIC' && result !== 'NOT_APPLICABLE') {
        if (dto.measuredValue === undefined || dto.measuredValue === null || String(dto.measuredValue).trim() === '') throw new BadRequestException('Registra la medición');
        measuredValue = this.number(dto?.measuredValue, 'La medición');
        result = (fatCase.minimumValue === null || measuredValue >= Number(fatCase.minimumValue)) && (fatCase.maximumValue === null || measuredValue <= Number(fatCase.maximumValue)) ? 'PASS' : 'FAIL';
      } else {
        if (!CASE_RESULTS.has(result)) throw new BadRequestException('Selecciona un resultado válido');
        if (fatCase.resultType === 'TEXT' && result !== 'NOT_APPLICABLE' && !observedValue) throw new BadRequestException('Registra el valor observado');
      }
      if (result === 'NOT_APPLICABLE' && fatCase.required) throw new ConflictException('Un caso obligatorio no puede marcarse como no aplicable');
      if (result === 'FAIL' && (!notes || notes.length < 5)) throw new BadRequestException('Un resultado no conforme requiere una observación de al menos 5 caracteres');
      if (result !== 'FAIL') {
        const children = await tx.manufacturingFatCase.findMany({ where: { tenantId, parentCaseId: fatCase.id }, include: { evidence: { where: { deviationId: null } }, deviations: true } });
        if (result === 'NOT_APPLICABLE' && children.some((c: any) => !c.voidedAt && c.required)) throw new ConflictException('El punto tiene subpuntos obligatorios y no puede omitirse');
        assertFatReady(children);
        const open = await tx.manufacturingFatDeviation.count({ where: { tenantId, fatCaseId: fatCase.id, kind: 'NON_CONFORMITY', status: { in: FAT_OPEN_FINDING_STATUSES } } });
        if (open) throw new ConflictException('Resuelve el retrabajo antes de registrar una nueva prueba conforme');
      }
      await tx.manufacturingFatCase.update({ where: { id: fatCase.id }, data: { result, measuredValue, observedValue, notes, testedAt: new Date(), testedByUserId: actor.id, testedByName: actor.name, lockVersion: { increment: 1 } } });
      if (result === 'FAIL') {
        const open = await tx.manufacturingFatDeviation.findFirst({ where: { tenantId, fatCaseId: fatCase.id, kind: 'NON_CONFORMITY', status: { in: FAT_OPEN_FINDING_STATUSES } } });
        if (!open) {
          const latest = await tx.manufacturingFatDeviation.aggregate({ where: { tenantId, executionId: fatCase.executionId }, _max: { sequence: true } }); const sequence = Number(latest._max.sequence || 0) + 1;
          await tx.manufacturingFatDeviation.create({ data: { tenantId, executionId: fatCase.executionId, fatCaseId: fatCase.id, sequence, deviationCode: `${fatCase.execution.executionCode}-D${String(sequence).padStart(2, '0')}`, title: `No conformidad: ${fatCase.name}`, description: notes, openedByUserId: actor.id, openedByName: actor.name } });
        }
      }
      await this.bumpExecution(tx, fatCase);
      await this.audit(tx, tenantId, orderId, fatCase.id, 'FAT_CASE_RECORDED', `${fatCase.name}: ${result}`, actor, { result, measuredValue, observedValue, notes });
      if (fatCase.parentCaseId) await this.invalidateParent(tx, fatCase, actor, 'Se registró o repitió un subpunto');
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async createDeviation(caseId: string, dto: CreateManufacturingFatDeviationDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const fatCase = await this.lockedCase(tx, tenantId, caseId, actor); orderId = fatCase.execution.manufacturingOrderId;
      this.version(fatCase, dto.lockVersion);
      if (fatCase.execution.status !== 'IN_PROGRESS') throw new ConflictException('El FAT no está en ejecución');
      const title = this.text(dto.title); const description = this.text(dto.description);
      if (!title || !description || description.length < 5) throw new BadRequestException('Título y descripción de al menos 5 caracteres son obligatorios');
      if (!['NON_CONFORMITY', 'OBSERVATION'].includes(dto.kind) || !['MINOR', 'MAJOR', 'CRITICAL'].includes(dto.severity)) throw new BadRequestException('Clasificación inválida');
      if (dto.kind === 'OBSERVATION' && dto.severity !== 'MINOR') throw new BadRequestException('Una observación no bloqueante solo puede ser menor; registra los incumplimientos como no conformidad');
      const assignment = await this.assignment(tx, tenantId, orderId, dto);
      const latest = await tx.manufacturingFatDeviation.aggregate({ where: { tenantId, executionId: fatCase.executionId }, _max: { sequence: true } });
      const sequence = Number(latest._max.sequence || 0) + 1;
      const deviation = await tx.manufacturingFatDeviation.create({ data: { tenantId, executionId: fatCase.executionId, fatCaseId: caseId, sequence,
        deviationCode: `${fatCase.execution.executionCode}-D${String(sequence).padStart(2, '0')}`, title, description,
        kind: dto.kind, severity: dto.severity, location: this.text(dto.location), ...assignment, openedByUserId: actor.id, openedByName: actor.name,
      } });
      await tx.manufacturingFatCase.update({ where: { id: caseId }, data: { lockVersion: { increment: 1 }, ...(dto.kind === 'NON_CONFORMITY' ? { result: 'FAIL', testedAt: new Date(), testedByUserId: actor.id, testedByName: actor.name } : {}) } });
      if (dto.kind === 'NON_CONFORMITY' && fatCase.parentCaseId) await this.invalidateParent(tx, fatCase, actor, 'Se registró una no conformidad en un subpunto');
      await this.bumpExecution(tx, fatCase);
      await this.audit(tx, tenantId, orderId, deviation.id, 'FAT_DEVIATION_CREATED', `${deviation.deviationCode}: ${title}`, actor, { title, description, kind: dto.kind, severity: dto.severity, location: dto.location, ...assignment });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async addDeviationEvidence(deviationId: string, dto: CreateManufacturingFatEvidenceDto) {
    const { tenantId } = this.context();
    const deviation = await this.prisma.manufacturingFatDeviation.findFirst({ where: { id: deviationId, tenantId }, select: { fatCaseId: true } });
    if (!deviation) throw new NotFoundException('Novedad no encontrada');
    return this.addEvidence(deviation.fatCaseId, dto, deviationId);
  }
  async uploadEvidence(id: string, dto: CreateManufacturingFatEvidenceDto, file: FatMediaFile | undefined, forDeviation = false) {
    validateFatMedia(file);
    let caseId = id;
    if (forDeviation) {
      const deviation = await this.prisma.manufacturingFatDeviation.findFirst({ where: { id, tenantId: this.context().tenantId }, select: { fatCaseId: true } });
      if (!deviation) throw new NotFoundException('Novedad no encontrada');
      caseId = deviation.fatCaseId;
    }
    return this.addEvidence(caseId, dto, forDeviation ? id : undefined, file);
  }

  async evidenceFile(id: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma, tenantId, userId);
    const evidence = await this.prisma.manufacturingFatEvidence.findFirst({ where: { id, tenantId }, include: { fatCase: { include: { execution: true } } } });
    if (!evidence?.storageKey) throw new NotFoundException('Archivo no encontrado');
    await this.visibleOrder(this.prisma, tenantId, evidence.fatCase.execution.manufacturingOrderId, actor);
    const path = fatMediaPath(evidence.storageKey);
    try { await fs.access(path); } catch { throw new NotFoundException('Archivo no disponible en almacenamiento'); }
    return { path, filename: evidence.filename!, mimeType: evidence.mimeType!, size: evidence.size! };
  }

  async addEvidence(caseId: string, dto: CreateManufacturingFatEvidenceDto, deviationId?: string, file?: FatMediaFile) {
    const { tenantId, userId } = this.context(); let orderId = '';
    let media: FatMediaMetadata | undefined;
    try { await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const deviation = deviationId ? await tx.manufacturingFatDeviation.findFirst({ where: { id: deviationId, tenantId, fatCaseId: caseId } }) : null;
      if (deviationId && !deviation) throw new NotFoundException('Novedad no encontrada');
      const fatCase = await this.lockedCase(tx, tenantId, caseId, actor, deviation?.kind === 'OBSERVATION'); orderId = fatCase.execution.manufacturingOrderId;
      if (fatCase.execution.status !== 'IN_PROGRESS' && !(deviation?.kind === 'OBSERVATION' && fatCase.execution.status === 'APPROVED')) throw new ConflictException('La evidencia no puede agregarse en este estado del FAT');
      const title = this.text(dto?.title); if (!title) throw new BadRequestException('El título es obligatorio');
      if (!file && !this.text(dto?.reference) && !this.text(dto?.url) && !this.text(dto?.notes)) throw new BadRequestException('Incluye un archivo, referencia, URL o nota');
      if (file) media = await storeFatMedia(file);
      const evidence = await tx.manufacturingFatEvidence.create({ data: { tenantId, fatCaseId: caseId, deviationId: deviationId || null, title, reference: this.text(dto.reference), url: this.text(dto.url), notes: this.text(dto.notes), ...media, createdByUserId: actor.id, createdByName: actor.name } });
      await this.bumpExecution(tx, fatCase);
      await this.audit(tx, tenantId, orderId, deviationId || evidence.id, deviationId ? 'FAT_DEVIATION_EVIDENCE_ADDED' : 'FAT_EVIDENCE_ADDED', `${deviation?.deviationCode || fatCase.name}: evidencia agregada`, actor, { evidenceId: evidence.id, title, reference: evidence.reference, url: evidence.url, filename: media?.filename, mimeType: media?.mimeType, size: media?.size });
    }, { isolationLevel: 'Serializable' }); }
    catch (error) { if (media) await fs.unlink(fatMediaPath(media.storageKey)).catch(() => undefined); throw error; }
    return this.list(orderId);
  }

  async updateDeviation(deviationId: string, dto: UpdateManufacturingFatDeviationDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const lookup = await tx.manufacturingFatDeviation.findFirst({ where: { id: deviationId, tenantId }, select: { fatCaseId: true, kind: true } });
      if (!lookup) throw new NotFoundException('Novedad no encontrada');
      const fatCase = await this.lockedCase(tx, tenantId, lookup.fatCaseId, actor, lookup.kind === 'OBSERVATION');
      orderId = fatCase.execution.manufacturingOrderId;
      const deviation = await tx.manufacturingFatDeviation.findFirst({ where: { id: deviationId, tenantId } });
      if (fatCase.execution.status !== 'IN_PROGRESS' && !(deviation.kind === 'OBSERVATION' && fatCase.execution.status === 'APPROVED')) throw new ConflictException('El FAT no permite modificar esta novedad');
      this.version(deviation, dto.lockVersion);
      const status = dto.status;
      if (!['OPEN', 'IN_REWORK', 'PENDING_VERIFICATION', 'RESOLVED', 'ACCEPTED_AS_IS'].includes(status)) throw new BadRequestException('Estado de novedad inválido');
      assertFatFindingTransition(deviation.status, status);
      const changed = status !== deviation.status;
      if (!changed && ['RESOLVED', 'ACCEPTED_AS_IS'].includes(status)) throw new ConflictException('Reabre la novedad antes de modificarla');
      if (deviation.status === 'PENDING_VERIFICATION' && status !== 'IN_REWORK' && ((dto.correctiveAction !== undefined && this.text(dto.correctiveAction) !== deviation.correctiveAction) || (dto.resolutionNotes !== undefined && this.text(dto.resolutionNotes) !== deviation.resolutionNotes))) throw new ConflictException('Devuelve la novedad a corrección antes de modificar el trabajo presentado');
      const correctiveAction = this.text(dto.correctiveAction) || deviation.correctiveAction;
      const resolutionNotes = this.text(dto.resolutionNotes) || deviation.resolutionNotes;
      const verificationNotes = this.text(dto.verificationNotes);
      if (status === 'IN_REWORK' && (!correctiveAction || correctiveAction.length < 5)) throw new BadRequestException('Describe la acción correctiva');
      if (status === 'PENDING_VERIFICATION' && (!resolutionNotes || resolutionNotes.length < 5)) throw new BadRequestException('Documenta la corrección realizada');
      const verifying = changed && (status === 'RESOLVED' || (deviation.status === 'PENDING_VERIFICATION' && status === 'IN_REWORK'));
      if (verifying) {
        if (!this.permissions(fatCase.execution.manufacturingOrder, actor).canVerify) throw new ForbiddenException('Solo el responsable, un revisor de la orden o ADMIN puede verificar');
        if (!verificationNotes || verificationNotes.length < 5) throw new BadRequestException('Documenta el resultado de la verificación');
        if (status === 'RESOLVED') assertIndependentApproval(actor.id, [deviation.correctedByUserId], dto.approvalExceptionReason);
      }
      if (status === 'ACCEPTED_AS_IS') {
        if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede aceptar una desviación por concesión');
        if (deviation.kind === 'OBSERVATION' || deviation.severity === 'CRITICAL') throw new ConflictException('La concesión solo aplica a no conformidades no críticas');
        if (!resolutionNotes || resolutionNotes.length < 5) throw new BadRequestException('Documenta la concesión');
      }
      const assignment = await this.assignment(tx, tenantId, orderId, dto);
      const terminal = ['RESOLVED', 'ACCEPTED_AS_IS'].includes(status);
      await tx.manufacturingFatDeviation.update({ where: { id: deviationId }, data: {
        status, correctiveAction, resolutionNotes, ...assignment, lockVersion: { increment: 1 },
        ...(verifying ? { verificationNotes } : {}),
        ...(changed && status === 'PENDING_VERIFICATION' ? { correctedByUserId: actor.id, correctedByName: actor.name, correctedAt: new Date(), verificationNotes: null } : {}),
        ...(changed && status === 'OPEN' ? { correctiveAction: null, resolutionNotes: null, verificationNotes: null, correctedByUserId: null, correctedByName: null, correctedAt: null } : {}),
        resolvedAt: terminal ? new Date() : null, resolvedByUserId: terminal ? actor.id : null, resolvedByName: terminal ? actor.name : null,
      } });
      await tx.manufacturingFatCase.update({ where: { id: fatCase.id }, data: { lockVersion: { increment: 1 }, ...(deviation.kind === 'NON_CONFORMITY' && changed && status === 'OPEN' ? { result: 'FAIL' } : {}) } });
      if (fatCase.parentCaseId && deviation.kind === 'NON_CONFORMITY' && changed && status === 'OPEN') await this.invalidateParent(tx, fatCase, actor, 'Se reabrió una no conformidad del subpunto');
      await this.bumpExecution(tx, fatCase);
      await this.audit(tx, tenantId, orderId, deviationId, 'FAT_DEVIATION_UPDATED', `${deviation.deviationCode}: ${status}`, actor, { previousStatus: deviation.status, status, correctiveAction, resolutionNotes, verificationNotes, ...assignment, approvalExceptionReason: dto.approvalExceptionReason });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async submit(executionId: string, dto: ManufacturingFatVersionDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      this.version(execution, dto?.lockVersion); if (execution.status !== 'IN_PROGRESS') throw new ConflictException('El FAT no está en ejecución');
      const cases = await tx.manufacturingFatCase.findMany({ where: { tenantId: execution.tenantId, executionId: execution.id }, include: { evidence: { where: { deviationId: null } }, deviations: true } });
      assertFatReady(cases);
      await tx.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: 'AWAITING_APPROVAL', submittedAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, 'MANUFACTURING_FAT_SUBMITTED', `${execution.executionCode}: enviado a aprobación`, actor, {});
    });
  }

  async decide(executionId: string, dto: DecideManufacturingFatDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede aprobar o rechazar el FAT'); this.version(execution, dto?.lockVersion);
      if (execution.status !== 'AWAITING_APPROVAL') throw new ConflictException('El FAT no está pendiente de aprobación');
      const decision = String(dto?.decision || '').toUpperCase(); if (!['APPROVED', 'REJECTED'].includes(decision)) throw new BadRequestException('Decisión inválida');
      const comments = this.text(dto?.comments); if (decision === 'REJECTED' && (!comments || comments.length < 5)) throw new BadRequestException('El rechazo requiere una observación');
      if (decision === 'APPROVED') {
        const readiness = await tx.manufacturingFatCase.findMany({ where: { tenantId: execution.tenantId, executionId }, include: { evidence: { where: { deviationId: null } }, deviations: true } });
        assertFatReady(readiness);
        const cases = await tx.manufacturingFatCase.findMany({ where: { tenantId: execution.tenantId, executionId }, select: { testedByUserId: true } });
        assertIndependentApproval(actor.id, cases.map((item: any) => item.testedByUserId), dto.approvalExceptionReason);
        if (dto.approvalExceptionReason) await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, 'MANUFACTURING_APPROVAL_EXCEPTION', dto.approvalExceptionReason, actor, { reason: dto.approvalExceptionReason });
      }
      await tx.manufacturingFatApproval.create({ data: { tenantId: execution.tenantId, executionId: execution.id, decision, comments, signedByUserId: actor.id, signedByName: actor.name, signedByRole: actor.role } });
      await tx.manufacturingFatExecution.update({ where: { id: execution.id }, data: { status: decision, decidedAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, decision === 'APPROVED' ? 'MANUFACTURING_FAT_APPROVED' : 'MANUFACTURING_FAT_REJECTED', `${execution.executionCode}: ${decision === 'APPROVED' ? 'aprobado y listo para despacho' : 'rechazado'}`, actor, { decision, comments, dispatchReady: decision === 'APPROVED' });
    });
  }

  private async executionCommand(executionId: string, command: (tx: any, execution: any, actor: Actor) => Promise<void>) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); await tx.$queryRaw`SELECT "id" FROM "ManufacturingFatExecution" WHERE "id" = ${executionId} FOR UPDATE`;
      const execution = await tx.manufacturingFatExecution.findFirst({ where: { id: executionId, tenantId }, include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } });
      if (!execution) throw new NotFoundException('Ejecución FAT no encontrada'); orderId = execution.manufacturingOrderId;
      if (!this.permissions(execution.manufacturingOrder, actor).canOperate) throw new ForbiddenException('No tienes una función operativa en esta orden');
      if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(execution.manufacturingOrder.status)) throw new ConflictException('La orden no permite ejecutar FAT');
      await command(tx, execution, actor); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }
  private async lockedCase(tx: any, tenantId: string, caseId: string, actor: Actor, allowApprovedObservation = false) {
    const lookup = await tx.manufacturingFatCase.findFirst({ where: { id: caseId, tenantId }, select: { executionId: true } });
    if (!lookup) throw new NotFoundException('Caso FAT no encontrado');
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingFatExecution" WHERE "id" = ${lookup.executionId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingFatCase" WHERE "id" = ${caseId} FOR UPDATE`;
    const fatCase = await tx.manufacturingFatCase.findFirst({ where: { id: caseId, tenantId }, include: { execution: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } } });
    if (!fatCase) throw new NotFoundException('Caso FAT no encontrado'); const order = fatCase.execution.manufacturingOrder;
    if (fatCase.voidedAt) throw new ConflictException('El subpunto está anulado; su información se conserva para consulta');
    if (!this.permissions(order, actor).canOperate) throw new ForbiddenException('No tienes una función operativa en esta orden');
    if (['CANCELED', 'ON_HOLD'].includes(order.status) || (order.status === 'COMPLETED' && !(allowApprovedObservation && fatCase.execution.status === 'APPROVED'))) throw new ConflictException('La orden no permite ejecutar FAT'); return fatCase;
  }
  private serialize(execution: any) {
    const publicEvidence = ({ storageKey, ...evidence }: any) => ({ ...evidence, hasFile: !!storageKey });
    execution = { ...execution, cases: execution.cases.map((c: any) => ({ ...c, evidence: c.evidence.map(publicEvidence), deviations: c.deviations.map((d: any) => ({ ...d, evidence: d.evidence.map(publicEvidence) })) })) };
    const allCases = execution.cases.map((fatCase: any) => ({ ...fatCase, minimumValue: fatCase.minimumValue === null ? null : Number(fatCase.minimumValue), maximumValue: fatCase.maximumValue === null ? null : Number(fatCase.maximumValue), measuredValue: fatCase.measuredValue === null ? null : Number(fatCase.measuredValue) }));
    const cases = allCases.filter((c: any) => !c.voidedAt);
    const deviations = cases.flatMap((fatCase: any) => fatCase.deviations);
    const requiredWork = cases.filter((c: any) => !c.parentCaseId || c.required || c.result !== 'PENDING');
    return { ...execution, cases: allCases, summary: { caseCount: cases.length, rootCaseCount: cases.filter((c: any) => !c.parentCaseId).length, subpointCount: cases.filter((c: any) => c.parentCaseId).length, voidedCount: allCases.length - cases.length, passedCount: cases.filter((item: any) => item.result === 'PASS').length, failedCount: cases.filter((item: any) => item.result === 'FAIL').length, pendingCount: requiredWork.filter((item: any) => item.result === 'PENDING').length, openDeviationCount: deviations.filter((item: any) => FAT_OPEN_FINDING_STATUSES.includes(item.status)).length, blockingDeviationCount: deviations.filter(isBlockingFatFinding).length, observationCount: deviations.filter((d: any) => d.kind === 'OBSERVATION').length, closedDeviationCount: deviations.filter((d: any) => !FAT_OPEN_FINDING_STATUSES.includes(d.status)).length, progressPercent: requiredWork.length ? Math.round(requiredWork.filter((item: any) => item.result !== 'PENDING').length * 100 / requiredWork.length) : 0, dispatchReady: execution.status === 'APPROVED' } };
  }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) {
    await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('CASE') ? 'ManufacturingFatCase' : action.includes('DEVIATION') ? 'ManufacturingFatDeviation' : action.includes('EVIDENCE') ? 'ManufacturingFatEvidence' : 'ManufacturingFatExecution', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } });
  }
}
