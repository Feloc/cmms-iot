import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import {
  CreateManufacturingSatEvidenceDto,
  CreateManufacturingSatExecutionDto,
  CreateManufacturingSatTemplateDto,
  DecideManufacturingSatDto,
  ManufacturingSatVersionDto,
  RecordManufacturingSatCaseDto,
  UpdateManufacturingSatDeviationDto,
} from './dto/manufacturing-sat.dto';

type Actor = { id: string; name: string; role: string };
const RESULT_TYPES = new Set(['BOOLEAN', 'NUMERIC', 'TEXT']);
const CASE_RESULTS = new Set(['PASS', 'FAIL', 'NOT_APPLICABLE']);
const DEVIATION_STATUSES = new Set(['OPEN', 'IN_REWORK', 'RESOLVED', 'ACCEPTED_AS_IS']);
const SEVERITIES = new Set(['MINOR', 'MAJOR', 'CRITICAL']);

@Injectable()
export class ManufacturingSatService {
  constructor(private readonly prisma: PrismaService) {}

  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); return actor; }
  private text(value: unknown) { const result = String(value ?? '').trim(); return result || null; }
  private number(value: unknown, label: string) { const result = Number(value); if (!Number.isFinite(result)) throw new BadRequestException(`${label} no es válido`); return result; }
  private date(value: unknown, label: string) { const text = this.text(value); if (!text) return null; const result = new Date(text); if (Number.isNaN(result.getTime())) throw new BadRequestException(`${label} no es válida`); return result; }
  private version(entity: any, raw: unknown) { const value = Number(raw); if (!Number.isInteger(value) || value !== entity.lockVersion) throw new ConflictException('El registro cambió; actualiza la pantalla'); }
  private async visibleOrder(tx: any, tenantId: string, orderId: string, actor: Actor) { const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id } } } }); if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new NotFoundException('Orden de manufactura no encontrada'); return order; }
  private include() { return { manufacturedUnit: true, asset: { select: { id: true, code: true, name: true, status: true, commissionedAt: true, guarantee: true } }, siteDeployment: { select: { id: true, deploymentCode: true, status: true } }, assemblyExecution: { select: { id: true, status: true, completedAt: true, workOrder: { select: { id: true, title: true, technicianSignature: true, receiverSignature: true } } } }, cases: { include: { evidence: { orderBy: { createdAt: 'desc' } }, deviations: { orderBy: { sequence: 'asc' } } }, orderBy: { position: 'asc' } }, acceptances: { orderBy: { signedAt: 'desc' } } }; }

  async listTemplates(rawActive?: string) {
    const { tenantId, userId } = this.context(); await this.actor(this.prisma as any, tenantId, userId);
    const active = rawActive === undefined ? undefined : String(rawActive).toLowerCase() === 'true';
    return (this.prisma as any).manufacturingSatTemplate.findMany({ where: { tenantId, ...(active === undefined ? {} : { active }) }, include: { cases: { orderBy: { position: 'asc' } } }, orderBy: [{ name: 'asc' }, { version: 'desc' }] });
  }

  async createTemplate(dto: CreateManufacturingSatTemplateDto) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId);
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede crear protocolos SAT');
    const code = String(dto?.code || '').trim().toUpperCase().replace(/\s+/g, '-'); const name = this.text(dto?.name);
    if (!code || !name) throw new BadRequestException('Código y nombre son obligatorios');
    if (!Array.isArray(dto?.cases) || !dto.cases.length) throw new BadRequestException('El protocolo requiere al menos un caso de prueba');
    const positions = new Set<number>();
    const cases = dto.cases.map((item, index) => {
      const position = Number(item.position ?? index + 1); if (!Number.isInteger(position) || position < 1 || positions.has(position)) throw new BadRequestException('Las posiciones deben ser enteros positivos y únicos'); positions.add(position);
      const caseName = this.text(item.name); const criteria = this.text(item.acceptanceCriteria); if (!caseName || !criteria) throw new BadRequestException(`El caso ${position} requiere nombre y criterio de aceptación`);
      const resultType = String(item.resultType || 'BOOLEAN').toUpperCase(); if (!RESULT_TYPES.has(resultType)) throw new BadRequestException(`Tipo de resultado inválido en el caso ${position}`);
      const minimumValue = item.minimumValue === undefined || item.minimumValue === null || item.minimumValue === '' ? null : this.number(item.minimumValue, 'Valor mínimo');
      const maximumValue = item.maximumValue === undefined || item.maximumValue === null || item.maximumValue === '' ? null : this.number(item.maximumValue, 'Valor máximo');
      if (resultType === 'NUMERIC' && minimumValue === null && maximumValue === null) throw new BadRequestException(`El caso numérico ${position} requiere un límite`);
      if (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue) throw new BadRequestException(`El rango del caso ${position} no es válido`);
      return { tenantId, position, section: this.text(item.section), name: caseName, instructions: this.text(item.instructions), acceptanceCriteria: criteria, resultType, minimumValue, maximumValue, unit: this.text(item.unit), required: item.required !== false, evidenceRequired: item.evidenceRequired === true };
    });
    return this.prisma.$transaction(async (tx: any) => {
      const latest = await tx.manufacturingSatTemplate.aggregate({ where: { tenantId, code }, _max: { version: true } });
      const template = await tx.manufacturingSatTemplate.create({ data: { tenantId, code, name, description: this.text(dto.description), version: Number(latest._max.version || 0) + 1, createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingSatTemplateCase.createMany({ data: cases.map((item) => ({ ...item, templateId: template.id })) });
      return tx.manufacturingSatTemplate.findUnique({ where: { id: template.id }, include: { cases: { orderBy: { position: 'asc' } } } });
    }, { isolationLevel: 'Serializable' });
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId); await this.visibleOrder(this.prisma as any, tenantId, orderId, actor);
    const rows = await (this.prisma as any).manufacturingSatExecution.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.include(), orderBy: [{ manufacturedUnit: { unitNumber: 'asc' } }, { sequence: 'desc' }] });
    return rows.map((row: any) => this.serialize(row));
  }

  async createExecution(deploymentId: string, dto: CreateManufacturingSatExecutionDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede crear ejecuciones SAT');
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSiteDeployment" WHERE "id" = ${deploymentId} FOR UPDATE`;
      const deployment = await tx.manufacturingSiteDeployment.findFirst({ where: { id: deploymentId, tenantId }, include: { manufacturingOrder: true, manufacturedUnit: true, asset: true, assemblyExecution: { include: { workOrder: true } } } });
      if (!deployment) throw new NotFoundException('Instalación en sitio no encontrada'); orderId = deployment.manufacturingOrderId;
      if (deployment.status !== 'READY_FOR_SAT' || deployment.assemblyExecution?.status !== 'COMPLETED') throw new ConflictException('El montaje debe estar completado y listo para SAT');
      if (!deployment.asset || !deployment.assemblyExecutionId) throw new ConflictException('La instalación no tiene activo o montaje asociado');
      if (!deployment.assemblyExecution.workOrder.technicianSignature || !deployment.assemblyExecution.workOrder.receiverSignature) throw new ConflictException('Completa las firmas técnica y de recepción del montaje antes del SAT');
      const current = await tx.manufacturingSatExecution.findFirst({ where: { tenantId, manufacturedUnitId: deployment.manufacturedUnitId }, orderBy: { sequence: 'desc' } });
      if (current && !['REJECTED', 'CANCELED'].includes(current.status)) throw new ConflictException(current.status.startsWith('ACCEPTED') ? 'La unidad ya tiene un SAT aceptado' : 'La unidad ya tiene un SAT activo');
      const template = await tx.manufacturingSatTemplate.findFirst({ where: { id: String(dto?.templateId || ''), tenantId, active: true }, include: { cases: { orderBy: { position: 'asc' } } } });
      if (!template || !template.cases.length) throw new ConflictException('Selecciona un protocolo SAT activo con casos');
      const sequence = Number(current?.sequence || 0) + 1; const executionCode = `${deployment.manufacturingOrder.number}-U${String(deployment.manufacturedUnit.unitNumber).padStart(2, '0')}-SAT-${sequence}`;
      const execution = await tx.manufacturingSatExecution.create({ data: { tenantId, manufacturingOrderId: orderId, manufacturedUnitId: deployment.manufacturedUnitId, siteDeploymentId: deployment.id, assemblyExecutionId: deployment.assemblyExecutionId, assetId: deployment.asset.id, templateId: template.id, sequence, executionCode, templateCode: template.code, templateName: template.name, templateVersion: template.version, createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingSatCase.createMany({ data: template.cases.map((item: any) => ({ tenantId, executionId: execution.id, templateCaseId: item.id, position: item.position, section: item.section, name: item.name, instructions: item.instructions, acceptanceCriteria: item.acceptanceCriteria, resultType: item.resultType, minimumValue: item.minimumValue, maximumValue: item.maximumValue, unit: item.unit, required: item.required, evidenceRequired: item.evidenceRequired })) });
      await this.audit(tx, tenantId, orderId, execution.id, 'MANUFACTURING_SAT_CREATED', `${executionCode}: SAT creado`, actor, { deploymentId, templateId: template.id, cases: template.cases.length });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async start(executionId: string, dto: ManufacturingSatVersionDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      this.version(execution, dto?.lockVersion); if (execution.status !== 'DRAFT') throw new ConflictException('Solo un SAT en borrador puede iniciarse');
      const now = new Date(); await tx.manufacturingSatExecution.update({ where: { id: execution.id }, data: { status: 'IN_PROGRESS', startedAt: now, lockVersion: { increment: 1 } } });
      await tx.manufacturingSiteDeployment.update({ where: { id: execution.siteDeploymentId }, data: { status: 'SAT_IN_PROGRESS', lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, 'MANUFACTURING_SAT_STARTED', `${execution.executionCode}: SAT iniciado`, actor, {});
    });
  }

  async recordCase(caseId: string, dto: RecordManufacturingSatCaseDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const satCase = await this.lockedCase(tx, tenantId, caseId, actor); orderId = satCase.execution.manufacturingOrderId;
      this.version(satCase, dto?.lockVersion); if (satCase.execution.status !== 'IN_PROGRESS') throw new ConflictException('El SAT no está en ejecución');
      let result = String(dto?.result || '').toUpperCase(); let measuredValue: number | null = null; const observedValue = this.text(dto?.observedValue); const notes = this.text(dto?.notes);
      if (satCase.resultType === 'NUMERIC') { measuredValue = this.number(dto?.measuredValue, 'La medición'); result = (satCase.minimumValue === null || measuredValue >= Number(satCase.minimumValue)) && (satCase.maximumValue === null || measuredValue <= Number(satCase.maximumValue)) ? 'PASS' : 'FAIL'; }
      else { if (!CASE_RESULTS.has(result)) throw new BadRequestException('Selecciona un resultado válido'); if (satCase.resultType === 'TEXT' && result !== 'NOT_APPLICABLE' && !observedValue) throw new BadRequestException('Registra el valor observado'); }
      if (result === 'NOT_APPLICABLE' && satCase.required) throw new ConflictException('Un caso obligatorio no puede marcarse como no aplicable');
      if (result === 'FAIL' && (!notes || notes.length < 5)) throw new BadRequestException('Un resultado no conforme requiere una observación de al menos 5 caracteres');
      if (result === 'PASS') { const open = await tx.manufacturingSatDeviation.count({ where: { tenantId, satCaseId: satCase.id, status: { in: ['OPEN', 'IN_REWORK'] } } }); if (open) throw new ConflictException('Resuelve el pendiente antes de registrar una nueva prueba conforme'); }
      await tx.manufacturingSatCase.update({ where: { id: satCase.id }, data: { result, measuredValue, observedValue, notes, testedAt: new Date(), testedByUserId: actor.id, testedByName: actor.name, lockVersion: { increment: 1 } } });
      if (result === 'FAIL') {
        const severity = String(dto?.deviationSeverity || 'MAJOR').toUpperCase(); if (!SEVERITIES.has(severity)) throw new BadRequestException('Severidad inválida');
        const open = await tx.manufacturingSatDeviation.findFirst({ where: { tenantId, satCaseId: satCase.id, status: { in: ['OPEN', 'IN_REWORK'] } } });
        if (!open) { const latest = await tx.manufacturingSatDeviation.aggregate({ where: { tenantId, executionId: satCase.executionId }, _max: { sequence: true } }); const sequence = Number(latest._max.sequence || 0) + 1; await tx.manufacturingSatDeviation.create({ data: { tenantId, executionId: satCase.executionId, satCaseId: satCase.id, sequence, deviationCode: `${satCase.execution.executionCode}-P${String(sequence).padStart(2, '0')}`, title: `Pendiente SAT: ${satCase.name}`, description: notes, severity, openedByUserId: actor.id, openedByName: actor.name } }); }
      }
      await this.audit(tx, tenantId, orderId, satCase.id, 'SAT_CASE_RECORDED', `${satCase.name}: ${result}`, actor, { result, measuredValue, observedValue, notes });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async addEvidence(caseId: string, dto: CreateManufacturingSatEvidenceDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const satCase = await this.lockedCase(tx, tenantId, caseId, actor); orderId = satCase.execution.manufacturingOrderId;
      if (satCase.execution.status !== 'IN_PROGRESS') throw new ConflictException('La evidencia solo puede agregarse durante la ejecución');
      const title = this.text(dto?.title); if (!title) throw new BadRequestException('El título es obligatorio'); if (!this.text(dto?.reference) && !this.text(dto?.url) && !this.text(dto?.notes)) throw new BadRequestException('Incluye una referencia, URL o nota');
      const evidence = await tx.manufacturingSatEvidence.create({ data: { tenantId, satCaseId: satCase.id, title, reference: this.text(dto.reference), url: this.text(dto.url), notes: this.text(dto.notes), createdByUserId: actor.id, createdByName: actor.name } });
      await this.audit(tx, tenantId, orderId, evidence.id, 'SAT_EVIDENCE_ADDED', `${satCase.name}: evidencia agregada`, actor, { satCaseId: satCase.id, title });
    });
    return this.list(orderId);
  }

  async updateDeviation(deviationId: string, dto: UpdateManufacturingSatDeviationDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); await tx.$queryRaw`SELECT "id" FROM "ManufacturingSatDeviation" WHERE "id" = ${deviationId} FOR UPDATE`;
      const deviation = await tx.manufacturingSatDeviation.findFirst({ where: { id: deviationId, tenantId }, include: { execution: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } } });
      if (!deviation) throw new NotFoundException('Pendiente SAT no encontrado'); const order = deviation.execution.manufacturingOrder; orderId = order.id;
      if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length) throw new NotFoundException('Pendiente SAT no encontrado');
      if (!['IN_PROGRESS', 'ACCEPTED_WITH_PENDING_ITEMS'].includes(deviation.execution.status)) throw new ConflictException('El SAT no permite gestionar pendientes'); this.version(deviation, dto?.lockVersion);
      const status = String(dto?.status || '').toUpperCase(); if (!DEVIATION_STATUSES.has(status)) throw new BadRequestException('Estado de pendiente inválido');
      if (status === 'ACCEPTED_AS_IS' && actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede aceptar un pendiente por concesión');
      const severity = dto.severity === undefined ? deviation.severity : String(dto.severity).toUpperCase(); if (!SEVERITIES.has(severity)) throw new BadRequestException('Severidad inválida');
      let responsibleUserId = dto.responsibleUserId === undefined ? deviation.responsibleUserId : this.text(dto.responsibleUserId); let responsibleName = deviation.responsibleName;
      if (responsibleUserId) { const responsible = await tx.user.findFirst({ where: { id: responsibleUserId, tenantId }, select: { id: true, name: true } }); if (!responsible) throw new BadRequestException('Responsable no válido'); responsibleUserId = responsible.id; responsibleName = responsible.name; } else if (dto.responsibleUserId !== undefined) responsibleName = null;
      const dueAt = dto.dueAt === undefined ? deviation.dueAt : this.date(dto.dueAt, 'La fecha compromiso');
      const correctiveAction = this.text(dto?.correctiveAction) || deviation.correctiveAction; const resolutionNotes = this.text(dto?.resolutionNotes) || deviation.resolutionNotes;
      if (status === 'IN_REWORK' && (!correctiveAction || correctiveAction.length < 5)) throw new BadRequestException('Describe la acción correctiva');
      if (['RESOLVED', 'ACCEPTED_AS_IS'].includes(status) && (!resolutionNotes || resolutionNotes.length < 5)) throw new BadRequestException('Documenta la resolución');
      const terminal = ['RESOLVED', 'ACCEPTED_AS_IS'].includes(status);
      await tx.manufacturingSatDeviation.update({ where: { id: deviation.id }, data: { status, severity, correctiveAction, resolutionNotes, responsibleUserId, responsibleName, dueAt, resolvedAt: terminal ? new Date() : null, resolvedByUserId: terminal ? actor.id : null, resolvedByName: terminal ? actor.name : null, lockVersion: { increment: 1 } } });
      if (deviation.execution.status === 'ACCEPTED_WITH_PENDING_ITEMS' && terminal) { const remaining = await tx.manufacturingSatDeviation.count({ where: { tenantId, executionId: deviation.executionId, id: { not: deviation.id }, status: { in: ['OPEN', 'IN_REWORK'] } } }); if (!remaining) { await tx.manufacturingSatExecution.update({ where: { id: deviation.executionId }, data: { status: 'ACCEPTED', lockVersion: { increment: 1 } } }); await tx.manufacturingSiteDeployment.update({ where: { id: deviation.execution.siteDeploymentId }, data: { status: 'ACCEPTED', lockVersion: { increment: 1 } } }); } }
      await this.audit(tx, tenantId, orderId, deviation.id, 'SAT_DEVIATION_UPDATED', `${deviation.deviationCode}: ${status}`, actor, { status, severity, correctiveAction, responsibleUserId, dueAt });
    });
    return this.list(orderId);
  }

  async submit(executionId: string, dto: ManufacturingSatVersionDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      this.version(execution, dto?.lockVersion); if (execution.status !== 'IN_PROGRESS') throw new ConflictException('El SAT no está en ejecución');
      const cases = await tx.manufacturingSatCase.findMany({ where: { tenantId: execution.tenantId, executionId: execution.id }, include: { evidence: true, deviations: true } });
      if (cases.some((item: any) => item.result === 'PENDING')) throw new ConflictException('Registra el resultado de todos los casos');
      if (cases.some((item: any) => item.required && item.result === 'NOT_APPLICABLE')) throw new ConflictException('Todos los casos obligatorios deben ejecutarse');
      if (cases.some((item: any) => item.evidenceRequired && !item.evidence.length)) throw new ConflictException('Falta evidencia en uno o más casos obligatorios');
      const open = cases.flatMap((item: any) => item.deviations).filter((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status));
      if (open.some((item: any) => item.severity !== 'MINOR')) throw new ConflictException('Resuelve los pendientes mayores o críticos antes de solicitar aceptación');
      if (open.some((item: any) => !item.correctiveAction || !item.responsibleUserId || !item.dueAt)) throw new ConflictException('Todo pendiente menor abierto requiere acción, responsable y fecha compromiso');
      if (cases.some((item: any) => item.result === 'FAIL' && !item.deviations.some((deviation: any) => ['OPEN', 'IN_REWORK', 'ACCEPTED_AS_IS'].includes(deviation.status)))) throw new ConflictException('Repite los casos resueltos o documenta su concesión');
      await tx.manufacturingSatExecution.update({ where: { id: execution.id }, data: { status: 'AWAITING_ACCEPTANCE', submittedAt: new Date(), lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, 'MANUFACTURING_SAT_SUBMITTED', `${execution.executionCode}: enviado a aceptación`, actor, { openMinorItems: open.length });
    });
  }

  async decide(executionId: string, dto: DecideManufacturingSatDto) {
    return this.executionCommand(executionId, async (tx, execution, actor) => {
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede formalizar la aceptación SAT'); this.version(execution, dto?.lockVersion);
      if (execution.status !== 'AWAITING_ACCEPTANCE') throw new ConflictException('El SAT no está pendiente de aceptación');
      const decision = String(dto?.decision || '').toUpperCase(); if (!['ACCEPTED', 'ACCEPTED_WITH_PENDING_ITEMS', 'REJECTED'].includes(decision)) throw new BadRequestException('Decisión inválida');
      const comments = this.text(dto?.comments); if (decision === 'REJECTED' && (!comments || comments.length < 5)) throw new BadRequestException('El rechazo requiere una observación');
      const clientName = this.text(dto?.clientName); const clientRole = this.text(dto?.clientRole); const clientSignature = this.text(dto?.clientSignature);
      if (!clientName || !clientRole || !clientSignature) throw new BadRequestException('Nombre, cargo y firma del cliente son obligatorios');
      const open = await tx.manufacturingSatDeviation.findMany({ where: { tenantId: execution.tenantId, executionId: execution.id, status: { in: ['OPEN', 'IN_REWORK'] } } });
      if (decision === 'ACCEPTED' && open.length) throw new ConflictException('La aceptación total requiere cerrar todos los pendientes');
      if (decision === 'ACCEPTED_WITH_PENDING_ITEMS' && !open.length) throw new ConflictException('No existen pendientes para una aceptación condicionada');
      if (decision === 'ACCEPTED_WITH_PENDING_ITEMS' && open.some((item: any) => item.severity !== 'MINOR' || !item.correctiveAction || !item.responsibleUserId || !item.dueAt)) throw new ConflictException('Solo pueden aceptarse pendientes menores con plan, responsable y fecha');
      await tx.manufacturingSatAcceptance.create({ data: { tenantId: execution.tenantId, executionId: execution.id, decision, comments, clientName, clientRole, clientCompany: this.text(dto?.clientCompany), clientSignature, signedByUserId: actor.id, signedByName: actor.name, signedByRole: actor.role } });
      const now = new Date(); const accepted = decision !== 'REJECTED';
      await tx.manufacturingSatExecution.update({ where: { id: execution.id }, data: { status: decision, decidedAt: now, commissionedAt: accepted ? now : null, lockVersion: { increment: 1 } } });
      if (accepted) {
        const warrantyMonths = dto.warrantyMonths === undefined || dto.warrantyMonths === null || dto.warrantyMonths === '' ? null : Math.round(this.number(dto.warrantyMonths, 'Los meses de garantía'));
        if (warrantyMonths !== null && (warrantyMonths < 1 || warrantyMonths > 120)) throw new BadRequestException('La garantía debe estar entre 1 y 120 meses');
        const guarantee = warrantyMonths === null ? undefined : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + warrantyMonths, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()));
        await tx.asset.update({ where: { id: execution.assetId }, data: { status: 'ACTIVE', commissionedAt: now, acquiredOn: execution.asset.acquiredOn || now, ...(guarantee ? { guarantee } : {}) } });
        await tx.manufacturedUnit.update({ where: { id: execution.manufacturedUnitId }, data: { status: 'COMMISSIONED' } });
        await tx.manufacturingSiteDeployment.update({ where: { id: execution.siteDeploymentId }, data: { status: decision, lockVersion: { increment: 1 } } });
      } else await tx.manufacturingSiteDeployment.update({ where: { id: execution.siteDeploymentId }, data: { status: 'READY_FOR_SAT', lockVersion: { increment: 1 } } });
      await this.audit(tx, execution.tenantId, execution.manufacturingOrderId, execution.id, accepted ? 'MANUFACTURING_SAT_ACCEPTED' : 'MANUFACTURING_SAT_REJECTED', `${execution.executionCode}: ${decision}`, actor, { decision, clientName, clientRole, commissioned: accepted, openItems: open.length });
    });
  }

  private async executionCommand(executionId: string, command: (tx: any, execution: any, actor: Actor) => Promise<void>) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); await tx.$queryRaw`SELECT "id" FROM "ManufacturingSatExecution" WHERE "id" = ${executionId} FOR UPDATE`;
      const execution = await tx.manufacturingSatExecution.findFirst({ where: { id: executionId, tenantId }, include: { asset: true, manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } });
      if (!execution) throw new NotFoundException('Ejecución SAT no encontrada'); orderId = execution.manufacturingOrderId;
      if (actor.role === 'TECH' && execution.manufacturingOrder.responsibleUserId !== actor.id && !execution.manufacturingOrder.members.length) throw new NotFoundException('Ejecución SAT no encontrada');
      if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(execution.manufacturingOrder.status)) throw new ConflictException('La orden no permite ejecutar SAT');
      await command(tx, execution, actor); await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  private async lockedCase(tx: any, tenantId: string, caseId: string, actor: Actor) {
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingSatCase" WHERE "id" = ${caseId} FOR UPDATE`;
    const satCase = await tx.manufacturingSatCase.findFirst({ where: { id: caseId, tenantId }, include: { execution: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } } });
    if (!satCase) throw new NotFoundException('Caso SAT no encontrado'); const order = satCase.execution.manufacturingOrder;
    if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length) throw new NotFoundException('Caso SAT no encontrado');
    if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(order.status)) throw new ConflictException('La orden no permite ejecutar SAT'); return satCase;
  }

  private serialize(execution: any) {
    const cases = execution.cases.map((satCase: any) => ({ ...satCase, minimumValue: satCase.minimumValue === null ? null : Number(satCase.minimumValue), maximumValue: satCase.maximumValue === null ? null : Number(satCase.maximumValue), measuredValue: satCase.measuredValue === null ? null : Number(satCase.measuredValue) }));
    const deviations = cases.flatMap((satCase: any) => satCase.deviations);
    return { ...execution, cases, summary: { caseCount: cases.length, passedCount: cases.filter((item: any) => item.result === 'PASS').length, failedCount: cases.filter((item: any) => item.result === 'FAIL').length, pendingCount: cases.filter((item: any) => item.result === 'PENDING').length, openDeviationCount: deviations.filter((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status)).length, criticalOpenCount: deviations.filter((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status) && item.severity === 'CRITICAL').length, blockingOpenCount: deviations.filter((item: any) => ['OPEN', 'IN_REWORK'].includes(item.status) && item.severity !== 'MINOR').length, progressPercent: cases.length ? Math.round(cases.filter((item: any) => item.result !== 'PENDING').length * 100 / cases.length) : 0, commissioned: ['ACCEPTED', 'ACCEPTED_WITH_PENDING_ITEMS'].includes(execution.status) } };
  }

  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('CASE') ? 'ManufacturingSatCase' : action.includes('DEVIATION') ? 'ManufacturingSatDeviation' : action.includes('EVIDENCE') ? 'ManufacturingSatEvidence' : action.includes('ACCEPT') ? 'ManufacturingSatAcceptance' : 'ManufacturingSatExecution', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
