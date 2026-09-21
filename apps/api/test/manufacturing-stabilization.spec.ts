import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { manufacturingControl, ControlRow } from '../src/modules/manufacturing/manufacturing-control.domain';
import { assertIndependentApproval } from '../src/modules/manufacturing/manufacturing-approval';
import { assertDemandTransition, demandProgress } from '../src/modules/service-orders/after-sales-part-demands.domain';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { CreateManufacturingOrderDto } from '../src/modules/manufacturing/dto/manufacturing.dto';
import { CreateManufacturingSatTemplateDto } from '../src/modules/manufacturing/dto/manufacturing-sat.dto';
import { ManufacturingQuickCommandDto } from '../src/modules/manufacturing/dto/manufacturing-quick.dto';
import contracts from '../src/modules/manufacturing/manufacturing-contracts.json';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingController } from '../src/modules/manufacturing/manufacturing.controller';
import { ManufacturingService } from '../src/modules/manufacturing/manufacturing.service';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';

const order = (): ControlRow => ({ id: 'o', number: 'OF-1', projectName: 'Equipo', status: 'RELEASED', orderType: 'EQUIPMENT', executionMode: 'STANDARD', units: [{ id: 'u', unitNumber: 1, status: 'PLANNED' }], engineeringReleases: [{ status: 'RELEASED' }], supplyPlans: [{ requirements: [] }], kits: [{ id: 'k', manufacturedUnitId: 'u', status: 'RELEASED' }], assemblyExecutions: [{ kitId: 'k', status: 'COMPLETED', operations: [] }], fatExecutions: [{ manufacturedUnitId: 'u', status: 'APPROVED', sequence: 1, deviations: [] }], dispatches: [], siteDeployments: [], satExecutions: [], handovers: [], outputReceipts: [] });
test('control uses latest FAT and does not count another unit as completed', () => {
  const row = order(); assert.equal(manufacturingControl(row).stage, 'Despacho');
  row.fatExecutions.push({ manufacturedUnitId: 'u', status: 'REJECTED', sequence: 2, deviations: [{ status: 'OPEN' }] });
  assert.equal(manufacturingControl(row).stage, 'FAT / Calidad');
  assert.equal(manufacturingControl(row).risk, 'HIGH');
  row.units.push({ id: 'u2', unitNumber: 2, status: 'PLANNED' });
  assert.equal(manufacturingControl(row).stage, 'Kits');
});
test('control follows installation, conditional SAT, handover and closure', () => {
  const row = order(); row.dispatches.push({ manufacturedUnitId: 'u', status: 'DELIVERED' });
  assert.equal(manufacturingControl(row).stage, 'Montaje en cliente');
  row.siteDeployments.push({ manufacturedUnitId: 'u', status: 'READY_FOR_SAT' });
  assert.equal(manufacturingControl(row).stage, 'SAT');
  row.satExecutions.push({ manufacturedUnitId: 'u', sequence: 1, status: 'ACCEPTED_WITH_PENDING_ITEMS', deviations: [{ status: 'OPEN' }] });
  assert.equal(manufacturingControl(row).stage, 'SAT');
  row.satExecutions[0].status = 'ACCEPTED'; row.satExecutions[0].deviations = [];
  assert.equal(manufacturingControl(row).stage, 'Entrega final');
  row.status = 'COMPLETED'; row.requestedDeliveryAt = '2000-01-01';
  assert.equal(manufacturingControl(row).progress, 100); assert.equal(manufacturingControl(row).risk, 'CLOSED');
});
test('a shortage elsewhere does not regress an already shipped unit', () => {
  const row = order();
  row.supplyPlans = [{ requirements: [{ included: true, status: 'OPEN' }] }];
  row.dispatches.push({ manufacturedUnitId: 'u', status: 'DELIVERED' });
  assert.equal(manufacturingControl(row).units[0].stage, 'Montaje en cliente');
  assert.ok(manufacturingControl(row).blockers.some(b => b.includes('abastecimiento')));
});
test('hold and expired promises create actionable risks; canceled units excluded', () => {
  const row = order(); row.status = 'ON_HOLD'; row.holdReason = 'Falta aprobación cliente'; row.units.push({ id: 'cancel', unitNumber: 2, status: 'CANCELED' });
  row.requestedDeliveryAt = '2020-01-01';
  const control = manufacturingControl(row); assert.equal(control.units.length, 1); assert.equal(control.risk, 'HIGH'); assert.match(control.nextAction, /reanudar/); assert.ok(control.blockers.includes(row.holdReason));
});
test('quick control identifies rework without inventing receipts per serial', () => {
  const row = order(); row.executionMode = 'EXPEDITED'; row.quickExecution = { state: { status: 'REWORK_REQUIRED', inspections: [] } };
  const control = manufacturingControl(row); assert.ok(control.blockers.some(b => b.includes('retrabajo'))); assert.equal(control.risk, 'HIGH');
});
test('demand quantities and transitions cannot invent readiness or installed parts', () => {
  assert.throws(() => demandProgress(3, 1, 2));
  assert.throws(() => assertDemandTransition('SOURCING', 'READY', 3, 0, 0));
  assert.throws(() => assertDemandTransition('READY', 'CANCELED', 3, 3, 0));
  assert.equal(demandProgress(3, 2, 1), 'PARTIALLY_FULFILLED');
  assert.equal(demandProgress(3, 3, 3), 'FULFILLED');
  assert.doesNotThrow(() => assertDemandTransition('ON_HOLD', 'READY', 3, 3, 0));
});
test('approval requires independence or a meaningful recorded exception', () => {
  assert.throws(() => assertIndependentApproval('a', ['a']));
  assert.throws(() => assertIndependentApproval('a', ['a'], 'ok'));
  assert.doesNotThrow(() => assertIndependentApproval('b', ['a']));
  assert.doesNotThrow(() => assertIndependentApproval('a', ['a'], 'Único responsable disponible; revisión supervisada por cliente.'));
});
test('contracts reject unexpected fields, nested invalid types and stale-shaped versions', () => {
  const pipe = new ManufacturingValidationPipe();
  const check = (body: unknown, metatype: any) => pipe.transform(body, { type: 'body', metatype });
  const base = { projectName: 'P', productName: 'Equipo', responsibleUserId: 'a' };
  assert.doesNotThrow(() => check(base, CreateManufacturingOrderDto));
  assert.throws(() => check({ ...base, tenantId: 'foreign' }, CreateManufacturingOrderDto));
  assert.throws(() => check({ ...base, quantity: '5' }, CreateManufacturingOrderDto));
  assert.throws(() => check({ code: 'SAT', name: 'SAT', cases: [{ position: 1, name: 'Test', acceptanceCriteria: 'OK', required: 'false' }] }, CreateManufacturingSatTemplateDto));
  assert.throws(() => check({ lockVersion: -1 }, ManufacturingQuickCommandDto));
  assert.throws(() => check({ lockVersion: 1, results: [{ result: 'PASS', value: null, bypass: true }] }, ManufacturingQuickCommandDto));
});
test('committed runtime contracts match DTO definitions', () => {
  const generated = JSON.parse(execFileSync(process.execPath, ['scripts/manufacturing-contracts.cjs'], { encoding: 'utf8' }));
  assert.deepEqual(contracts, generated);
});
test('HTTP routes enforce DTO metadata and block viewers before reaching writes', async () => {
  let writes = 0;
  const db = { user: { findFirst: async () => ({ role: tenantStorage.getStore()?.userId }) } };
  class TestModule {}
  Module({ controllers: [ManufacturingController], providers: [
    { provide: PrismaService, useValue: db },
    { provide: ManufacturingService, useValue: { createOrder: async (body: unknown) => { writes++; return body; } } },
    ManufacturingAccessGuard, ManufacturingValidationPipe,
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use((req: any, _res: any, next: () => void) => tenantStorage.run({ tenantId: 'test', userId: req.headers['x-test-role'] || 'ADMIN' }, next));
  try {
    await app.listen(0, '127.0.0.1');
    const url = `${await app.getUrl()}/api/manufacturing/orders`;
    const post = (body: unknown, role = 'ADMIN') => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body) });
    const valid = { projectName: 'Test', productName: 'Machine', responsibleUserId: 'test' };
    assert.equal((await post({ ...valid, tenantId: 'foreign' })).status, 400);
    assert.equal((await post({ ...valid, quantity: '2' })).status, 400);
    assert.equal((await post(valid, 'VIEWER')).status, 403);
    assert.equal(writes, 0);
    assert.equal((await post(valid)).status, 201);
    assert.equal(writes, 1);
  } finally { await app.close(); }
});
