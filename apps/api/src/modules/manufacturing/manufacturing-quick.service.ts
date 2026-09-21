import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { assertIndependentApproval } from './manufacturing-approval';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { assertQuickReceipt, evaluateQuickInspection, quickNumber, quickText, QuickRecipe, validateQuickRecipe } from './manufacturing-quick.domain';

type Actor = { id: string; name: string; role: string };

@Injectable()
export class ManufacturingQuickService {
  constructor(private readonly prisma: PrismaService) {}
  private context() {
    const ctx = tenantStorage.getStore();
    if (!ctx?.tenantId || !ctx.userId) throw new ForbiddenException('Contexto incompleto');
    return { tenantId: ctx.tenantId, userId: ctx.userId };
  }
  private async actor(tx: any, tenantId: string, userId: string, admin = false): Promise<Actor> {
    const actor = await tx.user.findFirst({ where: { id: userId, tenantId } });
    if (!actor || !['ADMIN', 'TECH'].includes(actor.role) || (admin && actor.role !== 'ADMIN')) throw new ForbiddenException('No tienes permiso para esta acción');
    return actor;
  }
  private admin(actor: Actor) { if (actor.role !== 'ADMIN') throw new ForbiddenException('Se requiere un administrador'); }
  private async item(tx: any, tenantId: string, id: string) {
    const item = await tx.inventoryItem.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Artículo no encontrado');
    return item;
  }
  private eligible(item: any) {
    if (['HIGH', 'CRITICAL'].includes(item.criticality) || item.status !== 'ACTIVE') throw new ConflictException('El artículo debe estar activo y tener criticidad baja o media');
  }
  async profiles(itemId: string) {
    const { tenantId, userId } = this.context();
    await this.actor(this.prisma, tenantId, userId);
    await this.item(this.prisma, tenantId, itemId);
    return (this.prisma as any).manufacturingQuickProfile.findMany({ where: { tenantId, inventoryItemId: itemId }, orderBy: { revision: 'desc' } });
  }
  async createProfile(itemId: string, body: any) {
    const { tenantId, userId } = this.context();
    const recipe = validateQuickRecipe(body?.recipe);
    const validUntil = body.validUntil ? new Date(body.validUntil) : null;
    if (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil <= new Date())) throw new BadRequestException('La vigencia debe ser una fecha futura');
    return this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true);
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${itemId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      this.eligible(await this.item(tx, tenantId, itemId));
      for (const material of recipe.materials) {
        if (material.inventoryItemId === itemId) throw new BadRequestException('El repuesto no puede consumirse a sí mismo');
        const item = await this.item(tx, tenantId, material.inventoryItemId);
        if (item.status !== 'ACTIVE') throw new ConflictException('Todos los materiales deben estar activos');
        Object.assign(material, { sku: item.sku, name: item.name, uom: item.uom || 'UND' });
      }
      const latest = await tx.manufacturingQuickProfile.findFirst({ where: { tenantId, inventoryItemId: itemId }, orderBy: { revision: 'desc' } });
      return tx.manufacturingQuickProfile.create({ data: { tenantId, inventoryItemId: itemId, revision: (latest?.revision || 0) + 1, recipe, validUntil, createdByUserId: actor.id } });
    }, { isolationLevel: 'Serializable' });
  }
  async profileAction(profileId: string, action: string, body: { approvalExceptionReason?: string } = {}) {
    const { tenantId, userId } = this.context();
    return this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingQuickProfile" WHERE "id" = ${profileId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const profile = await tx.manufacturingQuickProfile.findFirst({ where: { id: profileId, tenantId } });
      if (!profile) throw new NotFoundException('Perfil no encontrado');
      if (action === 'approve') {
        if (profile.status !== 'DRAFT') throw new ConflictException('La revisión ya fue procesada');
        assertIndependentApproval(actor.id, [profile.createdByUserId], body.approvalExceptionReason);
        this.eligible(await this.item(tx, tenantId, profile.inventoryItemId));
        validateQuickRecipe(profile.recipe);
        if (profile.validUntil && profile.validUntil <= new Date()) throw new ConflictException('El perfil está vencido');
        return tx.manufacturingQuickProfile.update({ where: { id: profileId }, data: { status: 'APPROVED', approvedAt: new Date(), approvedByUserId: actor.id, approvalExceptionReason: body.approvalExceptionReason?.trim() || null } });
      }
      if (action !== 'retire') throw new BadRequestException('Acción inválida');
      return tx.manufacturingQuickProfile.update({ where: { id: profileId }, data: { status: 'RETIRED' } });
    }, { isolationLevel: 'Serializable' });
  }

  async initialize(tx: any, order: any, profileId: string, actor: Actor, warehouse?: string) {
    this.admin(actor);
    await tx.$queryRaw`SELECT "id" FROM "ManufacturingQuickProfile" WHERE "id" = ${profileId} AND "tenantId" = ${order.tenantId} FOR UPDATE`;
    const profile = await tx.manufacturingQuickProfile.findFirst({ where: { id: profileId, tenantId: order.tenantId, inventoryItemId: order.outputInventoryItemId, status: 'APPROVED' } });
    if (!profile || (profile.validUntil && profile.validUntil <= new Date())) throw new ConflictException('Selecciona un perfil aprobado y vigente para este repuesto');
    this.eligible(await this.item(tx, order.tenantId, order.outputInventoryItemId));
    const recipe = validateQuickRecipe(profile.recipe);
    // Use the approved snapshot, including catalog labels, rather than live engineering data.
    const state: any = {
      schemaVersion: 1, status: 'PENDING_MATERIALS', warehouse: warehouse?.trim() || null, acceptedQuantity: 0, receivedQuantity: 0,
      materials: recipe.materials.map(m => ({ ...m, required: m.quantity * order.quantity, consumed: 0, allocations: [], cost: 0, costComplete: true })),
      operations: recipe.operations.map(o => ({ ...o, status: 'PENDING', minutes: 0, startedAt: null, evidence: '', notes: '' })),
      inspections: [], receipts: [], rework: [],
    };
    await this.reserve(tx, order, state, actor);
    return tx.manufacturingQuickExecution.create({ data: { tenantId: order.tenantId, manufacturingOrderId: order.id, profileId, recipeSnapshot: profile.recipe, state } });
  }

  private async order(tx: any, tenantId: string, id: string, actor: Actor) {
    const order = await tx.manufacturingOrder.findFirst({ where: { tenantId, id }, include: { quickExecution: true, members: true, fulfillingAfterSalesDemands: true } });
    if (!order || (actor.role !== 'ADMIN' && order.responsibleUserId !== actor.id && !order.members.some((m: any) => m.userId === actor.id))) throw new NotFoundException('OF no encontrada');
    if (order.executionMode !== 'EXPEDITED' || !order.quickExecution) throw new ConflictException('La OF no utiliza el flujo abreviado');
    return order;
  }
  async enable(orderId: string, body: any) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId, true);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, tenantId }, include: { fulfillingAfterSalesDemands: true, _count: { select: { engineeringDocuments: true, boms: true, engineeringReleases: true, supplyPlans: true, kits: true, assemblyExecutions: true, outputReceipts: true } } } });
      if (!order) throw new NotFoundException('OF no encontrada');
      if (body?.version !== order.version) throw new ConflictException('La OF cambió; actualiza la pantalla');
      if (order.orderType !== 'SPARE_PART' || order.executionMode !== 'STANDARD' || order.status !== 'DRAFT' || Object.values(order._count).some(n => Number(n) > 0)) throw new ConflictException('Solo se puede abreviar una OF de repuesto en borrador, sin ingeniería ni ejecución registrada');
      const demand = order.fulfillingAfterSalesDemands[0];
      if (order.fulfillingAfterSalesDemands.length !== 1 || ['CANCELED', 'ON_HOLD', 'FULFILLED'].includes(demand.status) || order.quantity !== Number(demand.requestedQuantity) - Number(demand.fulfilledQuantity)) throw new ConflictException('La OF debe coincidir con la cantidad pendiente de una demanda activa');
      await this.initialize(tx, order, String(body.profileId || ''), actor, body.materialWarehouse);
      await tx.manufacturingOrder.update({ where: { id: orderId }, data: { executionMode: 'EXPEDITED', version: { increment: 1 } } });
      await this.audit(tx, order, actor, 'QUICK_ENABLED', { profileId: body.profileId });
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    return this.get(orderId);
  }
  async get(orderId: string) {
    const { tenantId, userId } = this.context();
    const actor = await this.actor(this.prisma, tenantId, userId);
    const order = await this.order(this.prisma, tenantId, orderId, actor);
    const execution = order.quickExecution;
    const state = execution.state as any;
    const materials = await Promise.all(state.materials.map(async (m: any) => {
      const stocks = await this.prisma.inventoryStock.findMany({ where: { tenantId, inventoryItemId: m.inventoryItemId, ...(state.warehouse ? { warehouse: state.warehouse } : {}) } });
      return { ...m, available: stocks.reduce((n, s) => n + Math.max(0, s.stockOnHand - Number(s.stockReserved || 0)), 0) };
    }));
    const materialCost = state.materials.reduce((n: number, m: any) => n + m.cost, 0);
    const minutes = state.operations.reduce((n: number, o: any) => n + o.minutes, 0);
    const laborCost = minutes / 60 * execution.recipeSnapshot.hourlyRate;
    return { ...execution, state: { ...state, materials }, costs: { materialCost, laborCost, total: materialCost + laborCost, minutes, currency: execution.recipeSnapshot.currency, complete: state.materials.every((m: any) => m.costComplete), unitCost: state.acceptedQuantity ? (materialCost + laborCost) / state.acceptedQuantity : null }, orderStatus: order.status, quantity: order.quantity };
  }
  async command(orderId: string, action: string, body: any) {
    const { tenantId, userId } = this.context();
    await this.prisma.$transaction(async (tx: any) => {
      const actor = await this.actor(tx, tenantId, userId);
      await tx.$queryRaw`SELECT "id" FROM "ManufacturingOrder" WHERE "id" = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const order = await this.order(tx, tenantId, orderId, actor);
      if (['CANCELED', 'COMPLETED', 'ON_HOLD'].includes(order.status)) throw new ConflictException('La OF está cerrada o en pausa');
      const execution = order.quickExecution;
      if (body?.lockVersion !== execution.lockVersion) throw new ConflictException('La ejecución cambió; actualiza la pantalla');
      const state = execution.state;
      const recipe: QuickRecipe = execution.recipeSnapshot;
      const now = new Date().toISOString();
      if (action === 'reserve') {
        this.admin(actor);
        if (!['PENDING_MATERIALS', 'READY_FOR_PRODUCTION'].includes(state.status)) throw new ConflictException('La preparación ya terminó');
        await this.reserve(tx, order, state, actor);
      } else if (action === 'release') {
        this.admin(actor);
        if (state.status !== 'READY_FOR_PRODUCTION') throw new ConflictException('Reserva todos los materiales antes de liberar');
        state.status = 'IN_PRODUCTION';
        await tx.manufacturingOrder.update({ where: { id: order.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
      } else if (action === 'consume') {
        if (state.status !== 'IN_PRODUCTION') throw new ConflictException('Libera la OF antes de consumir materiales');
        await this.consume(tx, order, state, recipe, actor);
      } else if (action === 'extra-material') {
        this.admin(actor);
        if (state.status !== 'IN_PRODUCTION' || state.operations.some((o: any) => o.status === 'IN_PROGRESS')) throw new ConflictException('Pausa las operaciones antes de registrar material adicional');
        const material = state.materials.find((m: any) => m.inventoryItemId === body.inventoryItemId);
        if (!material) throw new BadRequestException('El material debe pertenecer a la receta');
        const quantity = quickNumber(body.quantity, 'Cantidad adicional', 0.000001);
        const reason = quickText(body.reason, 'Motivo del consumo adicional o desperdicio');
        material.required += quantity;
        await this.reserve(tx, order, state, actor);
        if (state.status !== 'READY_FOR_PRODUCTION') throw new ConflictException('No hay existencias suficientes para el consumo adicional');
        await this.consume(tx, order, state, recipe, actor);
        state.status = 'IN_PRODUCTION';
        state.materialAdjustments = [...(state.materialAdjustments || []), { inventoryItemId: material.inventoryItemId, quantity, reason, at: now, by: actor.name }];
      } else if (['start', 'pause', 'complete'].includes(action)) {
        if (state.status !== 'IN_PRODUCTION') throw new ConflictException('La OF no está en producción');
        const index = quickNumber(body.operation, 'Operación', 0, true);
        const operation = state.operations[index];
        if (!operation) throw new BadRequestException('Operación inválida');
        if (action === 'start') {
          if (!['PENDING', 'PAUSED'].includes(operation.status) || state.operations.some((o: any) => o.status === 'IN_PROGRESS')) throw new ConflictException('Pausa la operación activa antes de iniciar otra');
          if (state.operations.slice(0, index).some((o: any) => o.status !== 'COMPLETED')) throw new ConflictException('Termina la operación anterior');
          if (state.materials.some((m: any) => m.consumed + 1e-6 < m.required)) throw new ConflictException('Confirma el consumo de materiales antes de iniciar');
          operation.startedAt = now; operation.status = 'IN_PROGRESS'; operation.startedBy = actor.id;
        } else {
          if (operation.status !== 'IN_PROGRESS') throw new ConflictException('La operación no está iniciada');
          if (action === 'complete') {
            operation.evidence = quickText(body.evidence || '', 'Evidencia', false);
            operation.notes = quickText(body.notes || '', 'Observaciones', false);
            if (operation.evidenceRequired && !operation.evidence) throw new BadRequestException('Esta operación requiere evidencia');
          }
          operation.minutes += Math.max(0, (Date.now() - new Date(operation.startedAt).getTime()) / 60000);
          operation.startedAt = null; operation.status = action === 'complete' ? 'COMPLETED' : 'PAUSED'; operation.updatedBy = actor.id;
          if (state.operations.every((o: any) => o.status === 'COMPLETED')) state.status = 'QUALITY_PENDING';
        }
      } else if (action === 'inspect') {
        this.admin(actor);
        assertIndependentApproval(actor.id, state.operations.flatMap((operation: any) => [operation.startedBy, operation.updatedBy]), body.approvalExceptionReason);
        if (!['QUALITY_PENDING', 'PARTIALLY_ACCEPTED'].includes(state.status)) throw new ConflictException('Completa fabricación antes de inspeccionar');
        const quantity = quickNumber(body.quantity, 'Cantidad inspeccionada', 1, true);
        if (quantity > order.quantity - state.acceptedQuantity) throw new ConflictException('La cantidad supera las piezas pendientes de aprobación');
        if (recipe.inspectionMode === 'UNIT' && quantity !== 1) throw new BadRequestException('Este perfil exige inspección individual');
        const serial = quickText(body.serial || '', 'Serie/lote', false);
        if (recipe.requiresSerial && (!serial || quantity !== 1)) throw new BadRequestException('Registra el serial e inspecciona una pieza a la vez');
        if (serial && state.inspections.some((i: any) => i.passed && i.serial === serial)) throw new ConflictException('Este serial/lote ya fue aprobado');
        const inspection = evaluateQuickInspection(recipe, body.results);
        const notes = quickText(body.notes || '', 'Observaciones', false);
        if (!inspection.passed && !notes) throw new BadRequestException('Describe la no conformidad y el retrabajo necesario');
        let unitIds: string[] = [];
        if (inspection.passed) {
          const units = await tx.manufacturedUnit.findMany({ where: { tenantId, manufacturingOrderId: order.id, status: { not: 'CANCELED' } }, orderBy: { unitNumber: 'asc' }, skip: state.acceptedQuantity, take: quantity });
          if (units.length !== quantity) throw new ConflictException('La cantidad de unidades activas no coincide con el lote');
          unitIds = units.map((u: any) => u.id);
          if (recipe.requiresSerial) {
            if (await tx.manufacturedUnit.count({ where: { tenantId, serialNumber: serial, id: { not: units[0].id } } })) throw new ConflictException('Este serial ya está asignado a otra unidad');
            await tx.manufacturedUnit.update({ where: { id: units[0].id }, data: { serialNumber: serial } });
          }
        }
        state.inspections.push({ id: randomUUID(), quantity, ...inspection, serial, unitIds, notes, at: now, by: actor.id, byName: actor.name });
        if (inspection.passed) state.acceptedQuantity += quantity;
        state.status = inspection.passed ? (state.acceptedQuantity === order.quantity ? 'READY' : 'PARTIALLY_ACCEPTED') : 'REWORK_REQUIRED';
      } else if (action === 'rework') {
        this.admin(actor);
        if (state.status !== 'REWORK_REQUIRED') throw new ConflictException('No hay retrabajo pendiente');
        const notes = quickText(body.notes, 'Acción correctiva');
        state.rework.push({ at: now, by: actor.id, notes, quantity: order.quantity - state.acceptedQuantity, operations: structuredClone(state.operations) });
        for (const o of state.operations) { o.status = 'PENDING'; o.startedAt = null; o.evidence = ''; }
        state.status = 'IN_PRODUCTION';
      } else if (action === 'receive') {
        this.admin(actor);
        await this.receive(tx, order, state, recipe, actor, body);
      } else throw new BadRequestException('Acción abreviada no válida');
      await tx.manufacturingQuickExecution.update({ where: { id: execution.id }, data: { state, lockVersion: { increment: 1 } } });
      await tx.manufacturingOrder.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
      const demandStatus = state.receivedQuantity > 0 ? (state.receivedQuantity >= order.quantity ? 'READY' : 'PARTIALLY_FULFILLED') : ['QUALITY_PENDING', 'PARTIALLY_ACCEPTED', 'REWORK_REQUIRED', 'READY'].includes(state.status) ? 'QUALITY_PENDING' : 'IN_PRODUCTION';
      await tx.afterSalesPartDemand.updateMany({ where: { tenantId, manufacturingOrderId: order.id, status: { notIn: ['CANCELED', 'FULFILLED', 'ON_HOLD'] } }, data: { status: demandStatus, lockVersion: { increment: 1 }, updatedByUserId: actor.id } });
      await this.audit(tx, order, actor, `QUICK_${action.toUpperCase()}`, { action, at: now, request: body, status: state.status });
    }, { isolationLevel: 'Serializable', timeout: 30000 });
    return this.get(orderId);
  }

  private async movement(tx: any, order: any, actor: Actor, stock: any, type: string, quantity: number, delta: number, reference: string, unitCost?: number) {
    const total = await tx.inventoryStock.aggregate({ where: { tenantId: order.tenantId, inventoryItemId: stock.inventoryItemId }, _sum: { stockOnHand: true } });
    const balanceAfter = Number(total._sum.stockOnHand || 0);
    if (delta) await tx.inventoryItem.update({ where: { id: stock.inventoryItemId }, data: { qty: Math.round(balanceAfter) } });
    await tx.inventoryMovement.create({ data: { tenantId: order.tenantId, inventoryItemId: stock.inventoryItemId, inventoryStockId: stock.id, movementType: type, source: 'MANUFACTURING', qty: quantity, stockDelta: delta, balanceAfter, warehouse: stock.warehouse, binLocation: stock.binLocation, referenceType: 'MANUFACTURING_QUICK', referenceId: reference, referenceLabel: order.number, createdByUserId: actor.id, unitCost } });
  }
  private async reserve(tx: any, order: any, state: any, actor: Actor) {
    for (const material of [...state.materials].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${material.inventoryItemId} AND "tenantId" = ${order.tenantId} FOR UPDATE`;
      const item = await this.item(tx, order.tenantId, material.inventoryItemId);
      if (item.status !== 'ACTIVE') throw new ConflictException('Un material ya no está activo');
      Object.assign(material, { sku: item.sku, name: item.name, uom: item.uom || 'UND' });
      let remaining = material.required - material.consumed - material.allocations.reduce((n: number, a: any) => n + a.quantity, 0);
      if (!state.warehouse && item.qty > 0 && !await tx.inventoryStock.count({ where: { tenantId: order.tenantId, inventoryItemId: item.id } })) {
        await tx.inventoryStock.create({ data: { tenantId: order.tenantId, inventoryItemId: item.id, warehouse: 'Sin ubicar', stockOnHand: item.qty, stockReserved: 0 } });
      }
      const stocks = await tx.inventoryStock.findMany({ where: { tenantId: order.tenantId, inventoryItemId: item.id, ...(state.warehouse ? { warehouse: state.warehouse } : {}) }, orderBy: { id: 'asc' } });
      for (const candidate of stocks) {
        if (remaining <= 1e-6) break;
        await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${candidate.id} FOR UPDATE`;
        const stock = await tx.inventoryStock.findUnique({ where: { id: candidate.id } });
        const quantity = Math.min(remaining, Math.max(0, stock.stockOnHand - Number(stock.stockReserved || 0)));
        if (quantity <= 1e-6) continue;
        await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockReserved: Number(stock.stockReserved || 0) + quantity } });
        material.allocations.push({ stockId: stock.id, quantity }); remaining -= quantity;
        await this.movement(tx, order, actor, stock, 'RESERVATION', quantity, 0, order.id);
      }
    }
    state.status = state.materials.every((m: any) => m.consumed + m.allocations.reduce((n: number, a: any) => n + a.quantity, 0) + 1e-6 >= m.required) ? 'READY_FOR_PRODUCTION' : 'PENDING_MATERIALS';
  }
  private async consume(tx: any, order: any, state: any, recipe: QuickRecipe, actor: Actor) {
    if (state.materials.every((m: any) => m.consumed >= m.required)) throw new ConflictException('Los materiales ya fueron consumidos');
    for (const material of state.materials) {
      const item = await this.item(tx, order.tenantId, material.inventoryItemId);
      const cost = item.avgCost ?? item.lastCost;
      const costKnown = cost != null && Number.isFinite(cost) && cost >= 0 && item.currency === recipe.currency;
      if (material.allocations.length) material.costComplete = material.costComplete && costKnown;
      for (const allocation of material.allocations) {
        await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${allocation.stockId} FOR UPDATE`;
        const stock = await tx.inventoryStock.findFirst({ where: { id: allocation.stockId, tenantId: order.tenantId, inventoryItemId: item.id } });
        if (!stock || stock.stockOnHand + 1e-6 < allocation.quantity || Number(stock.stockReserved || 0) + 1e-6 < allocation.quantity) throw new ConflictException('Las existencias reservadas cambiaron; verifica inventario');
        await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: { decrement: allocation.quantity }, stockReserved: Number(stock.stockReserved || 0) - allocation.quantity } });
        await this.movement(tx, order, actor, stock, 'CONSUMPTION', allocation.quantity, -allocation.quantity, order.id, costKnown ? cost : undefined);
        material.consumed += allocation.quantity; material.cost += costKnown ? allocation.quantity * cost : 0;
      }
      material.allocations = [];
    }
  }
  private async receive(tx: any, order: any, state: any, recipe: QuickRecipe, actor: Actor, body: any) {
    assertQuickReceipt(body.quantity, state.acceptedQuantity, state.receivedQuantity);
    const quantity = body.quantity;
    if (!['STOCK', 'DIRECT'].includes(body.destination)) throw new BadRequestException('Selecciona inventario o entrega directa');
    const direct = body.destination === 'DIRECT';
    const recipient = direct ? quickText(body.recipient, 'Persona que recibe') : '';
    const warehouse = direct ? 'Tránsito posventa' : quickText(body.warehouse, 'Bodega');
    const binLocation = direct ? order.id : (quickText(body.binLocation || '', 'Ubicación', false) || null);
    const demands = await tx.afterSalesPartDemand.findMany({ where: { tenantId: order.tenantId, manufacturingOrderId: order.id }, orderBy: { id: 'asc' } });
    if (demands.length !== 1) throw new ConflictException('La OF abreviada debe conservar una demanda de origen');
    await tx.$queryRaw`SELECT "id" FROM "AfterSalesPartDemand" WHERE "id" = ${demands[0].id} FOR UPDATE`;
    const demand = await tx.afterSalesPartDemand.findUnique({ where: { id: demands[0].id } });
    if (['CANCELED', 'ON_HOLD'].includes(demand.status) || Number(demand.fulfilledQuantity) + quantity > Number(demand.requestedQuantity)) throw new ConflictException('La demanda no admite esta recepción');
    // Lock the output item to serialize creation of a new stock location.
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${order.outputInventoryItemId} FOR UPDATE`;
    let stock = await tx.inventoryStock.findFirst({ where: { tenantId: order.tenantId, inventoryItemId: order.outputInventoryItemId, warehouse, binLocation } });
    if (!stock) stock = await tx.inventoryStock.create({ data: { tenantId: order.tenantId, inventoryItemId: order.outputInventoryItemId, warehouse, binLocation, stockOnHand: 0, stockReserved: 0 } });
    await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${stock.id} FOR UPDATE`;
    await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: { increment: quantity } } });
    const receipt = await tx.manufacturingOutputReceipt.create({ data: { tenantId: order.tenantId, manufacturingOrderId: order.id, inventoryItemId: order.outputInventoryItemId, inventoryStockId: stock.id, quantity, warehouseSnapshot: warehouse, binLocationSnapshot: binLocation, reference: direct ? `OS:${demand.serviceOrderId}` : null, notes: direct ? `Entrega directa a ${recipient}` : 'Recepción abreviada', createdByUserId: actor.id, createdByName: actor.name } });
    await this.movement(tx, order, actor, stock, 'ENTRY', quantity, quantity, receipt.id);
    if (direct) {
      await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockOnHand: { decrement: quantity } } });
      await this.movement(tx, order, actor, stock, 'EXIT', quantity, -quantity, receipt.id);
    }
    await tx.afterSalesPartDemand.update({ where: { id: demand.id }, data: { fulfilledQuantity: { increment: quantity }, ...(direct ? { directDeliveredQuantity: { increment: quantity } } : {}), updatedByUserId: actor.id } });
    state.receivedQuantity += quantity;
    state.receipts.push({ id: receipt.id, quantity, destination: body.destination, recipient, warehouse, binLocation, at: new Date().toISOString(), by: actor.name });
    if (state.receivedQuantity === order.quantity) {
      state.status = 'COMPLETED';
      await tx.manufacturingOrder.update({ where: { id: order.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    }
  }
  async cancelInTransaction(tx: any, order: any, actor: Actor) {
    const execution = await tx.manufacturingQuickExecution.findFirst({ where: { tenantId: order.tenantId, manufacturingOrderId: order.id } });
    if (!execution) throw new ConflictException('Ejecución abreviada no encontrada');
    const state = execution.state;
    if (state.materials.some((m: any) => m.consumed > 0) || state.receivedQuantity > 0) throw new ConflictException('La OF tiene consumos o recepciones; debe completarse o tratarse como retrabajo');
    for (const material of state.materials) {
      for (const a of material.allocations) {
        await tx.$queryRaw`SELECT "id" FROM "InventoryStock" WHERE "id" = ${a.stockId} FOR UPDATE`;
        const stock = await tx.inventoryStock.findFirst({ where: { id: a.stockId, tenantId: order.tenantId } });
        if (!stock || Number(stock.stockReserved || 0) + 1e-6 < a.quantity) throw new ConflictException('La reserva cambió; revisa inventario');
        await tx.inventoryStock.update({ where: { id: stock.id }, data: { stockReserved: Number(stock.stockReserved || 0) - a.quantity } });
        await this.movement(tx, order, actor, stock, 'RELEASE', a.quantity, 0, order.id);
      }
      material.allocations = [];
    }
    state.status = 'CANCELED';
    await tx.manufacturingQuickExecution.update({ where: { id: execution.id }, data: { state, lockVersion: { increment: 1 } } });
    await tx.afterSalesPartDemand.updateMany({ where: { tenantId: order.tenantId, manufacturingOrderId: order.id }, data: { status: 'VALIDATED', manufacturingOrderId: null, lockVersion: { increment: 1 } } });
  }
  async pauseInTransaction(tx: any, order: any) {
    const execution = await tx.manufacturingQuickExecution.findFirst({ where: { tenantId: order.tenantId, manufacturingOrderId: order.id } });
    if (!execution) throw new ConflictException('Ejecución abreviada no encontrada');
    const state = execution.state;
    for (const operation of state.operations) {
      if (operation.status !== 'IN_PROGRESS') continue;
      operation.minutes += Math.max(0, (Date.now() - new Date(operation.startedAt).getTime()) / 60000);
      operation.startedAt = null; operation.status = 'PAUSED';
    }
    await tx.manufacturingQuickExecution.update({ where: { id: execution.id }, data: { state, lockVersion: { increment: 1 } } });
  }
  async metrics() {
    const { tenantId, userId } = this.context();
    await this.actor(this.prisma, tenantId, userId, true);
    const rows = await (this.prisma as any).manufacturingQuickExecution.findMany({ where: { tenantId }, include: { manufacturingOrder: { select: { status: true, createdAt: true, completedAt: true, fulfillingAfterSalesDemands: { select: { coverageStatus: true } } } } } });
    const currencies: Record<string, { currency: string; total: number; warranty: number; incompleteOrders: number }> = {};
    let completed = 0; let cycleHours = 0;
    for (const row of rows) {
      const recipe = row.recipeSnapshot; const state = row.state;
      const bucket = currencies[recipe.currency] ||= { currency: recipe.currency, total: 0, warranty: 0, incompleteOrders: 0 };
      const cost = state.materials.reduce((n: number, m: any) => n + m.cost, 0) + state.operations.reduce((n: number, o: any) => n + o.minutes, 0) / 60 * recipe.hourlyRate;
      bucket.total += cost;
      if (row.manufacturingOrder.fulfillingAfterSalesDemands.some((d: any) => d.coverageStatus === 'WARRANTY_APPROVED')) bucket.warranty += cost;
      if (state.materials.some((m: any) => !m.costComplete)) bucket.incompleteOrders++;
      if (row.manufacturingOrder.status === 'COMPLETED') { completed++; cycleHours += (new Date(row.manufacturingOrder.completedAt).getTime() - new Date(row.manufacturingOrder.createdAt).getTime()) / 3600000; }
    }
    return { orders: rows.length, completed, averageCycleHours: completed ? cycleHours / completed : null, currencies: Object.values(currencies) };
  }
  private async audit(tx: any, order: any, actor: Actor, action: string, data: any) {
    await tx.manufacturingAuditEvent.create({ data: { tenantId: order.tenantId, manufacturingOrderId: order.id, entityType: 'ManufacturingQuickExecution', entityId: order.quickExecution?.id || order.id, action, summary: `${order.number}: ${action}`, actorUserId: actor.id, actorName: actor.name, afterData: data } });
  }
}
