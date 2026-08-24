import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { GenerateManufacturingSupplyPlanDto, UpdateManufacturingSupplyRequirementDto } from './dto/manufacturing-supply.dto';
import { takeAvailableStock } from './manufacturing.domain';

const SUPPLY_TYPES = new Set(['STOCK', 'BUY', 'MAKE', 'SUBCONTRACT']);
const REQUIREMENT_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'PARTIAL', 'FULFILLED', 'CANCELED']);
type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingSupplyService {
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

  private requireAdmin(actor: Actor) { if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar el plan de abastecimiento'); }

  private async orderContext(tx: any, orderId: string, tenantId: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id }, select: { id: true } } } });
    if (!order) throw new NotFoundException('Orden de manufactura no encontrada');
    if (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length) throw new NotFoundException('Orden de manufactura no encontrada');
    return order;
  }

  private mutableOrder(order: any) {
    if (order.status === 'CANCELED') throw new ConflictException('La orden está cancelada');
    if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
  }

  private planInclude() {
    return {
      engineeringRelease: { select: { id: true, releaseCode: true, status: true, releasedAt: true } },
      requirements: {
        include: {
          inventoryItem: { select: { id: true, sku: true, name: true, uom: true, qty: true, status: true, stocks: { orderBy: [{ warehouse: 'asc' }, { binLocation: 'asc' }] } } },
          stockReservations: { orderBy: { createdAt: 'asc' } },
          supplyRequests: { include: { deliveries: { orderBy: { deliveredAt: 'desc' } } }, orderBy: { sequence: 'asc' } },
        },
        orderBy: { positionSnapshot: 'asc' },
      },
    };
  }

  private number(value: unknown) { return Number(value || 0); }

  private serialize(plan: any, currentReleaseId?: string | null) {
    const requirements = (plan.requirements || []).map((item: any) => {
      const stockReservations = (item.stockReservations || []).map((reservation: any) => ({
        ...reservation,
        reservedQuantity: this.number(reservation.reservedQuantity), issuedQuantity: this.number(reservation.issuedQuantity),
        releasedQuantity: this.number(reservation.releasedQuantity),
        outstandingQuantity: Math.max(0, this.number(reservation.reservedQuantity) - this.number(reservation.issuedQuantity) - this.number(reservation.releasedQuantity)),
      }));
      const reservationSummary = stockReservations.reduce((summary: any, reservation: any) => ({
        reservedQuantity: summary.reservedQuantity + reservation.reservedQuantity,
        issuedQuantity: summary.issuedQuantity + reservation.issuedQuantity,
        releasedQuantity: summary.releasedQuantity + reservation.releasedQuantity,
        outstandingQuantity: summary.outstandingQuantity + reservation.outstandingQuantity,
      }), { reservedQuantity: 0, issuedQuantity: 0, releasedQuantity: 0, outstandingQuantity: 0 });
      const supplyRequests = (item.supplyRequests || []).map((request: any) => ({
        ...request, requestedQuantity: this.number(request.requestedQuantity), deliveredQuantity: this.number(request.deliveredQuantity),
        canceledQuantity: this.number(request.canceledQuantity),
        outstandingQuantity: Math.max(0, this.number(request.requestedQuantity) - this.number(request.deliveredQuantity) - this.number(request.canceledQuantity)),
        deliveries: (request.deliveries || []).map((delivery: any) => ({ ...delivery, quantity: this.number(delivery.quantity) })),
      }));
      const requestSummary = supplyRequests.reduce((summary: any, request: any) => ({
        requestedQuantity: summary.requestedQuantity + request.requestedQuantity,
        deliveredQuantity: summary.deliveredQuantity + request.deliveredQuantity,
        canceledQuantity: summary.canceledQuantity + request.canceledQuantity,
        outstandingQuantity: summary.outstandingQuantity + request.outstandingQuantity,
      }), { requestedQuantity: 0, deliveredQuantity: 0, canceledQuantity: 0, outstandingQuantity: 0 });
      return { ...item, stockReservations, reservationSummary, supplyRequests, requestSummary,
      quantityPerUnitSnapshot: this.number(item.quantityPerUnitSnapshot), requiredQuantity: this.number(item.requiredQuantity),
      stockOnHandSnapshot: this.number(item.stockOnHandSnapshot), stockReservedSnapshot: this.number(item.stockReservedSnapshot),
      stockAvailableSnapshot: this.number(item.stockAvailableSnapshot), stockCoveredQuantity: this.number(item.stockCoveredQuantity),
      plannedQuantity: this.number(item.plannedQuantity), fulfilledQuantity: this.number(item.fulfilledQuantity),
      inventoryItem: item.inventoryItem ? { ...item.inventoryItem, stocks: (item.inventoryItem.stocks || []).map((stock: any) => ({ ...stock, availableQuantity: Math.max(0, Number(stock.stockOnHand || 0) - Number(stock.stockReserved || 0)) })) } : null,
    }; });
    const included = requirements.filter((item: any) => item.included);
    const byType = (type: string) => included.filter((item: any) => item.plannedSupplyType === type).reduce((sum: number, item: any) => sum + item.plannedQuantity, 0);
    return {
      ...plan, requirements, isCurrentRelease: plan.engineeringReleaseId === currentReleaseId,
      summary: {
        requirementCount: requirements.length, includedCount: included.length,
        fulfilledCount: included.filter((item: any) => item.status === 'FULFILLED').length,
        openCount: included.filter((item: any) => !['FULFILLED', 'CANCELED'].includes(item.status)).length,
        stockCoveredQuantity: included.reduce((sum: number, item: any) => sum + item.stockCoveredQuantity, 0),
        reservedQuantity: included.reduce((sum: number, item: any) => sum + item.reservationSummary.outstandingQuantity, 0),
        issuedQuantity: included.reduce((sum: number, item: any) => sum + item.reservationSummary.issuedQuantity, 0),
        requestedQuantity: included.reduce((sum: number, item: any) => sum + item.requestSummary.outstandingQuantity, 0),
        deliveredQuantity: included.reduce((sum: number, item: any) => sum + item.requestSummary.deliveredQuantity, 0),
        stockQuantity: byType('STOCK'), buyQuantity: byType('BUY'), makeQuantity: byType('MAKE'), subcontractQuantity: byType('SUBCONTRACT'),
      },
    };
  }

  async list(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma as any, tenantId, userId);
    await this.orderContext(this.prisma as any, orderId, tenantId, actor);
    const currentRelease = await (this.prisma as any).engineeringRelease.findFirst({ where: { tenantId, manufacturingOrderId: orderId, status: 'RELEASED' }, select: { id: true } });
    const plans = await (this.prisma as any).manufacturingSupplyPlan.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: this.planInclude(), orderBy: { generatedAt: 'desc' } });
    return plans.map((plan: any) => this.serialize(plan, currentRelease?.id));
  }

  async generate(orderId: string, dto: GenerateManufacturingSupplyPlanDto) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await this.orderContext(tx, orderId, tenantId, actor); this.mutableOrder(order);
      const requestedReleaseId = String(dto?.engineeringReleaseId || '').trim();
      const release = await tx.engineeringRelease.findFirst({
        where: { tenantId, manufacturingOrderId: orderId, status: 'RELEASED', ...(requestedReleaseId ? { id: requestedReleaseId } : {}) },
        include: { bomRevision: { include: { bom: true, lines: { include: { inventoryItem: { include: { stocks: true } } }, orderBy: { position: 'asc' } } } } },
      });
      if (!release) throw new ConflictException('La orden no tiene una liberación vigente para planificar');
      const existing = await tx.manufacturingSupplyPlan.findUnique({ where: { engineeringReleaseId: release.id } });
      if (existing) throw new ConflictException(`Ya existe un plan para la liberación ${release.releaseCode}`);
      if (!release.bomRevision.lines.length) throw new ConflictException('La BOM liberada no contiene líneas');
      await tx.manufacturingSupplyPlan.updateMany({ where: { tenantId, manufacturingOrderId: orderId, status: 'ACTIVE' }, data: { status: 'SUPERSEDED', lockVersion: { increment: 1 } } });
      const plan = await tx.manufacturingSupplyPlan.create({ data: {
        tenantId, manufacturingOrderId: orderId, engineeringReleaseId: release.id, releaseCodeSnapshot: release.releaseCode,
        bomCodeSnapshot: release.bomRevision.bom.code, bomRevisionCodeSnapshot: release.bomRevision.revisionCode,
        orderQuantitySnapshot: order.quantity, generatedByUserId: actor.id, generatedByName: actor.name,
      } });
      const remainingByItem = new Map<string, number>();
      const rows = release.bomRevision.lines.map((line: any) => {
        const required = Number(line.quantityPerUnit) * order.quantity;
        const stocks = line.inventoryItem?.stocks || [];
        const onHand = stocks.length ? stocks.reduce((sum: number, stock: any) => sum + Number(stock.stockOnHand || 0), 0) : Number(line.inventoryItem?.qty || 0);
        const reserved = stocks.reduce((sum: number, stock: any) => sum + Number(stock.stockReserved || 0), 0);
        const available = Math.max(0, onHand - reserved);
        const included = !line.isOptional;
        const covered = takeAvailableStock(remainingByItem, { inventoryItemId: line.inventoryItemId, available, required, eligible: included && line.supplyType === 'STOCK' });
        const planned = included ? Math.max(0, required - covered) : 0;
        const status = !included ? 'CANCELED' : 'OPEN';
        return {
          tenantId, supplyPlanId: plan.id, bomLineId: line.id, inventoryItemId: line.inventoryItemId,
          positionSnapshot: line.position, levelSnapshot: line.level, itemCodeSnapshot: line.itemCode,
          descriptionSnapshot: line.description, uomSnapshot: line.uom, quantityPerUnitSnapshot: line.quantityPerUnit,
          orderQuantitySnapshot: order.quantity, requiredQuantity: required, isOptionalSnapshot: line.isOptional,
          included, engineeringSupplyType: line.supplyType, plannedSupplyType: line.supplyType,
          criticalitySnapshot: line.criticality, stockOnHandSnapshot: onHand, stockReservedSnapshot: reserved,
          stockAvailableSnapshot: available, stockCoveredQuantity: covered, plannedQuantity: planned,
          fulfilledQuantity: 0, status,
          supplier: line.preferredSupplier, expectedAt: line.leadTimeDays == null ? null : new Date(Date.now() + Number(line.leadTimeDays) * 86400000),
          notes: line.notes,
        };
      });
      await tx.manufacturingSupplyRequirement.createMany({ data: rows });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, plan.id, 'SUPPLY_PLAN_GENERATED', `Plan de abastecimiento generado desde ${release.releaseCode}`, actor, { releaseId: release.id, requirementCount: rows.length });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async updateRequirement(requirementId: string, dto: UpdateManufacturingSupplyRequirementDto) {
    const { tenantId, userId } = this.context();
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); this.requireAdmin(actor);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSupplyRequirement" WHERE "id" = ${requirementId} FOR UPDATE`;
      const requirement = await tx.manufacturingSupplyRequirement.findFirst({ where: { id: requirementId, tenantId }, include: { supplyPlan: { include: { manufacturingOrder: true } } } });
      if (!requirement) throw new NotFoundException('Necesidad de abastecimiento no encontrada');
      orderId = requirement.supplyPlan.manufacturingOrderId;
      this.mutableOrder(requirement.supplyPlan.manufacturingOrder);
      if (requirement.supplyPlan.status !== 'ACTIVE') throw new ConflictException('El plan ya no está activo');
      const observedVersion = Number(dto?.lockVersion);
      if (!Number.isInteger(observedVersion) || observedVersion !== requirement.lockVersion) throw new ConflictException('La necesidad cambió; actualiza la pantalla');
      const data: any = { lockVersion: { increment: 1 }, updatedByUserId: actor.id };
      const reservationCount = await tx.manufacturingStockReservation.count({ where: { tenantId, supplyRequirementId: requirementId } });
      if (reservationCount && ((dto.included !== undefined && !!dto.included !== requirement.included) || (dto.plannedSupplyType !== undefined && String(dto.plannedSupplyType).toUpperCase() !== requirement.plannedSupplyType))) throw new ConflictException('Libera o entrega las reservas existentes antes de cambiar la ruta o excluir la necesidad');
      const openRequestCount = await tx.manufacturingSupplyRequest.count({ where: { tenantId, supplyRequirementId: requirementId, status: { notIn: ['COMPLETED', 'CANCELED'] } } });
      if (openRequestCount && ((dto.included !== undefined && !!dto.included !== requirement.included) || (dto.plannedSupplyType !== undefined && String(dto.plannedSupplyType).toUpperCase() !== requirement.plannedSupplyType))) throw new ConflictException('Completa o cancela las solicitudes pendientes antes de cambiar la ruta o excluir la necesidad');
      let included = dto.included === undefined ? requirement.included : !!dto.included;
      if (!requirement.isOptionalSnapshot && !included) throw new BadRequestException('Una línea obligatoria no puede excluirse del plan');
      if (dto.plannedSupplyType !== undefined) {
        const type = String(dto.plannedSupplyType).toUpperCase(); if (!SUPPLY_TYPES.has(type)) throw new BadRequestException('plannedSupplyType inválido'); data.plannedSupplyType = type;
      }
      const required = Number(requirement.requiredQuantity);
      let fulfilled = dto.fulfilledQuantity === undefined ? Number(requirement.fulfilledQuantity) : Number(dto.fulfilledQuantity);
      if (requirement.plannedSupplyType === 'STOCK' && dto.fulfilledQuantity !== undefined && Math.abs(fulfilled - Number(requirement.fulfilledQuantity)) > 1e-9) throw new ConflictException('La cantidad cubierta por inventario se actualiza al entregar reservas');
      if (!Number.isFinite(fulfilled) || fulfilled < 0 || fulfilled > required) throw new BadRequestException('fulfilledQuantity debe estar entre cero y la cantidad requerida');
      let status = dto.status === undefined ? String(requirement.status) : String(dto.status).toUpperCase();
      if (!REQUIREMENT_STATUSES.has(status)) throw new BadRequestException('status inválido');
      if (!included) { status = 'CANCELED'; fulfilled = 0; Object.assign(data, { included: false, plannedQuantity: 0, fulfilledQuantity: 0 }); }
      else {
        if (requirement.status === 'CANCELED' && dto.status === undefined) status = 'OPEN';
        if (status === 'CANCELED') throw new BadRequestException('Para excluir una línea usa included=false');
        if (fulfilled >= required) status = 'FULFILLED';
        else if (status === 'FULFILLED') throw new BadRequestException('Para completar la necesidad, fulfilledQuantity debe alcanzar la cantidad requerida');
        else if (fulfilled > 0 && status === 'OPEN') status = 'PARTIAL';
        Object.assign(data, { included: true, plannedQuantity: Math.max(0, required - Number(requirement.stockCoveredQuantity)), fulfilledQuantity: fulfilled });
      }
      if (dto.supplier !== undefined) data.supplier = this.text(dto.supplier);
      if (dto.externalReference !== undefined) data.externalReference = this.text(dto.externalReference);
      if (dto.notes !== undefined) data.notes = this.text(dto.notes);
      if (dto.expectedAt !== undefined) data.expectedAt = this.date(dto.expectedAt);
      data.status = status;
      const updated = await tx.manufacturingSupplyRequirement.update({ where: { id: requirementId }, data });
      const remaining = await tx.manufacturingSupplyRequirement.count({ where: { tenantId, supplyPlanId: requirement.supplyPlanId, included: true, status: { not: 'FULFILLED' }, id: { not: requirementId } } });
      const includedOthers = await tx.manufacturingSupplyRequirement.count({ where: { tenantId, supplyPlanId: requirement.supplyPlanId, included: true, id: { not: requirementId } } });
      const willRemain = included && status !== 'FULFILLED';
      if (!remaining && !willRemain && (included || includedOthers > 0)) await tx.manufacturingSupplyPlan.update({ where: { id: requirement.supplyPlanId }, data: { status: 'COMPLETED', completedAt: new Date(), lockVersion: { increment: 1 } } });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, requirementId, 'SUPPLY_REQUIREMENT_UPDATED', `${requirement.itemCodeSnapshot}: necesidad actualizada`, actor, { status: updated.status, included: updated.included, plannedSupplyType: updated.plannedSupplyType, fulfilledQuantity: Number(updated.fulfilledQuantity) });
    });
    return this.list(orderId);
  }

  private text(value: unknown) { const text = String(value ?? '').trim(); return text || null; }
  private date(value: unknown) { if (value === null || value === '') return null; const date = new Date(value as any); if (Number.isNaN(date.getTime())) throw new BadRequestException('expectedAt no es una fecha válida'); return date; }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action === 'SUPPLY_PLAN_GENERATED' ? 'ManufacturingSupplyPlan' : 'ManufacturingSupplyRequirement', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
