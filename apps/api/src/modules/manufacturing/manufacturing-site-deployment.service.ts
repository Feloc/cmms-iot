import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { AssembliesService } from '../assemblies/assemblies.service';
import {
  CompleteManufacturingSiteReceiptDto,
  CreateManufacturingSiteInstallationDto,
  UpdateManufacturingSiteReceiptCheckDto,
} from './dto/manufacturing-site-deployment.dto';

type Actor = { id: string; name: string; role: string };

const BASE_RECEIPT_CHECKS = [
  { position: 10, code: 'UNIT_IDENTITY', name: 'Identificación y serial', description: 'La placa, serial y documentación corresponden a la unidad despachada.', evidenceRequired: true },
  { position: 20, code: 'PACKING_LIST', name: 'Contenido contra lista de empaque', description: 'Los equipos, accesorios, repuestos y documentos llegaron completos.' },
  { position: 30, code: 'PACKAGING_CONDITION', name: 'Estado general del embalaje', description: 'El embalaje, protecciones y sellos no presentan señales de manipulación o impacto.' },
  { position: 40, code: 'VISIBLE_DAMAGE', name: 'Inspección de daños visibles', description: 'La unidad no presenta golpes, deformaciones, humedad u otros daños de transporte.', evidenceRequired: true },
  { position: 50, code: 'SITE_READINESS', name: 'Condiciones iniciales del sitio', description: 'El área permite descargar y conservar la unidad de forma segura hasta el montaje.' },
];

@Injectable()
export class ManufacturingSiteDeploymentService {
  constructor(private readonly prisma: PrismaService, private readonly assemblies: AssembliesService) {}

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

  private text(value: unknown) { const result = String(value ?? '').trim(); return result || null; }
  private version(entity: any, value: unknown, label = 'El expediente') {
    const version = Number(value);
    if (!Number.isInteger(version) || version !== entity.lockVersion) throw new ConflictException(`${label} cambió; actualiza la pantalla`);
  }

  private include() {
    return {
      manufacturedUnit: true,
      dispatch: { include: { packages: { orderBy: { sequence: 'asc' } } } },
      asset: { select: { id: true, code: true, name: true, status: true, customer: true, model: true, serialNumber: true } },
      assemblyExecution: {
        select: {
          id: true, status: true, templateName: true, templateVersion: true, scheduledStartAt: true, completedAt: true,
          activities: { select: { status: true, progressPercent: true, required: true } },
          workOrder: { select: { id: true, title: true, status: true, receiverSignature: true } },
        },
      },
      receiptChecks: { orderBy: { position: 'asc' } },
    };
  }

