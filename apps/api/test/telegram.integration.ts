import 'reflect-metadata';
import { testPolling } from './telegram-polling.integration';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma.service';
import { TelegramService } from '../src/modules/notifications/telegram.service';
import { TelegramWorkerService } from '../src/modules/notifications/telegram-worker.service';
import { WorkOrdersService } from '../src/modules/work-orders/work-orders.service';
import { ServiceOrdersService } from '../src/modules/service-orders/service-orders.service';
import { TenantAdminGuard } from '../src/common/guards/tenant-admin.guard';
import { tenantStorage } from '../src/common/tenant-context';

async function main() {
  const url = process.env.TELEGRAM_TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/telegram_test') throw new Error('Se requiere una base aislada llamada telegram_test en TELEGRAM_TEST_DATABASE_URL');
  const db = new PrismaService({ datasourceUrl: url });
  process.env.TELEGRAM_BOT_TOKEN = 'fake-test-token';
  process.env.TELEGRAM_BOT_USERNAME = 'cmms_test_bot';
  process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret';
  process.env.TELEGRAM_WORKER_ENABLED = 'false';
  const fetchOriginal = global.fetch;
  let requests = 0;
  global.fetch = async () => { requests++; return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: requests } }) } as any; };
  const service = new TelegramService(db);
  const worker = new TelegramWorkerService(db);
  const prefix = randomUUID();
  const tenant = await db.tenant.create({ data: { name: 'Telegram test', slug: `telegram-${prefix}` } });
  const foreign = await db.tenant.create({ data: { name: 'Other test', slug: `other-${prefix}` } });
  const act = <T>(userId: string, fn: () => Promise<T>, tenantId = tenant.id) => tenantStorage.run({ tenantId, userId }, fn);
  try {
    const admin = await db.user.create({ data: { tenantId: tenant.id, name: 'Administrador', email: 'admin@test.invalid', password: 'not-a-login', role: 'ADMIN' } });
    const tech = await db.user.create({ data: { tenantId: tenant.id, name: 'Ana', email: 'tech@test.invalid', password: 'not-a-login', role: 'TECH' } });
    const other = await db.user.create({ data: { tenantId: foreign.id, name: 'Other', email: 'other@test.invalid', password: 'not-a-login', role: 'ADMIN' } });
    const update = (token: string, id: number) => ({ message: { chat: { type: 'private', id }, from: { id, username: `person_${id}` }, text: `/start ${token}` } });
    const link = await act(tech.id, () => service.link());
    const token = new URL(link.url).searchParams.get('start')!;
    const row = await db.telegramConnection.findUniqueOrThrow({ where: { userId: tech.id } });
    assert.notEqual(row.linkTokenHash, token); assert.equal(token.length, 43);
    await Promise.all([service.webhook(update(token, 123)), service.webhook(update(token, 123))]);
    assert.equal(await db.telegramDelivery.count({ where: { userId: tech.id, kind: 'WELCOME' } }), 1);
    assert.equal((await act(tech.id, () => service.me())).connected, true);
    const expired = await act(admin.id, () => service.link());
    await db.telegramConnection.update({ where: { userId: admin.id }, data: { linkExpiresAt: new Date(0) } });
    await service.webhook(update(new URL(expired.url).searchParams.get('start')!, 456));
    assert.equal((await act(admin.id, () => service.me())).connected, false);
    assert.deepEqual(await act(other.id, () => service.recipients(), foreign.id), []);
    await assert.rejects(act(tech.id, () => new TenantAdminGuard(db).canActivate({} as any)));
    assert.equal(await act(admin.id, () => new TenantAdminGuard(db).canActivate({} as any)), true);
    const message = { userIds: [tech.id], text: 'Hola, {nombre}', requestId: randomUUID() };
    const results = await act(admin.id, () => Promise.all([service.manual(message), service.manual(message)]));
    assert.equal(results.reduce((sum, r) => sum + r.queued, 0), 1);
    await assert.rejects(act(other.id, () => service.manual(message), foreign.id));
    assert.equal((await act(other.id, () => service.history(true), foreign.id)).length, 0);
    // Actual DB leases: concurrent workers cannot claim the same job or overlap this chat.
    const claims = await Promise.all([(worker as any).claim(), (new TelegramWorkerService(db) as any).claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
    await worker.deliver(claims.find(Boolean)); assert.equal(requests, 1);
    await act(tech.id, () => service.preferences({ enabled: false, automatic: true }));
    assert.equal(await db.telegramDelivery.count({ where: { userId: tech.id, status: 'PENDING' } }), 0);
    await act(tech.id, () => service.preferences({ enabled: true, automatic: true }));
    const asset = await db.asset.create({ data: { tenantId: tenant.id, code: 'TG-TEST', name: 'Equipo' } });
    const order = await db.workOrder.create({ data: { tenantId: tenant.id, kind: 'SERVICE_ORDER', assetCode: asset.code, title: 'Telegram test' } });
    const orders = new ServiceOrdersService(db, {} as any, {} as any, { reconcileAssetTimelines: async () => ({}) } as any, service);
    const schedule = { technicianId: tech.id, dueDate: '2026-10-10T13:00:00Z' };
    await act(admin.id, () => orders.schedule(order.id, schedule));
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, kind: 'SCHEDULE' } }), 1);
    await act(admin.id, () => orders.schedule(order.id, schedule));
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, kind: 'SCHEDULE' } }), 1, 'no-op schedule must not enqueue');
    await act(admin.id, () => orders.schedule(order.id, { dueDate: '2026-10-11T13:00:00Z' }));
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, kind: 'SCHEDULE' } }), 2);
    const extra = await db.user.create({ data: { tenantId: tenant.id, name: 'Luis', email: 'extra@test.invalid', password: 'not-a-login', role: 'TECH' } });
    const extraLink = await act(extra.id, () => service.link());
    await service.webhook(update(new URL(extraLink.url).searchParams.get('start')!, 789));
    const workOrders = new WorkOrdersService(db, {} as any, service);
    const additions = await act(admin.id, () => Promise.all([
      workOrders.addAssignment(order.id, { userId: extra.id, role: 'TECHNICIAN' }),
      workOrders.addAssignment(order.id, { userId: extra.id, role: 'TECHNICIAN' }),
    ]));
    assert.equal(additions[0].id, additions[1].id, 'concurrent assignment must be idempotent');
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, userId: extra.id } }), 1);
    await assert.rejects(act(admin.id, () => workOrders.addAssignment(order.id, { userId: other.id, role: 'TECHNICIAN' })));
    await assert.rejects(act(other.id, () => workOrders.updateAssignment(order.id, additions[0].id, { state: 'REMOVED' }), foreign.id));
    await act(admin.id, () => orders.schedule(order.id, { dueDate: '2026-10-12T13:00:00Z' }));
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, kind: 'SCHEDULE' } }), 5, 'reschedule must notify both active technicians');
    await act(admin.id, () => workOrders.updateAssignment(order.id, additions[0].id, { state: 'REMOVED' }));
    await act(admin.id, () => workOrders.updateAssignment(order.id, additions[0].id, { state: 'ACTIVE' }));
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, userId: extra.id } }), 3, 'reactivation must notify');
    assert.equal(await db.telegramDelivery.count({ where: { workOrderId: order.id, userId: tech.id, status: 'PENDING' } }), 1, 'only the latest schedule should remain pending');
    const before = await db.telegramDelivery.count();
    await assert.rejects(db.$transaction(async tx => {
      await service.queueSchedule(tx, tenant.id, tech.id, order, admin.id);
      throw new Error('rollback');
    }));
    assert.equal(await db.telegramDelivery.count(), before, 'rollback must remove queued message');
    // Removing assignment cancels a queued automatic delivery, without an external call.
    await act(admin.id, () => orders.schedule(order.id, { technicianId: null } as any));
    const pending = await db.telegramDelivery.findFirstOrThrow({ where: { workOrderId: order.id, status: 'PENDING' } });
    const leased = await db.telegramDelivery.update({ where: { id: pending.id }, data: { status: 'SENDING', leaseId: 'test-lease' } });
    await worker.deliver(leased);
    assert.equal((await db.telegramDelivery.findUniqueOrThrow({ where: { id: leased.id } })).status, 'CANCELED');
    assert.equal(requests, 1);
    await service.webhook({ message: { chat: { type: 'private', id: 123 }, text: '/stop' } });
    assert.equal((await act(tech.id, () => service.me())).enabled, false);
    await act(tech.id, () => service.disconnect());
    await service.webhook(update(token, 123));
    assert.equal((await act(tech.id, () => service.me())).connected, false, 'consumed token must not reconnect');
    await testPolling(db, service, tech);
    console.log('Telegram integration: linking, expiration, replay, tenant isolation, permissions, deduplication, concurrent leases, scheduling, rollback and cancellation passed. No live Telegram requests.');
  } finally {
    global.fetch = fetchOriginal;
    // This script accepts only the dedicated test database; never application DATABASE_URL.
    const tenantIds = [tenant.id, foreign.id];
    await db.telegramDelivery.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.telegramConnection.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.wOAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.workOrder.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.asset.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
