import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import { TelegramService, renderTelegramText, verifyTelegramSecret } from '../src/modules/notifications/telegram.service';
import { telegramConfigured, telegramReceiveMode } from '../src/modules/notifications/telegram.config';
import { TelegramPollingService } from '../src/modules/notifications/telegram-polling.service';
import { TelegramWorkerService } from '../src/modules/notifications/telegram-worker.service';
import { TelegramMessageDto } from '../src/modules/notifications/telegram.dto';
import { TelegramController } from '../src/modules/notifications/telegram.controller';
import { TenantAdminGuard } from '../src/common/guards/tenant-admin.guard';
import { tenantStorage } from '../src/common/tenant-context';

const context = <T>(fn: () => T) => tenantStorage.run({ tenantId: 'tenant-a', userId: 'admin-a' }, fn);
const linkedAt = new Date('2026-09-27T12:00:00Z');
const recipient = { id: 'connection-a', tenantId: 'tenant-a', userId: 'tech-a', chatId: '123', linkedAt, user: { name: 'Ana' } };
const dto = { userIds: ['tech-a'], text: 'Hola, {nombre}', requestId: 'be818936-53fe-43c5-84d6-1305b3db6ff4' };
const job: any = { id: 'job-a', ...recipient, kind: 'MANUAL', text: 'Hola', status: 'SENDING', attempts: 1, leaseId: 'lease-a' };
function database(tx: any) { return { ...tx, $transaction: async (fn: any) => fn(tx) } as any; }

// No live Telegram requests or application database are used by these tests.
test('personalization preserves literal dollar signs, trims, and enforces Telegram size', () => {
  assert.equal(renderTelegramText(' Hola, {nombre} / {nombre} ', '$&'), 'Hola, $& / $&');
  assert.throws(() => renderTelegramText('   ', 'Ana'));
  assert.throws(() => renderTelegramText('{nombre}', 'a'.repeat(4097)));
});

test('webhook fails closed without the configured secret', () => {
  const old = process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    assert.throws(() => verifyTelegramSecret('anything'));
    process.env.TELEGRAM_WEBHOOK_SECRET = 'correct-secret';
    for (const value of [undefined, '', 'wrong-secret', 'x'.repeat(300)]) assert.throws(() => verifyTelegramSecret(value));
    assert.doesNotThrow(() => verifyTelegramSecret('correct-secret'));
  } finally { if (old === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = old; }
});

test('manual endpoints require tenant admin and validate recipient limits and request IDs', async () => {
  for (const name of ['manual', 'recipients', 'allHistory'] as const) {
    assert.ok(Reflect.getMetadata('__guards__', TelegramController.prototype[name]).includes(TenantAdminGuard));
  }
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const value of [
    { ...dto, userIds: [] }, { ...dto, userIds: ['x', 'x'] }, { ...dto, userIds: Array.from({ length: 101 }, (_, i) => String(i)) },
    { ...dto, requestId: 'not-a-uuid' }, { ...dto, chatId: '123' }, { ...dto, tenantId: 'tenant-b' }, { ...dto, text: 'x'.repeat(4001) },
  ]) await assert.rejects(pipe.transform(value, { type: 'body', metatype: TelegramMessageDto }));
  await pipe.transform(dto, { type: 'body', metatype: TelegramMessageDto });
});

