import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CancelManufacturingSupplyRequestDto, CreateManufacturingSupplyRequestDto, DeliverManufacturingSupplyRequestDto, UpdateManufacturingSupplyRequestDto } from './dto/manufacturing-supply.dto';
import { ManufacturingSupplyService } from './manufacturing-supply.service';

type Actor = { id: string; name: string; role: string };
const EXECUTABLE_TYPES = new Set(['BUY', 'MAKE', 'SUBCONTRACT']);

@Injectable()
export class ManufacturingSupplyRequestsService {
  constructor(private readonly prisma: PrismaService, private readonly supply: ManufacturingSupplyService) {}

  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar solicitudes'); return actor; }
  private quantity(value: unknown) { const quantity = Number(value); if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor que cero'); return quantity; }
  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }
  private date(value: unknown, fallback?: Date) { if (value === undefined) return fallback; if (value === null || value === '') return null; const date = new Date(value as any); if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida'); return date; }

  private async requirement(tx: any, tenantId: string, requirementId: string) {
    const requirement = await tx.manufacturingSupplyRequirement.findFirst({ where: { id: requirementId, tenantId }, include: { supplyPlan: { include: { manufacturingOrder: true } } } });
    if (!requirement) throw new NotFoundException('Necesidad de abastecimiento no encontrada');
    if (requirement.supplyPlan.status !== 'ACTIVE') throw new ConflictException('El plan de abastecimiento ya no está activo');
    const order = requirement.supplyPlan.manufacturingOrder;
    if (order.status === 'CANCELED') throw new ConflictException('La orden está cancelada');
    if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
    if (!requirement.included || !EXECUTABLE_TYPES.has(requirement.plannedSupplyType)) throw new ConflictException('La necesidad no tiene una ruta operativa externa o interna válida');
    return requirement;
  }

  async create(requirementId: string, dto: CreateManufacturingSupplyRequestDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSupplyRequirement" WHERE "id" = ${requirementId} FOR UPDATE`;
      const requirement = await this.requirement(tx, tenantId, requirementId); orderId = requirement.supplyPlan.manufacturingOrderId;
      const quantity = this.quantity(dto?.quantity);
      const aggregate = await tx.manufacturingSupplyRequest.aggregate({ where: { tenantId, supplyRequirementId: requirementId }, _sum: { requestedQuantity: true, canceledQuantity: true } });
      const committed = Number(aggregate._sum.requestedQuantity || 0) - Number(aggregate._sum.canceledQuantity || 0);
      const remaining = Math.max(0, Number(requirement.requiredQuantity) - committed);
      if (quantity > remaining + 1e-9) throw new ConflictException(`La necesidad solo admite ${remaining} adicionales`);
      const last = await tx.manufacturingSupplyRequest.findFirst({ where: { tenantId, supplyRequirementId: requirementId }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
      const sequence = (last?.sequence || 0) + 1;
      const prefix = requirement.plannedSupplyType === 'BUY' ? 'SC' : requirement.plannedSupplyType === 'MAKE' ? 'OFI' : 'ST';
      const requestCode = `${requirement.supplyPlan.manufacturingOrder.number}-${prefix}-${String(requirement.positionSnapshot).padStart(3, '0')}-${String(sequence).padStart(2, '0')}`;
      const request = await tx.manufacturingSupplyRequest.create({ data: {
        tenantId, supplyRequirementId: requirementId, sequence, requestCode, requestType: requirement.plannedSupplyType,
        requestedQuantity: quantity, supplierOrResponsible: this.text(dto?.supplierOrResponsible) || requirement.supplier,
        externalReference: this.text(dto?.externalReference), promisedAt: this.date(dto?.promisedAt), notes: this.text(dto?.notes),
        createdByUserId: actor.id, createdByName: actor.name,
      } });
      await this.audit(tx, tenantId, orderId, request.id, 'SUPPLY_REQUEST_CREATED', `${requestCode}: solicitud creada por ${quantity}`, actor, { requirementId, requestType: request.requestType, quantity });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.supply.list(orderId);
  }

  async update(requestId: string, dto: UpdateManufacturingSupplyRequestDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const request = await this.lockedRequest(tx, tenantId, requestId); orderId = request.supplyRequirement.supplyPlan.manufacturingOrderId;
      this.assertVersion(request, dto?.lockVersion); this.mutable(request);
      const data: any = { lockVersion: { increment: 1 }, updatedByUserId: actor.id };
      if (dto.status !== undefined) { const status = String(dto.status).toUpperCase(); if (!['REQUESTED', 'IN_PROGRESS'].includes(status)) throw new BadRequestException('Estado inválido para actualización manual'); data.status = status; }
      if (dto.supplierOrResponsible !== undefined) data.supplierOrResponsible = this.text(dto.supplierOrResponsible);
      if (dto.externalReference !== undefined) data.externalReference = this.text(dto.externalReference);
      if (dto.promisedAt !== undefined) data.promisedAt = this.date(dto.promisedAt);
      if (dto.notes !== undefined) data.notes = this.text(dto.notes);
      await tx.manufacturingSupplyRequest.update({ where: { id: requestId }, data });
      await this.audit(tx, tenantId, orderId, requestId, 'SUPPLY_REQUEST_UPDATED', `${request.requestCode}: solicitud actualizada`, actor, data);
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    });
    return this.supply.list(orderId);
  }

  async deliver(requestId: string, dto: DeliverManufacturingSupplyRequestDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const request = await this.lockedRequest(tx, tenantId, requestId); orderId = request.supplyRequirement.supplyPlan.manufacturingOrderId;
      this.assertVersion(request, dto?.lockVersion); this.mutable(request);
      const quantity = this.quantity(dto?.quantity);
      const outstanding = Number(request.requestedQuantity) - Number(request.deliveredQuantity) - Number(request.canceledQuantity);
      if (quantity > outstanding + 1e-9) throw new ConflictException(`La solicitud solo tiene ${outstanding} pendientes`);
      const delivered = Number(request.deliveredQuantity) + quantity;
      const remaining = Number(request.requestedQuantity) - delivered - Number(request.canceledQuantity);
      const status = remaining <= 1e-9 ? 'COMPLETED' : 'PARTIAL';
      await tx.manufacturingSupplyDelivery.create({ data: { tenantId, supplyRequestId: request.id, quantity, deliveredAt: this.date(dto?.deliveredAt, new Date())!, reference: this.text(dto?.reference), notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name } });
      await tx.manufacturingSupplyRequest.update({ where: { id: request.id }, data: { deliveredQuantity: delivered, status, completedAt: status === 'COMPLETED' ? new Date() : null, updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      const required = Number(request.supplyRequirement.requiredQuantity);
      const fulfilled = Math.min(required, Number(request.supplyRequirement.fulfilledQuantity) + quantity);
      await tx.manufacturingSupplyRequirement.update({ where: { id: request.supplyRequirementId }, data: { fulfilledQuantity: fulfilled, status: fulfilled >= required ? 'FULFILLED' : 'PARTIAL', updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      await this.completePlanIfReady(tx, tenantId, request.supplyRequirement.supplyPlanId);
      await this.audit(tx, tenantId, orderId, request.id, 'SUPPLY_DELIVERY_RECORDED', `${request.requestCode}: ${quantity} recibidas/terminadas`, actor, { quantity, delivered, status, reference: dto?.reference });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.supply.list(orderId);
  }

  async cancel(requestId: string, dto: CancelManufacturingSupplyRequestDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId); const request = await this.lockedRequest(tx, tenantId, requestId); orderId = request.supplyRequirement.supplyPlan.manufacturingOrderId;
      this.assertVersion(request, dto?.lockVersion); this.mutable(request);
      const reason = this.text(dto?.reason); if (!reason || reason.length < 3) throw new BadRequestException('Debes indicar el motivo de cancelación');
      const outstanding = Number(request.requestedQuantity) - Number(request.deliveredQuantity) - Number(request.canceledQuantity);
      await tx.manufacturingSupplyRequest.update({ where: { id: request.id }, data: { canceledQuantity: Number(request.canceledQuantity) + outstanding, status: 'CANCELED', canceledAt: new Date(), notes: request.notes ? `${request.notes}\nCancelación: ${reason}` : `Cancelación: ${reason}`, updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, request.id, 'SUPPLY_REQUEST_CANCELED', `${request.requestCode}: saldo cancelado`, actor, { canceledQuantity: outstanding, reason });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    });
    return this.supply.list(orderId);
  }

  private async lockedRequest(tx: any, tenantId: string, requestId: string) {
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingSupplyRequest" WHERE "id" = ${requestId} FOR UPDATE`;
    const request = await tx.manufacturingSupplyRequest.findFirst({ where: { id: requestId, tenantId }, include: { supplyRequirement: { include: { supplyPlan: { include: { manufacturingOrder: true } } } } } });
    if (!request) throw new NotFoundException('Solicitud no encontrada');
    const order = request.supplyRequirement.supplyPlan.manufacturingOrder;
    if (order.status === 'CANCELED') throw new ConflictException('La orden está cancelada'); if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
    return request;
  }
  private assertVersion(request: any, value: unknown) { const version = Number(value); if (!Number.isInteger(version) || version !== request.lockVersion) throw new ConflictException('La solicitud cambió; actualiza la pantalla'); }
  private mutable(request: any) { if (['COMPLETED', 'CANCELED'].includes(request.status)) throw new ConflictException('La solicitud ya está cerrada'); }
  private async completePlanIfReady(tx: any, tenantId: string, planId: string) { const pending = await tx.manufacturingSupplyRequirement.count({ where: { tenantId, supplyPlanId: planId, included: true, status: { not: 'FULFILLED' } } }); if (!pending) await tx.manufacturingSupplyPlan.update({ where: { id: planId }, data: { status: 'COMPLETED', completedAt: new Date(), lockVersion: { increment: 1 } } }); }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: 'ManufacturingSupplyRequest', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
