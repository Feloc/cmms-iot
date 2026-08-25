import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { AdjustManufacturingKitLineDto, CancelManufacturingKitDto, ReleaseManufacturingKitDto, WaiveManufacturingKitLineDto } from './dto/manufacturing-supply.dto';

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingKitsService {
  constructor(private readonly prisma: PrismaService) {}
  private context() { const store = tenantStorage.getStore(); if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto'); return { tenantId: store.tenantId, userId: store.userId }; }
  private async actor(tx: any, tenantId: string, userId: string, admin = false): Promise<Actor> { const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } }); if (!actor) throw new ForbiddenException('Usuario no encontrado'); if (admin && actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar kits'); return actor; }
  private amount(value: unknown, allowZero = false) { const amount = Number(value); if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount <= 0)) throw new BadRequestException(allowZero ? 'La cantidad debe ser no negativa' : 'La cantidad debe ser mayor que cero'); return amount; }
  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }

  async list(orderId: string) {
    const { tenantId, userId } = this.context(); const actor = await this.actor(this.prisma as any, tenantId, userId);
    const order = await (this.prisma as any).manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { members: { where: { userId: actor.id } } } });
    if (!order || (actor.role === 'TECH' && order.responsibleUserId !== actor.id && !order.members.length)) throw new NotFoundException('Orden de manufactura no encontrada');
    const kits = await (this.prisma as any).manufacturingKit.findMany({ where: { tenantId, manufacturingOrderId: orderId }, include: { manufacturedUnit: true, lines: { include: { supplyRequirement: { select: { fulfilledQuantity: true, plannedSupplyType: true } } }, orderBy: { positionSnapshot: 'asc' } } }, orderBy: [{ manufacturedUnit: { unitNumber: 'asc' } }, { createdAt: 'asc' }] });
    const requirementIds = [...new Set(kits.flatMap((kit: any) => kit.lines.map((line: any) => line.supplyRequirementId)))] as string[];
    const allocated = requirementIds.length ? await (this.prisma as any).manufacturingKitLine.groupBy({ by: ['supplyRequirementId'], where: { tenantId, supplyRequirementId: { in: requirementIds }, kit: { status: { not: 'CANCELED' } } }, _sum: { allocatedQuantity: true } }) : [];
    const allocationMap = new Map<string, number>(allocated.map((row: any) => [String(row.supplyRequirementId), Number(row._sum.allocatedQuantity || 0)] as [string, number]));
    return kits.map((kit: any) => this.serialize(kit, allocationMap));
  }

  async generate(orderId: string) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true); await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { units: { where: { status: 'PLANNED' }, orderBy: { unitNumber: 'asc' } } } });
      if (!order) throw new NotFoundException('Orden de manufactura no encontrada'); if (['CANCELED', 'ON_HOLD'].includes(order.status)) throw new ConflictException('La orden no permite preparar kits');
      const plan = await tx.manufacturingSupplyPlan.findFirst({ where: { tenantId, manufacturingOrderId: orderId, status: { in: ['ACTIVE', 'COMPLETED'] }, engineeringRelease: { status: 'RELEASED' } }, include: { requirements: { where: { included: true }, orderBy: { positionSnapshot: 'asc' } }, engineeringRelease: true } });
      if (!plan) throw new ConflictException('No existe un plan vigente para preparar kits'); if (!order.units.length) throw new ConflictException('La orden no tiene unidades planificadas');
      for (const unit of order.units) {
        const existing = await tx.manufacturingKit.findUnique({ where: { supplyPlanId_manufacturedUnitId: { supplyPlanId: plan.id, manufacturedUnitId: unit.id } } }); if (existing) continue;
        const kit = await tx.manufacturingKit.create({ data: { tenantId, manufacturingOrderId: orderId, supplyPlanId: plan.id, manufacturedUnitId: unit.id, kitCode: `${order.number}-KIT-U${String(unit.unitNumber).padStart(3, '0')}`, name: `Kit unidad ${unit.unitNumber}`, releaseCodeSnapshot: plan.releaseCodeSnapshot, createdByUserId: actor.id, createdByName: actor.name } });
        await tx.manufacturingKitLine.createMany({ data: plan.requirements.map((requirement: any) => ({ tenantId, kitId: kit.id, supplyRequirementId: requirement.id, positionSnapshot: requirement.positionSnapshot, itemCodeSnapshot: requirement.itemCodeSnapshot, descriptionSnapshot: requirement.descriptionSnapshot, uomSnapshot: requirement.uomSnapshot, requiredQuantity: requirement.quantityPerUnitSnapshot })) });
        await this.audit(tx, tenantId, orderId, kit.id, 'MANUFACTURING_KIT_CREATED', `${kit.kitCode}: kit creado`, actor, { unitId: unit.id, lineCount: plan.requirements.length });
      }
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async allocate(lineId: string, dto: AdjustManufacturingKitLineDto) { return this.adjust(lineId, dto, 1); }
  async unallocate(lineId: string, dto: AdjustManufacturingKitLineDto) { return this.adjust(lineId, dto, -1); }
  private async adjust(lineId: string, dto: AdjustManufacturingKitLineDto, sign: 1 | -1) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true); const line = await this.lockedLine(tx, tenantId, lineId); orderId = line.kit.manufacturingOrderId; this.mutableKit(line.kit); this.version(line, dto?.lockVersion, 'La línea del kit cambió');
      const quantity = this.amount(dto?.quantity); const current = Number(line.allocatedQuantity);
      if (sign < 0 && quantity > current + 1e-9) throw new ConflictException(`Solo hay ${current} asignadas en esta línea`);
      if (sign > 0) {
        const lineRemaining = Number(line.requiredQuantity) - current - Number(line.waivedQuantity); if (quantity > lineRemaining + 1e-9) throw new ConflictException(`La línea solo admite ${lineRemaining} adicionales`);
        const totals = await tx.manufacturingKitLine.aggregate({ where: { tenantId, supplyRequirementId: line.supplyRequirementId, kit: { status: { not: 'CANCELED' } } }, _sum: { allocatedQuantity: true } });
        const available = Math.max(0, Number(line.supplyRequirement.fulfilledQuantity) - Number(totals._sum.allocatedQuantity || 0)); if (quantity > available + 1e-9) throw new ConflictException(`Solo hay ${available} aprobadas y sin asignar`);
      }
      await tx.manufacturingKitLine.update({ where: { id: line.id }, data: { allocatedQuantity: current + sign * quantity, updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      await this.refreshKit(tx, line.kitId); await this.audit(tx, tenantId, orderId, line.id, sign > 0 ? 'KIT_MATERIAL_ALLOCATED' : 'KIT_MATERIAL_UNALLOCATED', `${line.itemCodeSnapshot}: ${quantity} ${sign > 0 ? 'asignadas' : 'retiradas'} del kit`, actor, { quantity, kitId: line.kitId });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.list(orderId);
  }

  async waive(lineId: string, dto: WaiveManufacturingKitLineDto) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true); const line = await this.lockedLine(tx, tenantId, lineId); orderId = line.kit.manufacturingOrderId; this.mutableKit(line.kit); this.version(line, dto?.lockVersion, 'La línea del kit cambió');
      const waived = this.amount(dto?.waivedQuantity, true); if (Number(line.allocatedQuantity) + waived > Number(line.requiredQuantity) + 1e-9) throw new ConflictException('La asignación y excepción superan la cantidad requerida');
      const reason = this.text(dto?.reason); if (waived > 0 && (!reason || reason.length < 5)) throw new BadRequestException('La excepción requiere un motivo de al menos 5 caracteres');
      await tx.manufacturingKitLine.update({ where: { id: line.id }, data: { waivedQuantity: waived, waiverReason: waived ? reason : null, waivedByUserId: waived ? actor.id : null, waivedByName: waived ? actor.name : null, waivedAt: waived ? new Date() : null, updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      await this.refreshKit(tx, line.kitId); await this.audit(tx, tenantId, orderId, line.id, waived ? 'KIT_SHORTAGE_WAIVED' : 'KIT_WAIVER_REMOVED', `${line.itemCodeSnapshot}: excepción ${waived ? 'registrada' : 'retirada'}`, actor, { waivedQuantity: waived, reason });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }); return this.list(orderId);
  }

  async release(kitId: string, dto: ReleaseManufacturingKitDto) { return this.closeKit(kitId, dto?.lockVersion, 'RELEASE', dto?.notes); }
  async cancel(kitId: string, dto: CancelManufacturingKitDto) { return this.closeKit(kitId, dto?.lockVersion, 'CANCEL', dto?.reason); }
  private async closeKit(kitId: string, rawVersion: unknown, action: 'RELEASE' | 'CANCEL', rawText: unknown) {
    const { tenantId, userId } = this.context(); let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true); await tx.$queryRaw`SELECT "id" FROM "ManufacturingKit" WHERE "id" = ${kitId} FOR UPDATE`;
      const kit = await tx.manufacturingKit.findFirst({ where: { id: kitId, tenantId }, include: { lines: true, manufacturingOrder: true } }); if (!kit) throw new NotFoundException('Kit no encontrado'); orderId = kit.manufacturingOrderId; this.version(kit, rawVersion, 'El kit cambió');
      if (kit.status === 'CANCELED') throw new ConflictException('El kit está cancelado'); if (action === 'RELEASE' && kit.status === 'RELEASED') throw new ConflictException('El kit ya fue liberado');
      const text = this.text(rawText); if (action === 'CANCEL' && (!text || text.length < 5)) throw new BadRequestException('La cancelación requiere un motivo de al menos 5 caracteres');
      if (action === 'RELEASE') { const shortage = kit.lines.some((line: any) => Number(line.allocatedQuantity) + Number(line.waivedQuantity) + 1e-9 < Number(line.requiredQuantity)); if (shortage) throw new ConflictException('El kit aún tiene faltantes sin asignar o autorizar'); }
      await tx.manufacturingKit.update({ where: { id: kit.id }, data: action === 'RELEASE' ? { status: 'RELEASED', releasedAt: new Date(), releasedByUserId: actor.id, releasedByName: actor.name, releaseNotes: text, lockVersion: { increment: 1 } } : { status: 'CANCELED', canceledAt: new Date(), canceledReason: text, lockVersion: { increment: 1 } } });
      await this.audit(tx, tenantId, orderId, kit.id, action === 'RELEASE' ? 'MANUFACTURING_KIT_RELEASED' : 'MANUFACTURING_KIT_CANCELED', `${kit.kitCode}: kit ${action === 'RELEASE' ? 'liberado a ensamble' : 'cancelado'}`, actor, { notes: text });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }); return this.list(orderId);
  }

  private async lockedLine(tx: any, tenantId: string, lineId: string) { await tx.$queryRaw`SELECT "id" FROM "ManufacturingKitLine" WHERE "id" = ${lineId} FOR UPDATE`; const line = await tx.manufacturingKitLine.findFirst({ where: { id: lineId, tenantId }, include: { kit: { include: { manufacturingOrder: true } }, supplyRequirement: true } }); if (!line) throw new NotFoundException('Línea de kit no encontrada'); if (['CANCELED', 'ON_HOLD'].includes(line.kit.manufacturingOrder.status)) throw new ConflictException('La orden no permite modificar kits'); return line; }
  private mutableKit(kit: any) { if (['RELEASED', 'CANCELED'].includes(kit.status)) throw new ConflictException('El kit ya está cerrado'); }
  private version(entity: any, raw: unknown, message: string) { const version = Number(raw); if (!Number.isInteger(version) || version !== entity.lockVersion) throw new ConflictException(`${message}; actualiza la pantalla`); }
  private async refreshKit(tx: any, kitId: string) { const lines = await tx.manufacturingKitLine.findMany({ where: { kitId }, select: { requiredQuantity: true, allocatedQuantity: true, waivedQuantity: true } }); const complete = lines.length > 0 && lines.every((line: any) => Number(line.allocatedQuantity) + Number(line.waivedQuantity) + 1e-9 >= Number(line.requiredQuantity)); const touched = lines.some((line: any) => Number(line.allocatedQuantity) > 0 || Number(line.waivedQuantity) > 0); await tx.manufacturingKit.update({ where: { id: kitId }, data: { status: complete ? 'READY' : touched ? 'PREPARING' : 'DRAFT', lockVersion: { increment: 1 } } }); }
  private serialize(kit: any, allocationMap: Map<string, number>) { const lines = kit.lines.map((line: any) => { const required = Number(line.requiredQuantity); const allocated = Number(line.allocatedQuantity); const waived = Number(line.waivedQuantity); return { ...line, requiredQuantity: required, allocatedQuantity: allocated, waivedQuantity: waived, shortageQuantity: Math.max(0, required - allocated - waived), availableToAllocate: Math.max(0, Number(line.supplyRequirement.fulfilledQuantity) - Number(allocationMap.get(line.supplyRequirementId) || 0)), supplyRequirement: { ...line.supplyRequirement, fulfilledQuantity: Number(line.supplyRequirement.fulfilledQuantity) } }; }); return { ...kit, lines, summary: { lineCount: lines.length, completeCount: lines.filter((line: any) => line.shortageQuantity <= 1e-9).length, shortageCount: lines.filter((line: any) => line.shortageQuantity > 1e-9).length, allocatedQuantity: lines.reduce((sum: number, line: any) => sum + line.allocatedQuantity, 0), waivedQuantity: lines.reduce((sum: number, line: any) => sum + line.waivedQuantity, 0) } }; }
  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) { await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: action.includes('KIT_') && action.startsWith('MANUFACTURING') ? 'ManufacturingKit' : 'ManufacturingKitLine', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } }); }
}
