import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../src/prisma.service';
import { TelegramService } from '../src/modules/notifications/telegram.service';
import { TelegramPollingService } from '../src/modules/notifications/telegram-polling.service';
import { tenantStorage } from '../src/common/tenant-context';

export async function testPolling(db: PrismaService, telegram: TelegramService, user: { id: string; tenantId: string }) {
  const originalFetch = global.fetch;
  const oldMode = process.env.TELEGRAM_RECEIVE_MODE;
  process.env.TELEGRAM_RECEIVE_MODE = 'polling';
  const botId = randomInt(1_000_000, 2_000_000);
  const act = <T>(fn: () => Promise<T>) => tenantStorage.run({ tenantId: user.tenantId, userId: user.id }, fn);
  let batch: any[] = [];
  let polls = 0, deleteCalls = 0;
  const offsets: number[] = [];
  const instances: TelegramPollingService[] = [];
  const receiver = () => { const value = new TelegramPollingService(db, telegram); instances.push(value); return value; };
  const primary = receiver(), standby = receiver();
  const originalProcessor = telegram.processUpdate.bind(telegram);
  global.fetch = async (url, options) => {
    const method = String(url).split('/').pop();
    const payload = JSON.parse(String(options?.body));
    let result: any;
    if (method === 'getMe') result = { id: botId, is_bot: true, username: 'polling_test_bot' };
    else if (method === 'deleteWebhook') { deleteCalls++; assert.equal(payload.drop_pending_updates, false); result = true; }
    else if (method === 'getUpdates') {
      polls++; offsets.push(payload.offset); assert.equal(payload.timeout, 25);
      assert.deepEqual(payload.allowed_updates, ['message', 'my_chat_member']);
      result = batch;
    } else throw new Error(`Unexpected method ${method}`);
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) } as any;
  };
  try {
    const link = await act(() => telegram.link());
    const token = new URL(link.url).searchParams.get('start');
    batch = [{ update_id: 100, message: { chat: { id: 123, type: 'private' }, from: { id: 123 }, text: `/start ${token}` } }];
    await primary.pollOnce();
    assert.equal((await act(() => telegram.me())).connected, true);
    assert.equal((await db.telegramPollingState.findUniqueOrThrow({ where: { botId: String(botId) } })).nextOffset, 101n);
    assert.equal(deleteCalls, 1);
    await standby.pollOnce();
    assert.equal(polls, 1, 'a second receiver must not contact getUpdates');
    assert.equal(deleteCalls, 1, 'a second receiver must not delete webhook');
    const count = await db.telegramDelivery.count({ where: { userId: user.id, kind: 'WELCOME' } });
    await primary.pollOnce();
    assert.equal(offsets.at(-1), 101);
    assert.equal(await db.telegramDelivery.count({ where: { userId: user.id, kind: 'WELCOME' } }), count, 'replayed event must not enqueue twice');
    // Force an error after the business effects, but before the cursor commit.
    batch = [{ update_id: 101, message: { chat: { id: 123, type: 'private' }, text: '/stop' } }];
    telegram.processUpdate = async (update, tx) => { await originalProcessor(update, tx); throw new Error('simulated failure after effects'); };
    await assert.rejects(primary.pollOnce(), /simulated failure/);
    assert.equal((await act(() => telegram.me())).enabled, true, 'business changes must roll back');
    assert.equal((await db.telegramPollingState.findUniqueOrThrow({ where: { botId: String(botId) } })).nextOffset, 101n, 'failed event must remain unconfirmed');
    telegram.processUpdate = originalProcessor;
    await primary.pollOnce();
    assert.equal((await act(() => telegram.me())).enabled, false);
    await act(() => telegram.preferences({ enabled: true, automatic: true }));
    await primary.pollOnce();
    assert.equal((await act(() => telegram.me())).enabled, true, 'old stop must not disable a re-enabled account');
    // A process restart resumes from the stored cursor.
    await primary.onModuleDestroy();
    batch = [];
    await standby.pollOnce();
    assert.equal(offsets.at(-1), 102);
    // Simulate a crash: a different instance takes over only after lease expiry.
    const third = receiver();
    const before = polls;
    await third.pollOnce(); assert.equal(polls, before);
    await db.telegramPollingState.update({ where: { botId: String(botId) }, data: { leaseUntil: new Date(0) } });
    await third.pollOnce(); assert.equal(polls, before + 1); assert.equal(offsets.at(-1), 102);
    console.log('Polling integration: persistent cursor, transactional rollback, replay suppression, exclusive receiver, restart and expired lease recovery passed.');
  } finally {
    telegram.processUpdate = originalProcessor;
    for (const instance of instances) await instance.onModuleDestroy();
    await db.telegramPollingState.deleteMany({ where: { botId: String(botId) } });
    global.fetch = originalFetch;
    if (oldMode === undefined) delete process.env.TELEGRAM_RECEIVE_MODE; else process.env.TELEGRAM_RECEIVE_MODE = oldMode;
  }
}
