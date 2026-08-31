import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { ActOnManufacturingStockReservationDto, CreateManufacturingStockReservationDto } from './dto/manufacturing-supply.dto';
import { ManufacturingSupplyService } from './manufacturing-supply.service';

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingStockReservationsService {
  constructor(private readonly prisma: PrismaService, private readonly supply: ManufacturingSupplyService) {}

  private context() {
    const store = tenantStorage.getStore();
    if (!store?.tenantId || !store?.userId) throw new ForbiddenException('Contexto de usuario incompleto');
    return { tenantId: store.tenantId, userId: store.userId };
  }

  private async actor(tx: any, tenantId: string, userId: string): Promise<Actor> {
    const actor = await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true, role: true } });
    if (!actor) throw new ForbiddenException('Usuario no encontrado');
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Solo un administrador puede gestionar reservas');
    return actor;
  }

  private quantity(value: unknown) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('La cantidad debe ser mayor que cero');
    return quantity;
  }

  private text(value: unknown) { const normalized = String(value ?? '').trim(); return normalized || null; }

  private async requirement(tx: any, tenantId: string, requirementId: string) {
    const requirement = await tx.manufacturingSupplyRequirement.findFirst({
      where: { id: requirementId, tenantId },
      include: { supplyPlan: { include: { manufacturingOrder: true } }, inventoryItem: true },
    });
    if (!requirement) throw new NotFoundException('Necesidad de abastecimiento no encontrada');
    if (requirement.supplyPlan.status !== 'ACTIVE') throw new ConflictException('El plan de abastecimiento ya no está activo');
    if (['CANCELED', 'COMPLETED'].includes(requirement.supplyPlan.manufacturingOrder.status)) throw new ConflictException('La orden está cerrada');
    if (requirement.supplyPlan.manufacturingOrder.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
    if (!requirement.included || requirement.plannedSupplyType !== 'STOCK') throw new ConflictException('La necesidad no está activa con ruta de inventario');
    if (!requirement.inventoryItemId) throw new ConflictException('La necesidad no está vinculada a un artículo de inventario');
    return requirement;
  }

  async reserve(requirementId: string, dto: CreateManufacturingStockReservationDto) {
    const { tenantId, userId } = this.context();
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingSupplyRequirement" WHERE "id" = ${requirementId} FOR UPDATE`;
      const requirement = await this.requirement(tx, tenantId, requirementId);
      orderId = requirement.supplyPlan.manufacturingOrderId;
      const stockId = String(dto?.inventoryStockId || '').trim();
      if (!stockId) throw new BadRequestException('Debes seleccionar una ubicación de inventario');
      await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${stockId} FOR UPDATE`;
      const stock = await tx.inventoryStock.findFirst({ where: { id: stockId, tenantId, inventoryItemId: requirement.inventoryItemId } });
      if (!stock) throw new NotFoundException('Ubicación de inventario no encontrada');
      const quantity = this.quantity(dto?.quantity);
      const available = Math.max(0, Number(stock.stockOnHand || 0) - Number(stock.stockReserved || 0));
      if (quantity > available + 1e-9) throw new ConflictException(`Solo hay ${available} disponibles en la ubicación seleccionada`);
      const aggregates = await tx.manufacturingStockReservation.aggregate({
        where: { tenantId, supplyRequirementId: requirementId },
        _sum: { reservedQuantity: true, releasedQuantity: true },
      });
      const committed = Number(aggregates._sum.reservedQuantity || 0) - Number(aggregates._sum.releasedQuantity || 0);
      const remaining = Math.max(0, Number(requirement.requiredQuantity) - committed);
      if (quantity > remaining + 1e-9) throw new ConflictException(`La necesidad solo admite ${remaining} adicionales`);
      const reservation = await tx.manufacturingStockReservation.create({ data: {
        tenantId, supplyRequirementId: requirementId, inventoryItemId: requirement.inventoryItemId, inventoryStockId: stock.id,
        reservedQuantity: quantity, warehouseSnapshot: stock.warehouse, binLocationSnapshot: stock.binLocation,
        notes: this.text(dto?.notes), createdByUserId: actor.id, createdByName: actor.name,
      } });
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockReserved: Number(stock.stockReserved || 0) + quantity } });
      await this.movement(tx, { tenantId, requirement, reservationId: reservation.id, stock, actor, type: 'RESERVATION', quantity, stockDelta: 0, note: dto?.notes });
      await this.audit(tx, tenantId, orderId, reservation.id, 'STOCK_RESERVED', `${requirement.itemCodeSnapshot}: ${quantity} reservadas`, actor, { requirementId, inventoryStockId: stock.id, quantity });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.supply.list(orderId);
  }

  async issue(reservationId: string, dto: ActOnManufacturingStockReservationDto) { return this.act(reservationId, dto, 'ISSUE'); }
  async release(reservationId: string, dto: ActOnManufacturingStockReservationDto) { return this.act(reservationId, dto, 'RELEASE'); }

  private async act(reservationId: string, dto: ActOnManufacturingStockReservationDto, action: 'ISSUE' | 'RELEASE') {
    const { tenantId, userId } = this.context();
    let orderId = '';
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingStockReservation" WHERE "id" = ${reservationId} FOR UPDATE`;
      const reservation = await tx.manufacturingStockReservation.findFirst({
        where: { id: reservationId, tenantId },
        include: { supplyRequirement: { include: { supplyPlan: { include: { manufacturingOrder: true } } } }, inventoryStock: true },
      });
      if (!reservation) throw new NotFoundException('Reserva no encontrada');
      const observed = Number(dto?.lockVersion);
      if (!Number.isInteger(observed) || observed !== reservation.lockVersion) throw new ConflictException('La reserva cambió; actualiza la pantalla');
      orderId = reservation.supplyRequirement.supplyPlan.manufacturingOrderId;
      const order = reservation.supplyRequirement.supplyPlan.manufacturingOrder;
      if (['CANCELED', 'COMPLETED'].includes(order.status)) throw new ConflictException('La orden está cerrada');
      if (order.status === 'ON_HOLD') throw new ConflictException('La orden está en pausa');
      await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${reservation.inventoryStockId} FOR UPDATE`;
      const stock = await tx.inventoryStock.findUnique({ where: { id: reservation.inventoryStockId } });
      if (!stock) throw new NotFoundException('Ubicación de inventario no encontrada');
      const quantity = this.quantity(dto?.quantity);
      const outstanding = Number(reservation.reservedQuantity) - Number(reservation.issuedQuantity) - Number(reservation.releasedQuantity);
      if (quantity > outstanding + 1e-9) throw new ConflictException(`La reserva solo tiene ${outstanding} pendientes`);
      if (Number(stock.stockReserved || 0) + 1e-9 < quantity) throw new ConflictException('La cantidad reservada en inventario ya no es suficiente');
      if (action === 'ISSUE' && Number(stock.stockOnHand || 0) + 1e-9 < quantity) throw new ConflictException('La existencia física ya no es suficiente');

      const issued = Number(reservation.issuedQuantity) + (action === 'ISSUE' ? quantity : 0);
      const released = Number(reservation.releasedQuantity) + (action === 'RELEASE' ? quantity : 0);
      const remaining = Number(reservation.reservedQuantity) - issued - released;
      const status = remaining > 1e-9 ? 'PARTIAL' : action === 'ISSUE' || issued > 0 ? 'ISSUED' : 'RELEASED';
      const newOnHand = Number(stock.stockOnHand || 0) - (action === 'ISSUE' ? quantity : 0);
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: newOnHand, stockReserved: Math.max(0, Number(stock.stockReserved || 0) - quantity) } });
      await tx.manufacturingStockReservation.update({ where: { id: reservation.id }, data: { issuedQuantity: issued, releasedQuantity: released, status, notes: this.text(dto?.notes) ?? reservation.notes, updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
      if (action === 'ISSUE') {
        const stocks = await tx.inventoryStock.findMany({ where: { tenantId, inventoryItemId: reservation.inventoryItemId }, select: { stockOnHand: true } });
        await tx.inventoryItem.update({ where: { id: reservation.inventoryItemId }, data: { qty: Math.round(stocks.reduce((sum: number, row: any) => sum + Number(row.stockOnHand || 0), 0)) } });
        const nextFulfilled = Math.min(Number(reservation.supplyRequirement.requiredQuantity), Number(reservation.supplyRequirement.fulfilledQuantity) + quantity);
        await tx.manufacturingSupplyRequirement.update({ where: { id: reservation.supplyRequirementId }, data: { fulfilledQuantity: nextFulfilled, status: nextFulfilled >= Number(reservation.supplyRequirement.requiredQuantity) ? 'FULFILLED' : 'PARTIAL', updatedByUserId: actor.id, lockVersion: { increment: 1 } } });
        await this.completePlanIfReady(tx, tenantId, reservation.supplyRequirement.supplyPlanId);
      }
      await this.movement(tx, { tenantId, requirement: reservation.supplyRequirement, reservationId, stock: { ...stock, stockOnHand: newOnHand }, actor, type: action === 'ISSUE' ? 'EXIT' : 'RELEASE', quantity, stockDelta: action === 'ISSUE' ? -quantity : 0, note: dto?.notes });
      await this.audit(tx, tenantId, orderId, reservation.id, action === 'ISSUE' ? 'STOCK_ISSUED' : 'STOCK_RESERVATION_RELEASED', `${reservation.supplyRequirement.itemCodeSnapshot}: ${quantity} ${action === 'ISSUE' ? 'entregadas' : 'liberadas'}`, actor, { requirementId: reservation.supplyRequirementId, quantity, status });
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { version: { increment: 1 } } });
    }, { isolationLevel: 'Serializable' });
    return this.supply.list(orderId);
  }

  private async completePlanIfReady(tx: any, tenantId: string, planId: string) {
    const pending = await tx.manufacturingSupplyRequirement.count({ where: { tenantId, supplyPlanId: planId, included: true, status: { not: 'FULFILLED' } } });
    if (!pending) await tx.manufacturingSupplyPlan.update({ where: { id: planId }, data: { status: 'COMPLETED', completedAt: new Date(), lockVersion: { increment: 1 } } });
  }

  private async movement(tx: any, input: any) {
    const balance = await tx.inventoryStock.aggregate({ where: { tenantId: input.tenantId, inventoryItemId: input.requirement.inventoryItemId }, _sum: { stockOnHand: true } });
    await tx.inventoryMovement.create({ data: {
      tenantId: input.tenantId, inventoryItemId: input.requirement.inventoryItemId, inventoryStockId: input.stock.id,
      movementType: input.type, source: 'SYSTEM', qty: input.quantity, stockDelta: input.stockDelta,
      balanceAfter: Number(balance._sum.stockOnHand || 0), warehouse: input.stock.warehouse, binLocation: input.stock.binLocation,
      referenceType: 'MANUFACTURING_STOCK_RESERVATION', referenceId: input.reservationId,
      referenceLabel: `${input.requirement.supplyPlan.manufacturingOrder.number} · ${input.requirement.itemCodeSnapshot}`,
      note: this.text(input.note), createdByUserId: input.actor.id,
    } });
  }

  private async audit(tx: any, tenantId: string, orderId: string, entityId: string, action: string, summary: string, actor: Actor, afterData: unknown) {
    await tx.manufacturingAuditEvent.create({ data: { tenantId, manufacturingOrderId: orderId, entityType: 'ManufacturingStockReservation', entityId, action, summary, actorUserId: actor.id, actorName: actor.name, afterData: JSON.parse(JSON.stringify(afterData)) } });
  }
}