test('manual delivery rejects unlinked or cross-tenant recipients without partial enqueue', async () => {
  const old = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'test';
  try {
    let writes = 0;
    const service = new TelegramService(database({
      telegramConnection: { findMany: async ({ where }: any) => { assert.equal(where.tenantId, 'tenant-a'); assert.equal(where.user.tenantId, 'tenant-a'); return []; } },
      telegramDelivery: { createMany: async () => { writes++; } },
    }));
    await context(() => assert.rejects(service.manual(dto)));
    assert.equal(writes, 0);
  } finally { if (old === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = old; }
});

test('manual request retry uses the same deduplication key per recipient', async () => {
  const old = process.env.TELEGRAM_BOT_TOKEN; process.env.TELEGRAM_BOT_TOKEN = 'test';
  try {
    const seen = new Set();
    const service = new TelegramService(database({
      telegramConnection: { findMany: async () => [recipient] },
      telegramDelivery: { createMany: async ({ data, skipDuplicates }: any) => {
        assert.equal(skipDuplicates, true); assert.equal(data[0].text, 'Hola, Ana');
        assert.equal(data[0].tenantId, 'tenant-a'); assert.equal(data[0].actorUserId, 'admin-a');
        const key = data[0].eventKey; if (seen.has(key)) return { count: 0 }; seen.add(key); return { count: 1 };
      } },
    }));
    assert.deepEqual(await context(() => service.manual(dto)), { queued: 1, alreadyQueued: 0 });
    assert.deepEqual(await context(() => service.manual(dto)), { queued: 0, alreadyQueued: 1 });
  } finally { if (old === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = old; }
});

test('link token is hashed, single use, expires, and cannot be used from a group', async () => {
  const token = 'A'.repeat(43), hash = createHash('sha256').update(token).digest('hex');
  let consumed = false, deliveries = 0, reads = 0;
  const tx = {
    telegramConnection: {
      findFirst: async ({ where }: any) => {
        if (where.telegramUserId) return null;
        reads++; assert.equal(where.linkTokenHash, hash); assert.ok(where.linkExpiresAt.gt instanceof Date);
        return consumed ? null : recipient;
      },
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.linkTokenHash, hash); assert.equal(data.linkTokenHash, null);
        assert.equal(data.telegramUserId, '123'); assert.equal(data.enabled, true);
        if (consumed) return { count: 0 }; consumed = true; return { count: 1 };
      },
    },
    telegramDelivery: { create: async () => { deliveries++; } },
  };
  const service = new TelegramService(database(tx));
  const update = { message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: `/start ${token}` } };
  await service.webhook({ message: { ...update.message, chat: { id: -1, type: 'group' } } });
  assert.equal(reads, 0);
  await service.webhook(update); await service.webhook(update);
  assert.equal(deliveries, 1);
});

test('a concurrent token consumer that loses the update does not enqueue a welcome', async () => {
  const service = new TelegramService(database({
    telegramConnection: { findFirst: async ({ where }: any) => where.telegramUserId ? null : recipient, updateMany: async () => ({ count: 0 }) },
    telegramDelivery: { create: async () => assert.fail('must not enqueue') },
  }));
  await service.webhook({ message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: `/start ${'A'.repeat(43)}` } });
});

test('/stop disables this private chat and cancels pending deliveries', async () => {
  const calls: any[] = [];
  const service = new TelegramService(database({
    telegramConnection: { updateMany: async (args: any) => { calls.push(args); } },
    telegramDelivery: { updateMany: async (args: any) => { calls.push(args); } },
  }));
  await service.webhook({ message: { chat: { id: 123, type: 'private' }, text: '/stop' } });
  assert.equal(calls[0].where.chatId, '123'); assert.equal(calls[0].data.enabled, false);
  assert.equal(calls[1].data.status, 'CANCELED'); assert.equal(calls[1].where.status, 'PENDING');
});

test('worker suppresses delivery after disconnect or reassignment', async () => {
  const original = global.fetch;
  global.fetch = async () => { assert.fail('must not contact Telegram'); };
  try {
    for (const connected of [false, true]) {
      let result: any;
      const worker = new TelegramWorkerService({
        telegramConnection: { findFirst: async ({ where }: any) => { assert.equal(where.tenantId, 'tenant-a'); assert.equal(where.linkedAt, linkedAt); return connected ? recipient : null; } },
        wOAssignment: { findFirst: async () => null },
        telegramDelivery: { updateMany: async ({ where, data }: any) => { assert.equal(where.leaseId, 'lease-a'); result = data; } },
      } as any);
      await worker.deliver({ ...job, kind: 'SCHEDULE', workOrderId: 'order-a' });
      assert.equal(result.status, 'CANCELED');
    }
  } finally { global.fetch = original; }
});

test('worker handles success, rate limit, permanent error, block and network failure', async () => {
  const original = global.fetch;
  try {
    for (const code of [200, 429, 400, 403, 500, 0]) {
      let result: any, disabled = false;
      global.fetch = async (_url, options) => {
        assert.equal(JSON.parse(String(options?.body)).chat_id, '123');
        if (!code) throw new Error('secret-token-must-not-leak');
        return { ok: code === 200, status: code, json: async () => code === 200
          ? { ok: true, result: { message_id: 42 } }
          : { ok: false, error_code: code, parameters: { retry_after: 60 } } } as any;
      };
      const worker = new TelegramWorkerService({
        telegramConnection: { findFirst: async () => recipient, updateMany: async () => { disabled = true; } },
        telegramDelivery: { updateMany: async ({ data }: any) => { result = data; } },
      } as any);
      await worker.deliver(job);
      assert.equal(result.status, code === 200 ? 'SENT' : [400, 403].includes(code) ? 'FAILED' : 'PENDING');
      assert.equal(disabled, code === 403);
      if (code === 429) assert.ok(result.availableAt.getTime() >= Date.now() + 59_000);
      assert.ok(!String(result.error).includes('secret-token'));
    }
  } finally { global.fetch = original; }
});