  private async visibleOrder(tx: any, tenantId: string, orderId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { members: { where: { userId: actor.id } } },
    });
    if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) {
      throw new NotFoundException('Orden de manufactura no encontrada');
    }
    return order;
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.visibleOrder(this.prisma as any, tenantId, orderId, actor);
    const rows = await (this.prisma as any).manufacturingSiteDeployment.findMany({
      where: { tenantId, manufacturingOrderId: orderId }, include: this.include(),
      orderBy: { manufacturedUnit: { unitNumber: 'asc' } },
    });
    return rows.map((row: any) => this.serialize(row));
  }

  async create(dispatchId: string) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede abrir la recepción técnica');
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingDispatch" WHERE "id" = ${dispatchId} FOR UPDATE`;
      const dispatch = await tx.manufacturingDispatch.findFirst({
        where: { id: dispatchId, tenantId },
        include: { manufacturedUnit: true, manufacturingOrder: true, packages: { orderBy: { sequence: 'asc' } } },
      });
      if (!dispatch) throw new NotFoundException('Despacho no encontrado');
      orderId = dispatch.manufacturingOrderId;
      if (dispatch.status !== 'DELIVERED') throw new ConflictException('La recepción técnica requiere un despacho entregado');
      if (['CANCELED', 'COMPLETED'].includes(dispatch.manufacturingOrder.status)) throw new ConflictException('La orden de manufactura está cerrada');
      if (await tx.manufacturingSiteDeployment.count({ where: { tenantId, dispatchId } })) throw new ConflictException('El despacho ya tiene recepción técnica');
      const deployment = await tx.manufacturingSiteDeployment.create({
        data: {
          tenantId, manufacturingOrderId: orderId, manufacturedUnitId: dispatch.manufacturedUnitId, dispatchId,
          deploymentCode: `${dispatch.manufacturingOrder.number}-U${String(dispatch.manufacturedUnit.unitNumber).padStart(2, '0')}-SITE`,
          destination: dispatch.destination || dispatch.manufacturingOrder.destination,
          deliveryAddress: dispatch.deliveryAddress, contactName: dispatch.contactName, contactPhone: dispatch.contactPhone,
          createdByUserId: actor.id, createdByName: actor.name,
        },
      });
      const packageChecks = dispatch.packages.map((item: any, index: number) => ({
        position: 100 + index * 10, code: `PACKAGE_${item.sequence}`,
        name: `Bulto ${item.packageCode}`,
        description: `${item.description}${item.sealNumber ? ` · Sello esperado: ${item.sealNumber}` : ''}`,
        evidenceRequired: false,
      }));
      await tx.manufacturingSiteReceiptCheck.createMany({
        data: [...BASE_RECEIPT_CHECKS, ...packageChecks].map((item) => ({ tenantId, deploymentId: deployment.id, required: true, ...item })),
      });
      await this.audit(tx, tenantId, orderId, deployment.id, 'SITE_DEPLOYMENT_CREATED', `${deployment.deploymentCode}: recepción técnica abierta`, actor, { dispatchId });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async updateReceiptCheck(checkId: string, dto: UpdateManufacturingSiteReceiptCheckDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSiteReceiptCheck" WHERE "id" = ${checkId} FOR UPDATE`;
      const check = await tx.manufacturingSiteReceiptCheck.findFirst({
        where: { id: checkId, tenantId },
        include: { deployment: { include: { manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } } } },
      });
      if (!check) throw new NotFoundException('Control de recepción no encontrado');
      orderId = check.deployment.manufacturingOrderId;
      const order = check.deployment.manufacturingOrder;
      if (actor.role === 'VIEWER' || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new ForbiddenException('No puedes ejecutar esta recepción');
      if (!['PENDING_RECEPTION', 'RECEPTION_IN_PROGRESS', 'RECEPTION_BLOCKED'].includes(check.deployment.status)) throw new ConflictException('La recepción técnica ya está cerrada');
      this.version(check, dto?.lockVersion, 'El control');
      const status = String(dto?.status || '').toUpperCase();
      if (!['PENDING', 'PASSED', 'FAILED', 'NOT_APPLICABLE'].includes(status)) throw new BadRequestException('Resultado de control inválido');
      if (status === 'NOT_APPLICABLE' && check.required) throw new ConflictException('Un control obligatorio no puede omitirse');
      const evidenceReference = status === 'PENDING' ? null : this.text(dto?.evidenceReference);
      if (status === 'PASSED' && check.evidenceRequired && !evidenceReference) throw new BadRequestException('Este control requiere evidencia');
      const completed = status !== 'PENDING';
      await tx.manufacturingSiteReceiptCheck.update({
        where: { id: check.id },
        data: { status, evidenceReference, notes: completed ? this.text(dto?.notes) : null, completedAt: completed ? new Date() : null, completedByUserId: completed ? actor.id : null, completedByName: completed ? actor.name : null, lockVersion: { increment: 1 } },
      });
      await tx.manufacturingSiteDeployment.update({ where: { id: check.deploymentId }, data: { status: 'RECEPTION_IN_PROGRESS', receiptDecision: null, lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, check.id, 'SITE_RECEIPT_CHECK_UPDATED', `${check.name}: ${status}`, actor, { status, evidenceReference });
    });
    return this.list(orderId);
  }

  async completeReceipt(deploymentId: string, dto: CompleteManufacturingSiteReceiptDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const deployment = await this.locked(tx, tenantId, deploymentId, actor); orderId = deployment.manufacturingOrderId;
      if (actor.role === 'VIEWER') throw new ForbiddenException('No puedes cerrar la recepción');
      if (!['PENDING_RECEPTION', 'RECEPTION_IN_PROGRESS', 'RECEPTION_BLOCKED'].includes(deployment.status)) throw new ConflictException('La recepción técnica ya está cerrada');
      this.version(deployment, dto?.lockVersion);
      const decision = String(dto?.decision || '').toUpperCase();
      if (!['ACCEPTED', 'ACCEPTED_WITH_OBSERVATIONS', 'BLOCKED'].includes(decision)) throw new BadRequestException('Decisión de recepción inválida');
      const pending = deployment.receiptChecks.filter((item: any) => item.required && item.status === 'PENDING');
      if (pending.length) throw new ConflictException(`Faltan ${pending.length} controles obligatorios`);
      const failed = deployment.receiptChecks.filter((item: any) => item.status === 'FAILED');
      if (decision === 'ACCEPTED' && failed.length) throw new ConflictException('Una recepción sin observaciones no puede contener controles fallidos');
      if (decision === 'BLOCKED' && !failed.length) throw new ConflictException('Para bloquear la recepción debe existir al menos un control fallido');
      const receivedByName = this.text(dto?.receivedByName); const evidence = this.text(dto?.evidenceReference);
      if (!receivedByName || !evidence) throw new BadRequestException('Registra quién recibe y la evidencia de recepción');
      const status = decision === 'BLOCKED' ? 'RECEPTION_BLOCKED' : 'RECEIVED';
      await tx.manufacturingSiteDeployment.update({
        where: { id: deployment.id },
        data: { status, receiptDecision: decision, receivedAt: new Date(), receivedByUserId: actor.id, receivedByName, receptionNotes: this.text(dto?.notes), receptionEvidenceReference: evidence, lockVersion: { increment: 1 } },
      });
      await this.audit(tx, tenantId, orderId, deployment.id, 'SITE_RECEIPT_COMPLETED', `${deployment.deploymentCode}: ${decision}`, actor, { decision, failedChecks: failed.map((item: any) => item.code) });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    });
    return this.list(orderId);
  }

  async createInstallation(deploymentId: string, dto: CreateManufacturingSiteInstallationDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede programar la instalación');
      const deployment = await this.locked(tx, tenantId, deploymentId, actor); orderId = deployment.manufacturingOrderId;
      this.version(deployment, dto?.lockVersion);
      if (deployment.status !== 'RECEIVED') throw new ConflictException('La recepción técnica debe estar aceptada');
      if (deployment.assemblyExecutionId) throw new ConflictException('La unidad ya tiene un montaje asociado');
      const order = deployment.manufacturingOrder;
      const unit = deployment.manufacturedUnit;
      let asset = unit.assetId ? await tx.asset.findFirst({ where: { id: unit.assetId, tenantId } }) : null;
      if (!asset) {
        const assetCode = this.text(dto?.assetCode) || this.text(unit.internalCode) || this.text(unit.serialNumber) || `${order.number}-U${String(unit.unitNumber).padStart(2, '0')}`;
        if (await tx.asset.count({ where: { tenantId, code: assetCode } })) throw new ConflictException(`Ya existe un activo con código ${assetCode}`);
        if (unit.serialNumber && await tx.asset.count({ where: { tenantId, serialNumber: unit.serialNumber } })) throw new ConflictException(`Ya existe un activo con serial ${unit.serialNumber}`);
        asset = await tx.asset.create({ data: { tenantId, code: assetCode, name: this.text(dto?.assetName) || order.productName, customer: this.text(dto?.customer) || order.customerName, model: order.model, serialNumber: unit.serialNumber, status: 'COMMISSIONING' } });
        await tx.manufacturedUnit.update({ where: { id: unit.id }, data: { assetId: asset.id } });
      }
      const installation = await this.assemblies.createForAsset(tx, tenantId, {
        assetCode: asset.code, templateId: dto.templateId, technicianIds: dto.technicianIds,
        title: this.text(dto?.title) || `Montaje en sitio - ${asset.name}`,
        description: this.text(dto?.description) || `Instalación de ${deployment.deploymentCode} en ${deployment.deliveryAddress || deployment.destination || 'sitio del cliente'}`,
        scheduledStartAt: dto.scheduledStartAt, scheduleTimezone: dto.scheduleTimezone,
        workdayStartMinute: dto.workdayStartMinute, workdayEndMinute: dto.workdayEndMinute,
        workingDays: dto.workingDays, excludedDates: dto.excludedDates,
      });
      await tx.manufacturingSiteDeployment.update({ where: { id: deployment.id }, data: { assetId: asset.id, assemblyExecutionId: installation.id, status: 'INSTALLATION_PLANNED', lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, deployment.id, 'SITE_INSTALLATION_CREATED', `${deployment.deploymentCode}: montaje ${installation.id} programado`, actor, { assetId: asset.id, assemblyExecutionId: installation.id, templateId: dto.templateId });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  private async locked(tx: any, tenantId: string, deploymentId: string, actor: Actor) {
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingSiteDeployment" WHERE "id" = ${deploymentId} FOR UPDATE`;
    const deployment = await tx.manufacturingSiteDeployment.findFirst({
      where: { id: deploymentId, tenantId },
      include: { ...this.include(), manufacturingOrder: { include: { members: { where: { userId: actor.id } } } } },
    });
    if (!deployment) throw new NotFoundException('Expediente de instalación no encontrado');
    if (actor.role === 'TECH' && deployment.manufacturingOrder.responsibleUserId !== actor.id && !deployment.manufacturingOrder.members.length) throw new NotFoundException('Expediente de instalación no encontrado');
    if (['CANCELED', 'ON_HOLD', 'COMPLETED'].includes(deployment.manufacturingOrder.status)) throw new ConflictException('La orden no permite gestionar la instalación');
    return deployment;
  }

  private serialize(deployment: any) {
    const checks = deployment.receiptChecks || [];
    const activities = deployment.assemblyExecution?.activities || [];
    const completedActivities = activities.filter((item: any) => ['COMPLETED', 'NOT_APPLICABLE'].includes(item.status)).length;
    return {
      ...deployment,
      summary: {
        checkCount: checks.length,
        passedCount: checks.filter((item: any) => item.status === 'PASSED').length,
        failedCount: checks.filter((item: any) => item.status === 'FAILED').length,
        pendingCount: checks.filter((item: any) => item.status === 'PENDING').length,
        receiptProgressPercent: checks.length ? Math.round(checks.filter((item: any) => item.status !== 'PENDING').length * 100 / checks.length) : 0,
        installationProgressPercent: activities.length ? Math.round(completedActivities * 100 / activities.length) : 0,
        readyForSat: deployment.status === 'READY_FOR_SAT',
      },
    };
  }

  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) {
    await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('CHECK') ? 'ManufacturingSiteReceiptCheck' : 'ManufacturingSiteDeployment', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } });
  }
}
