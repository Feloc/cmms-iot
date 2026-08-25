import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { InspectManufacturingSupplyDeliveryDto, ResolveManufacturingQuarantineDto } from './dto/manufacturing-supply.dto';
import { ManufacturingSupplyService } from './manufacturing-supply.service';

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingSupplyInspectionsService {
  constructor(private readonly prisma: PrismaService, private readonly supply: ManufacturingSupplyService) {}
  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede registrar inspecciones'); return actor; }
  private amount(value: unknown) { if (value === undefined || value === null || value === '') return 0; const amount = Number(value); if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('Las cantidades deben ser números no negativos'); return amount; }
  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }
  private date(value: unknown) { if (value === undefined || value === null || value === '') return new Date(); const date = new Date(value as any); if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha de inspección inválida'); return date; }

  async inspect(deliveryId: string, dto: InspectManufacturingSupplyDeliveryDto) { return this.decide(deliveryId, dto, false); }
  async resolveQuarantine(deliveryId: string, dto: ResolveManufacturingQuarantineDto) { return this.decide(deliveryId, dto, true); }

  private async decide(deliveryId: string, dto: InspectManufacturingSupplyDeliveryDto | ResolveManufacturingQuarantineDto, fromQuarantine: boolean) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSupplyDelivery" WHERE "id" = ${deliveryId} FOR UPDATE`;
      const delivery = await tx.manufacturingSupplyDelivery.findFirst({ where: { id: deliveryId, tenantId }, include: { supplyRequest: { include: { supplyRequirement: { include: { supplyPlan: { include: { manufacturingOrder: true } } } } } } } });
      if (!delivery) throw new NotFoundException('Entrega no encontrada');
      const version = Number(dto?.lockVersion); if (!Number.isInteger(version) || version !== delivery.lockVersion) throw new ConflictException('La inspección cambió; actualiza la pantalla');
      const order = delivery.supplyRequest.supplyRequirement.supplyPlan.manufacturingOrder; orderId = order.id;
      if (order.status === 'CANCELED') throw new ConflictException('La orden está cancelada'); if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
      const accepted = this.amount(dto.acceptedQuantity); const rejected = this.amount(dto.rejectedQuantity);
      const quarantined = fromQuarantine ? 0 : this.amount((dto as InspectManufacturingSupplyDeliveryDto).quarantinedQuantity);
      const total = accepted + rejected + quarantined; if (total <= 0) throw new BadRequestException('Debes registrar al menos una cantidad');
      const available = fromQuarantine ? Number(delivery.quarantinedQuantity) : Number(delivery.quantity) - Number(delivery.acceptedQuantity) - Number(delivery.rejectedQuantity) - Number(delivery.quarantinedQuantity);
      if (total > available + 1e-9) throw new ConflictException(`Solo hay ${available} unidades pendientes para esta decisión`);
      const nextAccepted = Number(delivery.acceptedQuantity) + accepted;
      const nextRejected = Number(delivery.rejectedQuantity) + rejected;
      const nextQuarantined = Number(delivery.quarantinedQuantity) + quarantined - (fromQuarantine ? total : 0);
      const unclassified = Number(delivery.quantity) - nextAccepted - nextRejected - nextQuarantined;
      const status = unclassified > 1e-9 ? 'PARTIAL' : nextQuarantined > 1e-9 ? 'QUARANTINED' : 'CLOSED';
      await tx.manufacturingSupplyDelivery.update({ where: { id: delivery.id }, data: { acceptedQuantity: nextAccepted, rejectedQuantity: nextRejected, quarantinedQuantity: nextQuarantined, inspectionStatus: status, lockVersion: { increment: 1 } } });
      const inspectedAt = this.date(dto.inspectedAt); const common = { tenantId, supplyDeliveryId: delivery.id, inspectedAt, reference: this.text(dto.reference), notes: this.text(dto.notes), inspectedByUserId: actor.id, inspectedByName: actor.name };
      const decisions: any[] = [];
      if (accepted > 0) decisions.push({ ...common, decisionType: fromQuarantine ? 'ACCEPT_FROM_QUARANTINE' : 'ACCEPT', quantity: accepted });
      if (rejected > 0) decisions.push({ ...common, decisionType: fromQuarantine ? 'REJECT_FROM_QUARANTINE' : 'REJECT', quantity: rejected });
      if (quarantined > 0) decisions.push({ ...common, decisionType: 'QUARANTINE', quantity: quarantined });
      await tx.manufacturingInspectionDecision.createMany({ data: decisions });
      if (accepted > 0) {
        const requirement = delivery.supplyRequest.supplyRequirement; const required = Number(requirement.requiredQuantity);
        const fulfilled = Math.min(required, Number(requirement.fulfilledQuantity) + accepted);
        await tx.manufacturingSupplyRequirement.update({ where: { id: requirement.id }, data: { fulfilledQuantity: fulfilled, status: fulfilled >= required ? 'FULFILLED' : 'PARTIAL', updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
        await this.completePlanIfReady(tx, tenantId, requirement.supplyPlanId);
      }
      await this.audit(tx, tenantId, orderId, delivery.id, fromQuarantine ? 'SUPPLY_QUARANTINE_RESOLVED' : 'SUPPLY_DELIVERY_INSPECTED', `${delivery.supplyRequest.requestCode}: inspección registrada`, actor, { accepted, rejected, quarantined, status });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.supply.list(orderId);
  }
  private async completePlanIfReady(tx: any, tenantId: string, planId: string) { const pending = await tx.manufacturingSupplyRequirement.count({ where: { tenantId, supplyPlanId: planId, included: true, status: { not: 'FULFILLED' } } }); if (!pending) await tx.manufacturingSupplyPlan.update({ where: { id: planId }, data: { status: 'COMPLETED', completedAt: new Date(), lockVersion: { increment: 1 } } }); }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: 'ManufacturingSupplyDelivery', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
