import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { formatManufacturingOrderNumber } from '../manufacturing/manufacturing.domain';
import { ManufacturingQuickService } from '../manufacturing/manufacturing-quick.service';
import { assertDemandTransition, demandProgress } from './after-sales-part-demands.domain';
import {
  CreateAfterSalesPartDemandDto,
  CreateSparePartManufacturingOrderDto,
  UpdateAfterSalesPartDemandDto,
} from './dto/after-sales-part-demand.dto';

const REASONS = new Set(['NORMAL_WEAR', 'PREMATURE_FAILURE', 'ACCIDENTAL_DAMAGE', 'DESIGN_DEFECT', 'TRANSPORT_DAMAGE', 'MISUSE', 'UNKNOWN']);
const COVERAGES = new Set(['PENDING_REVIEW', 'WARRANTY_APPROVED', 'WARRANTY_REJECTED', 'CUSTOMER_BILLABLE', 'GOODWILL', 'INTERNAL_COST']);
const ROUTES = new Set(['STOCK', 'BUY', 'MAKE', 'SUBCONTRACT']);
const STATUSES = new Set(['VALIDATED', 'SOURCING', 'IN_PRODUCTION', 'QUALITY_PENDING', 'READY', 'PARTIALLY_FULFILLED', 'FULFILLED', 'ON_HOLD', 'CANCELED']);
type Actor = { id: string; name: string; role: string };

@Injectable()
export class AfterSalesPartDemandsService {
  constructor(private readonly prisma: PrismaService, private readonly quick: ManufacturingQuickService) {}

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

