import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma.service';
import { TelegramService } from './telegram.service';
import { telegramReceiveMode } from './telegram.config';

class PollingError extends Error {
  constructor(readonly code: number, readonly retryAfter = 0) {
    super(`Telegram respondió con error ${code}`);
  }
}
type Cursor = { botId: string; nextOffset: bigint };

@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private readonly owner = randomUUID();
  private readonly abort = new AbortController();
  private botId?: string;
  private webhookRemoved = false;
  private stopped = false;
  private failures = 0;
  private timer?: NodeJS.Timeout;
  private active?: Promise<void>;

  constructor(private readonly prisma: PrismaService, private readonly telegram: TelegramService) {}

  onModuleInit() {
    if (telegramReceiveMode() !== 'polling' || !process.env.TELEGRAM_BOT_TOKEN) return;
    this.schedule(0);
  }

  private schedule(delay: number) {
    this.timer = setTimeout(() => {
      this.active = this.cycle().then(next => { if (!this.stopped) this.schedule(next); });
    }, delay);
    this.timer.unref();
  }

  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.abort.abort();
    await this.active;
    if (this.botId) {
      await this.prisma.telegramPollingState.updateMany({
        where: { botId: this.botId, leaseOwner: this.owner }, data: { leaseOwner: null, leaseUntil: null },
      }).catch(() => {}); // A crashed process is also recovered by lease expiry.
    }
  }

  private async request(method: string, data: Record<string, unknown> = {}) {
    // Never log the URL or the raw fetch error: both can contain the bot token.
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(35_000)]),
      body: JSON.stringify(data),
    });
    const body: any = await response.json();
    if (!response.ok || body?.ok !== true) {
      const retry = Number(body?.parameters?.retry_after);
      throw new PollingError(Number(body?.error_code) || response.status, Number.isFinite(retry) && retry > 0 ? retry : 0);
    }
    return body.result;
  }

  private async cycle(): Promise<number> {
    try {
      const delay = await this.pollOnce();
      this.failures = 0;
      return delay;
    } catch (error) {
      if (this.stopped) return 0;
      this.failures++;
      const message = error instanceof PollingError
        ? (error.code === 409 ? 'Hay otro receptor o webhook activo para este bot (409)' : error.message)
        : 'No se pudo recibir Telegram; se reintentará';
      this.logger.warn(message);
      if (this.botId) await this.prisma.telegramPollingState.updateMany({
        where: { botId: this.botId, leaseOwner: this.owner }, data: { lastError: message },
      }).catch(() => {});
      return Math.min(2_147_000_000, Math.max(
        Math.min(60_000, 2000 * 2 ** Math.min(this.failures, 5)),
        error instanceof PollingError ? error.retryAfter * 1000 : 0,
        error instanceof PollingError && [401, 409].includes(error.code) ? 60_000 : 0,
      ));
    }
  }

  // One bounded request. Exposed separately for integration tests with simulated HTTP.
  async pollOnce(): Promise<number> {
    if (this.stopped || telegramReceiveMode() !== 'polling') return 5000;
    if (!this.botId) {
      const bot = await this.request('getMe');
      if (!Number.isSafeInteger(bot?.id) || bot.id <= 0 || bot.is_bot !== true || !/^[A-Za-z0-9_]+$/.test(bot.username || '')) {
        throw new Error('Identidad del bot inválida');
      }
      this.botId = String(bot.id);
      // Resolve the name from the token; local installations need no additional credentials.
      process.env.TELEGRAM_BOT_USERNAME = bot.username;
    }
    // Database time and a conditional UPSERT prevent two replicas from owning the receiver.
    // No transaction/connection remains open while waiting for Telegram.
    const rows = await this.prisma.$queryRaw<Cursor[]>`
      INSERT INTO "TelegramPollingState" ("botId", "leaseOwner", "leaseUntil")
      VALUES (${this.botId}, ${this.owner}, (clock_timestamp() AT TIME ZONE 'UTC') + interval '90 seconds')
      ON CONFLICT ("botId") DO UPDATE
      SET "leaseOwner" = EXCLUDED."leaseOwner", "leaseUntil" = EXCLUDED."leaseUntil"
      WHERE "TelegramPollingState"."leaseOwner" = ${this.owner}
         OR "TelegramPollingState"."leaseUntil" IS NULL
         OR "TelegramPollingState"."leaseUntil" < (clock_timestamp() AT TIME ZONE 'UTC')
      RETURNING "botId", "nextOffset"`;
    const state = rows[0];
    if (!state) return 5000;
    if (!this.webhookRemoved) {
      await this.request('deleteWebhook', { drop_pending_updates: false });
      this.webhookRemoved = true;
      this.logger.log('Recepción local de Telegram activada (long polling)');
    }
    const updates = await this.request('getUpdates', {
      offset: Number(state.nextOffset), timeout: 25, limit: 100,
      allowed_updates: ['message', 'my_chat_member'],
    });
    if (!Array.isArray(updates) || updates.some(u => !Number.isSafeInteger(u?.update_id) || u.update_id < 0)) {
      throw new Error('Respuesta de Telegram inválida');
    }
    for (const update of updates.sort((a, b) => a.update_id - b.update_id)) {
      if (this.stopped) break;
      await this.prisma.$transaction(async tx => {
        // This conditional update also locks the cursor row until the effects commit.
        const held = await tx.$queryRaw<Cursor[]>`
          UPDATE "TelegramPollingState"
          SET "leaseUntil" = (clock_timestamp() AT TIME ZONE 'UTC') + interval '90 seconds'
          WHERE "botId" = ${this.botId!} AND "leaseOwner" = ${this.owner}
            AND "leaseUntil" > (clock_timestamp() AT TIME ZONE 'UTC')
          RETURNING "botId", "nextOffset"`;
        if (!held[0]) throw new Error('Se perdió la recepción del bot');
        if (BigInt(update.update_id) < held[0].nextOffset) return;
        await this.telegram.processUpdate(update, tx);
        await tx.telegramPollingState.update({ where: { botId: this.botId }, data: {
          nextOffset: BigInt(update.update_id) + 1n, lastPollAt: new Date(), lastError: null,
        } });
      }, { timeout: 15_000 });
    }
    await this.prisma.telegramPollingState.updateMany({
      where: { botId: this.botId, leaseOwner: this.owner }, data: { lastPollAt: new Date(), lastError: null },
    });
    return updates.length ? 100 : 1000;
  }
}