test('worker stops retrying after the final attempt', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => { throw new Error('offline'); };
    let status;
    const worker = new TelegramWorkerService({
      telegramConnection: { findFirst: async () => recipient },
      telegramDelivery: { updateMany: async ({ data }: any) => { status = data.status; } },
    } as any);
    await worker.deliver({ ...job, attempts: 5 }); assert.equal(status, 'FAILED');
  } finally { global.fetch = original; }
});


test('polling configuration works without a webhook secret or public URL', () => {
  const keys = ['TELEGRAM_RECEIVE_MODE', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET', 'CMMS_PUBLIC_URL'];
  const old = keys.map(k => process.env[k]);
  try {
    process.env.TELEGRAM_BOT_TOKEN = 'fake'; process.env.TELEGRAM_BOT_USERNAME = 'test_bot';
    delete process.env.TELEGRAM_WEBHOOK_SECRET; delete process.env.CMMS_PUBLIC_URL;
    process.env.TELEGRAM_RECEIVE_MODE = 'polling'; assert.equal(telegramConfigured(), true);
    process.env.TELEGRAM_RECEIVE_MODE = 'webhook'; assert.equal(telegramConfigured(), false);
    process.env.TELEGRAM_WEBHOOK_SECRET = 'secret'; assert.equal(telegramConfigured(), true);
    process.env.TELEGRAM_RECEIVE_MODE = 'typo'; assert.equal(telegramReceiveMode(), null); assert.equal(telegramConfigured(), false);
  } finally { keys.forEach((k, i) => { if (old[i] === undefined) delete process.env[k]; else process.env[k] = old[i]; }); }
});

test('polling mode rejects webhook deliveries to avoid parallel receivers', () => {
  const old = process.env.TELEGRAM_RECEIVE_MODE;
  try {
    process.env.TELEGRAM_RECEIVE_MODE = 'polling';
    const controller = new TelegramController({ webhook: () => assert.fail('must not process') } as any);
    assert.throws(() => controller.webhook('any', {}), /polling/);
  } finally { if (old === undefined) delete process.env.TELEGRAM_RECEIVE_MODE; else process.env.TELEGRAM_RECEIVE_MODE = old; }
});

test('polling backs off on rate limit/conflict and never logs token-bearing errors', async () => {
  const old = process.env.TELEGRAM_RECEIVE_MODE;
  const original = global.fetch;
  try {
    process.env.TELEGRAM_RECEIVE_MODE = 'polling';
    for (const code of [429, 409, 0]) {
      global.fetch = async () => {
        if (!code) throw new Error('https://api.telegram.org/botSECRET/getUpdates');
        return { ok: false, status: code, json: async () => ({ ok: false, error_code: code, parameters: { retry_after: 120 } }) } as any;
      };
      const receiver = new TelegramPollingService({} as any, {} as any);
      let log = '';
      (receiver as any).logger = { warn: (message: string) => { log = message; } };
      const delay = await (receiver as any).cycle();
      assert.ok(delay >= (code ? 120_000 : 4000));
      assert.ok(!log.includes('SECRET')); assert.ok(!log.includes('api.telegram.org'));
      await receiver.onModuleDestroy();
    }
  } finally { global.fetch = original; if (old === undefined) delete process.env.TELEGRAM_RECEIVE_MODE; else process.env.TELEGRAM_RECEIVE_MODE = old; }
});

test('polling shutdown aborts an in-flight request without rescheduling', async () => {
  const old = process.env.TELEGRAM_RECEIVE_MODE;
  const original = global.fetch;
  try {
    process.env.TELEGRAM_RECEIVE_MODE = 'polling';
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    global.fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      entered();
    });
    const receiver = new TelegramPollingService({} as any, {} as any);
    const task = (receiver as any).cycle();
    (receiver as any).active = task;
    await started;
    await receiver.onModuleDestroy();
    assert.equal(await task, 0);
  } finally { global.fetch = original; if (old === undefined) delete process.env.TELEGRAM_RECEIVE_MODE; else process.env.TELEGRAM_RECEIVE_MODE = old; }
});