  private async serviceOrder(tx: any, tenantId: string, serviceOrderId: string, actor: Actor, requireAdmin = false) {
    const order = await tx.workOrder.findFirst({
      where: { id: serviceOrderId, tenantId, kind: 'SERVICE_ORDER' },
      include: { assignments: { where: { userId: actor.id, state: 'ACTIVE' }, select: { id: true } } },
    });
    if (!order) throw new NotFoundException('Orden de servicio no encontrada');
    if (requireAdmin && actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede realizar esta acción');
    if (actor.role === 'VIEWER' || (actor.role === 'TECH' && !order.assignments.length)) throw new ForbiddenException('No tienes permisos sobre esta orden de servicio');
    return order;
  }

  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }
  private date(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value as any);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');
    return date;
  }
  private enumValue(value: unknown, values: Set<string>, field: string, fallback?: string) {
    const normalized = String(value ?? fallback ?? '').trim().toUpperCase();
    if (!values.has(normalized)) throw new BadRequestException(`${field} inválido`);
    return normalized;
  }
  private quantity(value: unknown, field: string) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException(`${field} debe ser mayor que cero`);
    return quantity;
  }

  private include() {
    return {
      asset: { select: { id: true, code: true, name: true, customer: true, model: true, serialNumber: true, guarantee: true } },
      inventoryItem: { select: { id: true, sku: true, name: true, uom: true, qty: true, oemPartNo: true, quickManufacturingProfiles: { where: { status: 'APPROVED', OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, select: { id: true, revision: true, recipe: true }, orderBy: { revision: 'desc' }, take: 1 } } },
      serviceOrderPart: { select: { id: true, qty: true, stage: true, notes: true, freeText: true } },
      manufacturingOrder: { select: { id: true, number: true, orderType: true, status: true, quantity: true, responsibleUser: { select: { id: true, name: true } } } },
      sourceManufacturingOrder: { select: { id: true, number: true, status: true } },
    };
  }

  private serialize(row: any) {
    return { ...row, requestedQuantity: Number(row.requestedQuantity), fulfilledQuantity: Number(row.fulfilledQuantity), installedQuantity: Number(row.installedQuantity), directDeliveredQuantity: Number(row.directDeliveredQuantity) };
  }

  async list(serviceOrderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.serviceOrder(this.prisma as any, tenantId, serviceOrderId, actor);
    const rows = await (this.prisma as any).afterSalesPartDemand.findMany({
      where: { tenantId, serviceOrderId }, include: this.include(), orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((row: any) => this.serialize(row));
  }

  async create(serviceOrderId: string, partId: string, dto: CreateAfterSalesPartDemandDto) {
    const { tenantId, userId } = this.context(); let createdId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const order = await this.serviceOrder(tx, tenantId, serviceOrderId, actor);
      await tx.$queryRaw`SELECT "id" FROM "ServiceOrderPart" WHERE "id" = ${partId} FOR UPDATE`;
      const part = await tx.serviceOrderPart.findFirst({
        where: { id: partId, tenantId, workOrderId: serviceOrderId }, include: { inventoryItem: true },
      });
      if (!part) throw new NotFoundException('Repuesto requerido no encontrado');
      if (part.stage !== 'REQUIRED') throw new ConflictException('Solo se gestionan repuestos pendientes');
      if (!part.inventoryItemId || !part.inventoryItem) throw new ConflictException('Vincula el repuesto al catálogo antes de gestionar su abastecimiento');
      if (await tx.afterSalesPartDemand.count({ where: { tenantId, serviceOrderPartId: partId } })) throw new ConflictException('El repuesto ya tiene una demanda posventa');
      const asset = await tx.asset.findFirst({
        where: { tenantId, code: order.assetCode },
        include: { manufacturedUnit: { select: { manufacturingOrderId: true } } },
      });
      if (!asset) throw new ConflictException('La orden de servicio no tiene un activo válido');
      const requestedQuantity = this.quantity(dto?.requestedQuantity ?? part.qty, 'requestedQuantity');
      if (requestedQuantity > Number(part.qty) + 1e-9) throw new ConflictException(`La línea solo tiene ${part.qty} unidades pendientes`);
      const supplyRoute = this.enumValue(dto?.supplyRoute, ROUTES, 'supplyRoute');
      if (supplyRoute === 'MAKE' && !Number.isInteger(requestedQuantity)) throw new BadRequestException('La fabricación interna requiere una cantidad entera');
      const created = await tx.afterSalesPartDemand.create({ data: {
        tenantId, serviceOrderId, serviceOrderPartId: part.id, assetId: asset.id, inventoryItemId: part.inventoryItemId,
        sourceManufacturingOrderId: asset.manufacturedUnit?.manufacturingOrderId || null,
        status: supplyRoute === 'STOCK' ? 'SOURCING' : 'VALIDATED',
        replacementReason: this.enumValue(dto?.replacementReason, REASONS, 'replacementReason', 'UNKNOWN'),
        coverageStatus: this.enumValue(dto?.coverageStatus, COVERAGES, 'coverageStatus', 'PENDING_REVIEW'),
        supplyRoute, requestedQuantity, requiredAt: this.date(dto?.requiredAt), notes: this.text(dto?.notes),
        createdByUserId: actor.id, createdByName: actor.name,
      } });
      createdId = created.id;
      await tx.serviceOrderIssue.updateMany({ where: { tenantId, workOrderId: serviceOrderId, status: { notIn: ['RESOLVED', 'VERIFIED', 'CANCELED'] } }, data: { status: 'WAITING_PARTS' } });
    }, { isolationLevel: 'Serializable' });
    const row = await (this.prisma as any).afterSalesPartDemand.findFirst({ where: { id: createdId, tenantId }, include: this.include() });
    return this.serialize(row);
  }

  async update(serviceOrderId: string, demandId: string, dto: UpdateAfterSalesPartDemandDto) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await this.serviceOrder(tx, tenantId, serviceOrderId, actor, true);
      await tx.$queryRaw`SELECT "id" FROM "AfterSalesPartDemand" WHERE "id" = ${demandId} FOR UPDATE`;
      const demand = await tx.afterSalesPartDemand.findFirst({ where: { id: demandId, tenantId, serviceOrderId } });
      if (!demand) throw new NotFoundException('Demanda posventa no encontrada');
      const lockVersion = Number(dto?.lockVersion);
      if (!Number.isInteger(lockVersion) || lockVersion !== demand.lockVersion) throw new ConflictException('La demanda cambió; actualiza la pantalla');
      if (demand.status === 'CANCELED') throw new ConflictException('La demanda está cancelada');
      if (dto.status !== undefined && dto.fulfilledQuantity !== undefined) throw new BadRequestException('Actualiza la cantidad recibida o el estado en solicitudes separadas');
      if (demand.status === 'FULFILLED' && (dto.status !== undefined || dto.fulfilledQuantity !== undefined || dto.supplyRoute !== undefined)) throw new ConflictException('La demanda está cumplida');
      const data: any = { lockVersion: { increment: 1 }, updatedByUserId: actor.id };
      if (dto.removedPartDisposition !== undefined) {
        const value = dto.removedPartDisposition;
        if (!value || !['ANALYSIS', 'REPAIR', 'REUSE', 'SUPPLIER_RETURN', 'SCRAP', 'CUSTOMER', 'NOT_RECOVERED'].includes(value.disposition)) throw new BadRequestException('Disposición de pieza retirada inválida');
        if (Number(demand.installedQuantity) <= 0) throw new ConflictException('Registra primero la instalación del recambio');
        const notes = this.text(value.notes);
        if (!notes) throw new BadRequestException('Describe la disposición de la pieza retirada');
        data.removedPartDisposition = { disposition: value.disposition, notes, by: actor.id, byName: actor.name, at: new Date().toISOString() };
        if (demand.manufacturingOrderId) await tx.manufacturingAuditEvent.create({ data: {
          tenantId, manufacturingOrderId: demand.manufacturingOrderId, entityType: 'AfterSalesPartDemand', entityId: demand.id,
          action: 'REMOVED_PART_DISPOSITION', summary: `${value.disposition}: ${notes}`, actorUserId: actor.id, actorName: actor.name,
          beforeData: demand.removedPartDisposition || {}, afterData: data.removedPartDisposition,
        } });
      }
      if (demand.manufacturingOrderId && (dto.fulfilledQuantity !== undefined || dto.status !== undefined)) throw new ConflictException('El progreso de una demanda con OF se actualiza desde manufactura e instalación');
      if (dto.replacementReason !== undefined) data.replacementReason = this.enumValue(dto.replacementReason, REASONS, 'replacementReason');
      if (dto.coverageStatus !== undefined) data.coverageStatus = this.enumValue(dto.coverageStatus, COVERAGES, 'coverageStatus');
      if (dto.supplyRoute !== undefined) {
        const route = this.enumValue(dto.supplyRoute, ROUTES, 'supplyRoute');
        if (demand.manufacturingOrderId && route !== 'MAKE') throw new ConflictException('La demanda ya tiene una orden de fabricación');
        data.supplyRoute = route;
      }
      if (dto.requiredAt !== undefined) data.requiredAt = this.date(dto.requiredAt);
      if (dto.notes !== undefined) data.notes = this.text(dto.notes);
      if (dto.fulfilledQuantity !== undefined) {
        const fulfilled = Number(dto.fulfilledQuantity);
        if (!Number.isFinite(fulfilled) || fulfilled < 0 || fulfilled > Number(demand.requestedQuantity)) throw new BadRequestException('fulfilledQuantity fuera del rango permitido');
        data.status = demandProgress(Number(demand.requestedQuantity), fulfilled, Number(demand.installedQuantity));
        if (fulfilled < Number(demand.directDeliveredQuantity)) throw new ConflictException('La cantidad recibida no puede ser menor que la entrega directa');
        if (demand.status === 'ON_HOLD') data.status = 'ON_HOLD';
        data.fulfilledQuantity = fulfilled;
      }
      if (dto.status !== undefined && dto.fulfilledQuantity === undefined) {
        const status = this.enumValue(dto.status, STATUSES, 'status');
        assertDemandTransition(demand.status, status, Number(demand.requestedQuantity), Number(demand.fulfilledQuantity), Number(demand.installedQuantity));
        const reason = this.text(dto.reason);
        if (['ON_HOLD', 'CANCELED'].includes(status) && !reason) throw new BadRequestException('Debes indicar el motivo');
        data.status = status;
        if (status !== 'ON_HOLD') data.holdReason = null;
        if (status === 'ON_HOLD') data.holdReason = reason;
        if (status === 'CANCELED') {
          if (demand.manufacturingOrderId) throw new ConflictException('Cancela primero la orden de manufactura vinculada');
          data.canceledReason = reason;
        }
      }
      await tx.afterSalesPartDemand.update({ where: { id: demand.id }, data });
    });
    const row = await (this.prisma as any).afterSalesPartDemand.findFirst({ where: { id: demandId, tenantId }, include: this.include() });
    return this.serialize(row);
  }

  async createManufacturingOrder(serviceOrderId: string, demandId: string, dto: CreateSparePartManufacturingOrderDto) {
    const { tenantId, userId } = this.context(); let manufacturingOrderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      const serviceOrder = await this.serviceOrder(tx, tenantId, serviceOrderId, actor, true);
      await tx.$queryRaw`SELECT "id" FROM "AfterSalesPartDemand" WHERE "id" = ${demandId} FOR UPDATE`;
      const demand = await tx.afterSalesPartDemand.findFirst({
        where: { id: demandId, tenantId, serviceOrderId }, include: { asset: true, inventoryItem: true },
      });
      if (!demand) throw new NotFoundException('Demanda posventa no encontrada');
      if (demand.supplyRoute !== 'MAKE') throw new ConflictException('La demanda no tiene ruta de fabricación interna');
      if (demand.manufacturingOrderId) throw new ConflictException('La demanda ya tiene una orden de manufactura');
      if (['CANCELED', 'FULFILLED'].includes(demand.status)) throw new ConflictException('La demanda está cerrada');
      if (demand.status === 'ON_HOLD') throw new ConflictException('Reanuda la demanda antes de crear una orden de manufactura');
      const quantity = Number(demand.requestedQuantity) - Number(demand.fulfilledQuantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new ConflictException('La cantidad pendiente debe estar entre 1 y 1000');
      const executionMode = dto?.executionMode || 'STANDARD';
      if (!['STANDARD', 'EXPEDITED'].includes(executionMode)) throw new BadRequestException('Modalidad de ejecución inválida');
      const responsibleId = this.text(dto?.responsibleUserId) || actor.id;
      const responsible = await tx.user.findFirst({ where: { id: responsibleId, tenantId }, select: { id: true, name: true } });
      if (!responsible) throw new BadRequestException('El responsable no pertenece al tenant actual');
      const plannedStartAt = this.date(dto?.plannedStartAt); const plannedEndAt = this.date(dto?.plannedEndAt);
      if (plannedStartAt && plannedEndAt && plannedEndAt < plannedStartAt) throw new BadRequestException('La fecha final no puede ser anterior a la inicial');
      const year = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric' }).format(new Date()));
      const sequence = await tx.manufacturingNumberSequence.upsert({
        where: { tenantId_year: { tenantId, year } }, create: { tenantId, year, lastValue: 1 }, update: { lastValue: { increment: 1 } },
      });
      const number = formatManufacturingOrderNumber(year, sequence.lastValue);
      const order = await tx.manufacturingOrder.create({ data: {
        tenantId, number, orderType: 'SPARE_PART', executionMode, projectName: `Recambio ${demand.inventoryItem.sku} · ${demand.asset.code}`,
        productCode: demand.inventoryItem.sku, productName: demand.inventoryItem.name, model: demand.asset.model,
        quantity, priority: serviceOrder.priority, customerName: demand.asset.customer,
        customerReference: `OS ${serviceOrder.id}`, commercialReference: demand.coverageStatus,
        description: this.text(dto?.description) || demand.notes || `Fabricación posventa para ${demand.asset.code}`,
        requestedDeliveryAt: this.date(dto?.requestedDeliveryAt) || demand.requiredAt,
        plannedStartAt, plannedEndAt, responsibleUserId: responsible.id, createdByUserId: actor.id,
        outputInventoryItemId: demand.inventoryItemId,
        units: { create: Array.from({ length: quantity }, (_, index) => ({ tenantId, unitNumber: index + 1 })) },
        members: { create: [{ tenantId, userId: responsible.id, function: 'RESPONSIBLE' }] },
      } });
      manufacturingOrderId = order.id;
      if (executionMode === 'EXPEDITED') await this.quick.initialize(tx, order, String(dto.profileId || ''), actor, dto.materialWarehouse);
      await tx.afterSalesPartDemand.update({ where: { id: demand.id }, data: { manufacturingOrderId: order.id, status: 'IN_PRODUCTION', updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      await tx.manufacturingAuditEvent.create({ data: {
        tenantId, manufacturingOrderId: order.id, entityType: 'ManufacturingOrder', entityId: order.id, action: 'SPARE_PART_ORDER_CREATED',
        summary: `Orden ${number} creada desde demanda posventa de ${demand.asset.code}`, actorUserId: actor.id, actorName: actor.name,
        metadata: { afterSalesPartDemandId: demand.id, serviceOrderId, serviceOrderPartId: demand.serviceOrderPartId, assetId: demand.assetId },
      } });
    }, { isolationLevel: 'Serializable' });
    const demand = await (this.prisma as any).afterSalesPartDemand.findFirst({ where: { id: demandId, tenantId }, include: this.include() });
    return { demand: this.serialize(demand), manufacturingOrder: demand.manufacturingOrder, manufacturingOrderId };
  }
}
