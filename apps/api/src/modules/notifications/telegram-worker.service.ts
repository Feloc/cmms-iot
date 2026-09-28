import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TelegramDelivery } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TelegramWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramWorkerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_WORKER_ENABLED === 'false') return;
    this.timer = setInterval(() => { void this.tick(); }, 1200);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running || !process.env.TELEGRAM_BOT_TOKEN) return;
    this.running = true;
    try {
      const job = await this.claim();
      if (job) await this.deliver(job);
    } catch {
      // Do not log network errors that may embed the bot token in the URL.
      this.logger.warn('No se pudo procesar la cola de Telegram; se reintentará');
    } finally { this.running = false; }
  }

  private async claim() {
    return this.prisma.$transaction(async tx => {
      // Serialize claims across API replicas, without holding a DB transaction during HTTP.
      const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(742003353) AS locked`;
      if (!lock.locked) return null;
      const now = new Date();
      const job = await tx.telegramDelivery.findFirst({
        where: { OR: [ { status: 'PENDING', availableAt: { lte: now } }, { status: 'SENDING', leaseUntil: { lt: now } } ] },
        orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      });
      if (!job) return null;
      if (job.attempts >= 5) {
        await tx.telegramDelivery.update({ where: { id: job.id }, data: { status: 'FAILED', error: 'Se agotaron los reintentos' } });
        return null;
      }
      const busy = await tx.telegramDelivery.findFirst({ where: {
        id: { not: job.id }, chatId: job.chatId,
        OR: [ { status: 'SENDING', leaseUntil: { gt: now } }, { status: 'SENT', sentAt: { gt: new Date(now.getTime() - 1200) } } ],
      }, select: { id: true } });
      if (busy) {
        await tx.telegramDelivery.update({ where: { id: job.id }, data: { status: 'PENDING', availableAt: new Date(now.getTime() + 1500), leaseId: null, leaseUntil: null } });
        return null;
      }
      return tx.telegramDelivery.update({ where: { id: job.id }, data: {
        status: 'SENDING', attempts: { increment: 1 }, leaseId: randomUUID(), leaseUntil: new Date(now.getTime() + 60_000),
      } });
    });
  }

  private async finish(job: TelegramDelivery, data: Parameters<PrismaService['telegramDelivery']['updateMany']>[0]['data']) {
    await this.prisma.telegramDelivery.updateMany({
      where: { id: job.id, status: 'SENDING', leaseId: job.leaseId },
      data: { ...data, leaseId: null, leaseUntil: null },
    });
  }

  async deliver(job: TelegramDelivery) {
    const connection = await this.prisma.telegramConnection.findFirst({ where: {
      tenantId: job.tenantId, userId: job.userId, chatId: job.chatId, linkedAt: job.linkedAt,
      enabled: true, ...(job.kind === 'SCHEDULE' ? { automatic: true } : {}), user: { tenantId: job.tenantId },
    } });
    if (!connection) return this.finish(job, { status: 'CANCELED', error: 'Cuenta desconectada o avisos desactivados' });
    if (job.kind === 'SCHEDULE') {
      const assigned = job.workOrderId && await this.prisma.wOAssignment.findFirst({ where: {
        tenantId: job.tenantId, workOrderId: job.workOrderId, userId: job.userId, role: 'TECHNICIAN', state: 'ACTIVE',
        workOrder: { tenantId: job.tenantId, kind: 'SERVICE_ORDER', status: { not: 'CANCELED' } },
      }, select: { id: true } });
      if (!assigned) return this.finish(job, { status: 'CANCELED', error: 'La asignación ya no está vigente' });
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ chat_id: job.chatId, text: job.text, link_preview_options: { is_disabled: true } }),
      });
      const body: any = await response.json().catch(() => null);
      if (response.ok && body?.ok === true) {
        await this.finish(job, { status: 'SENT', sentAt: new Date(), messageId: String(body.result.message_id), error: null });
        return;
      }
      const code = typeof body?.error_code === 'number' ? body.error_code : response.status;
      if (code === 403) {
        await this.prisma.telegramConnection.updateMany({ where: { id: connection.id, chatId: job.chatId, linkedAt: job.linkedAt }, data: { enabled: false } });
      }
      const transient = code === 429 || code >= 500;
      const retryAfter = Number(body?.parameters?.retry_after);
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(300_000, 2000 * 2 ** job.attempts);
      await this.finish(job, {
        status: transient && job.attempts < 5 ? 'PENDING' : 'FAILED',
        availableAt: new Date(Date.now() + delay), error: code === 403 ? 'El destinatario bloqueó el bot o denegó el acceso' : `Telegram respondió con error ${code}`,
      });
    } catch {
      await this.finish(job, { status: job.attempts < 5 ? 'PENDING' : 'FAILED',
        availableAt: new Date(Date.now() + 2000 * 2 ** job.attempts), error: 'No se pudo confirmar el envío; error de red o tiempo de espera' });
    }
  }
}
