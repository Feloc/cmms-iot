import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingQuickService } from '../src/modules/manufacturing/manufacturing-quick.service';
import { ManufacturingService } from '../src/modules/manufacturing/manufacturing.service';
import { AfterSalesPartDemandsService } from '../src/modules/service-orders/after-sales-part-demands.service';
import { ServiceOrdersService } from '../src/modules/service-orders/service-orders.service';
import { InventoryLedgerService } from '../src/modules/inventory/inventory-ledger.service';

// Everything, including test tenants, is rolled back. No existing user data is used.
async function main() {
  const prisma = new PrismaService(); const rollback = new Error('ROLLBACK_QUICK_TEST');
  try {
    await prisma.$transaction(async (tx: any) => {
      let sequence = 0;
      const db = new Proxy(tx, { get(target, key) {
        if (key === '$transaction') return async (fn: any) => {
          const savepoint = `quick_test_${++sequence}`;
          await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          try { const value = await fn(tx); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`); return value; }
          catch (error) { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`); throw error; }
        };
        return target[key];
      } });
      const tenant = await tx.tenant.create({ data: { slug: `quick-test-${randomUUID()}`, name: 'Rollback test' } });
      const other = await tx.tenant.create({ data: { slug: `quick-other-${randomUUID()}`, name: 'Other rollback test' } });
      const admin = await tx.user.create({ data: { tenantId: tenant.id, email: 'admin@test.invalid', name: 'Test admin', role: 'ADMIN', password: 'not-a-login' } });
      const reviewer = await tx.user.create({ data: { tenantId: tenant.id, email: 'reviewer@test.invalid', name: 'Independent reviewer', role: 'ADMIN', password: 'not-a-login' } });
      const review = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId: tenant.id, userId: reviewer.id }, fn);
      const tech = await tx.user.create({ data: { tenantId: tenant.id, email: 'tech@test.invalid', name: 'Test tech', role: 'TECH', password: 'not-a-login' } });
      const foreignAdmin = await tx.user.create({ data: { tenantId: other.id, email: 'admin@test.invalid', name: 'Other admin', role: 'ADMIN', password: 'not-a-login' } });
      const material = await tx.inventoryItem.create({ data: { tenantId: tenant.id, sku: 'MAT', name: 'Barra', qty: 10, avgCost: 100, currency: 'COP', stocks: { create: { tenantId: tenant.id, warehouse: 'TEST', stockOnHand: 10, stockReserved: 0 } } }, include: { stocks: true } });
      const output = await tx.inventoryItem.create({ data: { tenantId: tenant.id, sku: 'OUT', name: 'Buje', qty: 0, criticality: 'LOW', status: 'ACTIVE' } });
      const asset = await tx.asset.create({ data: { tenantId: tenant.id, code: 'TEST-ASSET', name: 'Test asset' } });
      const so = await tx.workOrder.create({ data: { tenantId: tenant.id, kind: 'SERVICE_ORDER', assetCode: asset.code, title: 'Test OS' } });
      const part = await tx.serviceOrderPart.create({ data: { tenantId: tenant.id, workOrderId: so.id, inventoryItemId: output.id, qty: 3, stage: 'REQUIRED' } });
      const quick = new ManufacturingQuickService(db); const demands = new AfterSalesPartDemandsService(db, quick); const manufacturing = new ManufacturingService(db, quick);
      const serviceOrders = new ServiceOrdersService(db, new InventoryLedgerService(db), {} as any, {} as any);
      await tenantStorage.run({ tenantId: tenant.id, userId: admin.id }, async () => {
        const recipe = { name: 'Buje', specification: 'PL-TEST', drawingRevision: 'A', critical: false, stableDesign: true, requiresSerial: false, inspectionMode: 'LOT', currency: 'COP', hourlyRate: 60000, materials: [{ inventoryItemId: material.id, quantity: 2 }], operations: [{ name: 'Tornear', instructions: 'Según plano', estimatedMinutes: 10, evidenceRequired: true }], checks: [{ name: 'Diámetro', criteria: '10 ± 0.1', type: 'NUMERIC', min: 9.9, max: 10.1, evidenceRequired: true }] };
        const profile = await quick.createProfile(output.id, { recipe });
        await assert.rejects(() => db.$transaction((tx: any) => tx.manufacturingQuickProfile.create({ data: { tenantId: other.id, inventoryItemId: output.id, revision: 1, recipe, createdByUserId: foreignAdmin.id } })), /foreign key/i);
        const demand = await demands.create(so.id, part.id, { supplyRoute: 'MAKE', requestedQuantity: 3 });
        await assert.rejects(() => db.$transaction((tx: any) => tx.afterSalesPartDemand.update({ where: { id: demand.id }, data: { installedQuantity: 1 } })), /check constraint/i);
        await assert.rejects(() => demands.createManufacturingOrder(so.id, demand.id, { executionMode: 'EXPEDITED', profileId: profile.id }), /aprobado/);
        await assert.rejects(() => quick.profileAction(profile.id, 'approve'), /otro responsable/);
        await review(() => quick.profileAction(profile.id, 'approve'));
        await assert.rejects(() => quick.profileAction(profile.id, 'approve'), /procesada/);
        const created = await demands.createManufacturingOrder(so.id, demand.id, { executionMode: 'EXPEDITED', profileId: profile.id });
        const orderId = created.manufacturingOrderId;
        assert.equal((await tx.inventoryStock.findUnique({ where: { id: material.stocks[0].id } })).stockReserved, 6);
        const run = async (action: string, body: any = {}) => { const e = await quick.get(orderId); const command = () => quick.command(orderId, action, { lockVersion: e.lockVersion, ...body }); return action === 'inspect' ? review(command) : command(); };
        await assert.rejects(() => run('receive', { quantity: 1, destination: 'DIRECT', recipient: 'Test' }), /aprobadas/);
        await assert.rejects(() => quick.command(orderId, 'release', { lockVersion: 0 }), /cambió/);
        await tenantStorage.run({ tenantId: other.id, userId: foreignAdmin.id }, async () => {
          await assert.rejects(() => quick.get(orderId), /no encontrada/);
          await assert.rejects(() => quick.profiles(output.id), /no encontrado/);
        });
        await tenantStorage.run({ tenantId: tenant.id, userId: tech.id }, async () => {
          await assert.rejects(() => quick.get(orderId), /no encontrada/);
          await assert.rejects(() => quick.profileAction(profile.id, 'retire'), /permiso/);
        });
        await run('release');
        await assert.rejects(() => run('start', { operation: 0 }), /consumo/);
        await run('consume');
        await assert.rejects(() => run('consume'), /consumidos/);
        assert.equal((await tx.inventoryStock.findUnique({ where: { id: material.stocks[0].id } })).stockOnHand, 4);
        await run('start', { operation: 0 });
        await assert.rejects(() => run('complete', { operation: 0 }), /evidencia/);
        await run('pause', { operation: 0 }); await run('start', { operation: 0 });
        await run('complete', { operation: 0, evidence: 'PHOTO-1' });
        await run('inspect', { quantity: 1, results: [{ result: 'PASS', value: 10, evidence: 'CAL-1' }] });
        await run('receive', { quantity: 1, destination: 'DIRECT', recipient: 'Técnico receptor' });
        assert.equal((await quick.get(orderId)).state.receivedQuantity, 1);
        await assert.rejects(() => run('receive', { quantity: 1, destination: 'DIRECT', recipient: 'Test' }), /aprobadas/);
        const installedDirect = await serviceOrders.markPartReplaced(so.id, part.id, { qtyReplaced: 1 });
        assert.equal((await tx.inventoryItem.findUnique({ where: { id: output.id } })).qty, 0, 'Direct installation must not deduct inventory again');
        await serviceOrders.removePart(so.id, installedDirect.id);
        assert.equal((await tx.serviceOrderPart.findUnique({ where: { id: part.id } })).qty, 3, 'Reversing a partial installation restores the required quantity');
        await serviceOrders.markPartReplaced(so.id, part.id, { qtyReplaced: 1 });
        assert.equal((await tx.inventoryItem.findUnique({ where: { id: output.id } })).qty, 0, 'Reinstalling a directly delivered piece must not deduct it again');
        await run('inspect', { quantity: 2, notes: 'Requiere corregir medida', results: [{ result: 'PASS', value: 11, evidence: 'CAL-2' }] });
        assert.equal((await quick.get(orderId)).state.status, 'REWORK_REQUIRED');
        await assert.rejects(() => run('inspect', { quantity: 2, results: [{ result: 'PASS', value: 10, evidence: 'CAL-3' }] }), /fabricación/);
        await run('rework', { notes: 'Ajustar diámetro y repetir medición' });
        await run('extra-material', { inventoryItemId: material.id, quantity: 1, reason: 'Material adicional por desperdicio en retrabajo' });
        await run('start', { operation: 0 }); await run('complete', { operation: 0, evidence: 'PHOTO-2' });
        await run('inspect', { quantity: 2, results: [{ result: 'PASS', value: 10, evidence: 'CAL-3' }] });
        await run('receive', { quantity: 2, destination: 'STOCK', warehouse: 'Terminados' });
        const done = await quick.get(orderId);
        assert.equal(done.orderStatus, 'COMPLETED'); assert.equal(done.costs.materialCost, 700);
        await serviceOrders.markPartReplaced(so.id, part.id, { qtyReplaced: 2 });
        assert.equal((await tx.inventoryItem.findUnique({ where: { id: output.id } })).qty, 0);
        const finalDemand = await tx.afterSalesPartDemand.findUnique({ where: { id: demand.id } });
        assert.equal(finalDemand.status, 'FULFILLED'); assert.equal(Number(finalDemand.installedQuantity), 3);
        await demands.update(so.id, demand.id, { lockVersion: finalDemand.lockVersion, removedPartDisposition: { disposition: 'ANALYSIS', notes: 'Retorno a laboratorio TEST' } });
        // Existing draft OF conversion and cancellation release all reservations.
        const p2 = await tx.serviceOrderPart.create({ data: { tenantId: tenant.id, workOrderId: so.id, inventoryItemId: output.id, qty: 1, stage: 'REQUIRED' } });
        const d2 = await demands.create(so.id, p2.id, { supplyRoute: 'MAKE' });
        const o2 = await demands.createManufacturingOrder(so.id, d2.id, {});
        const order2 = await tx.manufacturingOrder.findUnique({ where: { id: o2.manufacturingOrderId } });
        await quick.enable(order2.id, { profileId: profile.id, version: order2.version });
        assert.equal((await tx.inventoryStock.findUnique({ where: { id: material.stocks[0].id } })).stockReserved, 2);
        await manufacturing.cancelOrder(order2.id, { reason: 'Test cancel' });
        assert.equal((await tx.inventoryStock.findUnique({ where: { id: material.stocks[0].id } })).stockReserved, 0);
        assert.equal((await tx.afterSalesPartDemand.findUnique({ where: { id: d2.id } })).manufacturingOrderId, null);
        const p3 = await tx.serviceOrderPart.create({ data: { tenantId: tenant.id, workOrderId: so.id, inventoryItemId: output.id, qty: 3, stage: 'REQUIRED' } });
        const d3 = await demands.create(so.id, p3.id, { supplyRoute: 'MAKE' });
        const held = await demands.update(so.id, d3.id, { lockVersion: d3.lockVersion, status: 'ON_HOLD', reason: 'Esperar autorización del cliente' });
        await assert.rejects(() => demands.createManufacturingOrder(so.id, d3.id, {}), /Reanuda/);
        await demands.update(so.id, d3.id, { lockVersion: held.lockVersion, status: 'VALIDATED' });
        const o3 = await demands.createManufacturingOrder(so.id, d3.id, { executionMode: 'EXPEDITED', profileId: profile.id });
        let e3 = await quick.get(o3.manufacturingOrderId);
        assert.equal(e3.state.status, 'PENDING_MATERIALS');
        await assert.rejects(() => quick.command(o3.manufacturingOrderId, 'release', { lockVersion: e3.lockVersion }), /Reserva/);
        await manufacturing.cancelOrder(o3.manufacturingOrderId, { reason: 'Test shortage cancellation' });
        assert.equal((await tx.inventoryStock.findUnique({ where: { id: material.stocks[0].id } })).stockReserved, 0);
        const revision2 = await quick.createProfile(output.id, { recipe: { ...recipe, specification: 'PL-TEST-B' } });
        await review(() => quick.profileAction(revision2.id, 'approve'));
        assert.equal((await quick.get(orderId)).recipeSnapshot.specification, 'PL-TEST', 'Approved revisions must not mutate old orders');
        await quick.profileAction(profile.id, 'retire');
        await assert.rejects(() => demands.createManufacturingOrder(so.id, d3.id, { executionMode: 'EXPEDITED', profileId: profile.id }), /aprobado/);
        const metrics = await quick.metrics();
        assert.equal(metrics.completed, 1); assert.equal(metrics.currencies[0].total >= 700, true);
        console.log('PASS: profile approval, tenant/role isolation, reservation, consumption, quality/rework, partial output, direct delivery, installation, disposition, conversion and cancellation');
      });
      throw rollback;
    }, { timeout: 120000, isolationLevel: 'Serializable' });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
