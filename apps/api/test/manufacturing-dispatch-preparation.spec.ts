import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ManufacturingDispatchService } from '../src/modules/manufacturing/manufacturing-dispatch.service';
import { tenantStorage } from '../src/common/tenant-context';

function setup() {
  let fat: any = null;
  const order = { id: 'order', number: 'MO-1', status: 'RELEASED', members: [] };
  const row: any = { id: 'dispatch', tenantId: 'tenant', manufacturingOrderId: 'order', manufacturedUnitId: 'unit', manufacturingOrder: order, manufacturedUnit: { serialNumber: 'SERIAL' }, status: 'READY', lockVersion: 1, createdByUserId: 'maker', checklistItems: [], packages: [{}], documents: [{ documentType: 'PACKING_LIST' }, { documentType: 'TRANSPORT_DOCUMENT' }], destination: 'Cliente', deliveryAddress: 'Planta', carrierName: 'Transporte' };
  const writes: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    user: { findFirst: async () => ({ id: 'reviewer', name: 'Reviewer', role: 'ADMIN' }) },
    manufacturedUnit: { findFirst: async () => ({ id: 'unit', unitNumber: 1, manufacturingOrderId: 'order', manufacturingOrder: order }) },
    manufacturingFatExecution: { findFirst: async () => fat },
    manufacturingDispatch: { count: async () => 0, findFirst: async () => row, create: async ({ data }: any) => { writes.push(data); return { id: 'dispatch', ...data }; }, update: async ({ data }: any) => { writes.push(data); return data; } },
    manufacturingDispatchChecklistItem: { createMany: async () => ({ count: 6 }) },
    manufacturingOrder: { update: async () => ({}) },
    manufacturingAuditEvent: { create: async () => ({}) },
  };
  const service = new ManufacturingDispatchService({ $transaction: async (fn: any) => fn(tx) } as any);
  service.list = async () => [];
  const run = (fn: () => Promise<any>) => tenantStorage.run({ tenantId: 'tenant', userId: 'reviewer' }, fn);
  return { service, row, order, writes, run, setFat: (value: any) => { fat = value; } };
}

test('prepare without FAT, but not for paused, canceled or completed orders', async () => {
  const s = setup(); await s.run(() => s.service.create('unit', {}));
  assert.equal(s.writes[0].fatExecutionId, null);
  for (const status of ['ON_HOLD', 'CANCELED', 'COMPLETED']) {
    s.order.status = status;
    await assert.rejects(s.run(() => s.service.create('unit', {})), /orden no permite/);
  }
});
test('embalaje and reopening do not require an approved FAT', async () => {
  const s = setup(); s.row.status = 'PREPARING';
  await s.run(() => s.service.markReady('dispatch', { lockVersion: 1 }));
  assert.equal(s.writes[0].status, 'READY');
  s.row.status = 'CANCELED'; await s.run(() => s.service.reopen('dispatch', { lockVersion: 1 }));
  assert.equal(s.writes[1].fatExecutionId, null);
});
test('authorization binds the latest approved FAT, not the initially linked test', async () => {
  const s = setup(); s.row.fatExecutionId = 'old';
  for (const status of [null, 'DRAFT', 'IN_PROGRESS', 'REJECTED']) {
    s.setFat(status ? { id: 'latest', status } : null);
    await assert.rejects(s.run(() => s.service.authorize('dispatch', { lockVersion: 1 })), /FAT más reciente/);
  }
  assert.equal(s.writes.length, 0);
  s.setFat({ id: 'latest', status: 'APPROVED' });
  await s.run(() => s.service.authorize('dispatch', { lockVersion: 1 }));
  assert.equal(s.writes[0].fatExecutionId, 'latest');
});
test('departure rechecks approval and rejects a FAT changed after authorization', async () => {
  const s = setup(); s.row.status = 'AUTHORIZED'; s.row.fatExecutionId = 'approved';
  const send = () => s.run(() => s.service.dispatch('dispatch', { lockVersion: 1, trackingNumber: 'TRACK' }));
  await assert.rejects(send(), /FAT más reciente/);
  s.setFat({ id: 'new', status: 'IN_PROGRESS' }); await assert.rejects(send(), /FAT más reciente/);
  s.setFat({ id: 'new', status: 'APPROVED' }); await assert.rejects(send(), /FAT cambió/);
  assert.equal(s.writes.length, 0);
  s.setFat({ id: 'approved', status: 'APPROVED' }); await send();
  assert.equal(s.writes[0].status, 'DISPATCHED');
});
