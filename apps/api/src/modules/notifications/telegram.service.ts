import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { telegramConfigured, telegramReceiveMode } from './telegram.config';
import { TelegramMessageDto, TelegramPreferencesDto } from './telegram.dto';

export function renderTelegramText(template: string, name: string) {
  const text = template.replace(/\{nombre\}/g, () => name).trim();
  if (!text || text.length > 4096) throw new BadRequestException('El mensaje debe tener entre 1 y 4096 caracteres después de personalizarlo');
  return text;
}

export function verifyTelegramSecret(received?: string) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received || received.length > 256) throw new UnauthorizedException('Webhook no autorizado');
  const a = Buffer.from(expected), b = Buffer.from(received);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Webhook no autorizado');
}

@Injectable()
export class TelegramService {
  constructor(private readonly prisma: PrismaService) {}

  private context() {
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new UnauthorizedException();
    return { tenantId, userId };
  }

  private configured() {
    return telegramConfigured();
  }

  async me() {
    const where = this.context();
    const connection = await this.prisma.telegramConnection.findFirst({
      where,
      select: { username: true, enabled: true, automatic: true, linkedAt: true },
    });
    return { receiveMode: telegramReceiveMode(), configured: this.configured(), connected: !!connection?.linkedAt, ...connection };
  }

  async link() {
    if (!this.configured()) throw new ServiceUnavailableException('Telegram todavía no está configurado');
    const { tenantId, userId } = this.context();
    const token = randomBytes(32).toString('base64url');
    const linkTokenHash = createHash('sha256').update(token).digest('hex');
    const linkExpiresAt = new Date(Date.now() + 10 * 60_000);
    await this.prisma.telegramConnection.upsert({
      where: { userId },
      create: { tenantId, userId, linkTokenHash, linkExpiresAt },
      update: { linkTokenHash, linkExpiresAt },
    });
    const bot = process.env.TELEGRAM_BOT_USERNAME!.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]+$/.test(bot)) throw new ServiceUnavailableException('Nombre del bot inválido');
    return { url: `https://t.me/${bot}?start=${token}`, expiresAt: linkExpiresAt };
  }

  async preferences(dto: TelegramPreferencesDto) {
    const where = this.context();
    await this.prisma.$transaction(async tx => {
      const changed = await tx.telegramConnection.updateMany({
        where: { ...where, linkedAt: { not: null } }, data: { enabled: dto.enabled, automatic: dto.automatic },
      });
      if (!changed.count) throw new BadRequestException('Conecta Telegram primero');
      // Canceled deliveries never resume when preferences are enabled again.
      if (!dto.enabled || !dto.automatic) {
        await tx.telegramDelivery.updateMany({
          where: { ...where, status: 'PENDING', ...(dto.enabled ? { kind: 'SCHEDULE' } : {}) },
          data: { status: 'CANCELED', error: 'Preferencias del destinatario' },
        });
      }
    });
    return this.me();
  }

  async disconnect() {
    const where = this.context();
    await this.prisma.$transaction(async tx => {
      await tx.telegramConnection.updateMany({ where, data: {
        chatId: null, telegramUserId: null, username: null, enabled: false,
        linkedAt: null, linkTokenHash: null, linkExpiresAt: null,
      } });
      await tx.telegramDelivery.updateMany({ where: { ...where, status: 'PENDING' }, data: { status: 'CANCELED', error: 'Cuenta desconectada' } });
    });
    return { ok: true };
  }

  async recipients() {
    const { tenantId } = this.context();
    return this.prisma.user.findMany({
      where: { tenantId, telegramConnection: { is: { tenantId, enabled: true, linkedAt: { not: null }, chatId: { not: null } } } },
      select: { id: true, name: true, role: true }, orderBy: { name: 'asc' },
    });
  }

  async manual(dto: TelegramMessageDto) {
    if (!process.env.TELEGRAM_BOT_TOKEN) throw new ServiceUnavailableException('Telegram no está configurado');
    const { tenantId, userId: actorUserId } = this.context();
    return this.prisma.$transaction(async tx => {
      const recipients = await tx.telegramConnection.findMany({
        where: { tenantId, userId: { in: dto.userIds }, enabled: true, linkedAt: { not: null }, chatId: { not: null }, user: { tenantId } },
        include: { user: { select: { name: true } } },
      });
      if (recipients.length !== dto.userIds.length) throw new BadRequestException('Algún destinatario no está disponible en esta empresa. Actualiza la lista.');
      const result = await tx.telegramDelivery.createMany({
        data: recipients.map(r => ({
          tenantId, userId: r.userId, chatId: r.chatId!, linkedAt: r.linkedAt!,
          eventKey: `manual:${actorUserId}:${dto.requestId}`, actorUserId, kind: 'MANUAL',
          text: renderTelegramText(dto.text, r.user.name),
        })), skipDuplicates: true,
      });
      return { queued: result.count, alreadyQueued: recipients.length - result.count };
    });
  }

  async history(admin: boolean) {
    const { tenantId, userId } = this.context();
    return this.prisma.telegramDelivery.findMany({
      where: { tenantId, ...(admin ? {} : { userId }) }, take: 50, orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, text: true, status: true, error: true, attempts: true, createdAt: true, sentAt: true, user: { select: { name: true } } },
    });
  }

  // Called inside the business transaction: a rollback also removes the notification.
  async queueSchedule(tx: Prisma.TransactionClient, tenantId: string, userId: string, order: { id: string; assetCode?: string | null; dueDate?: Date | null }, actorUserId: string) {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    const recipient = await tx.telegramConnection.findFirst({
      where: { tenantId, userId, enabled: true, automatic: true, linkedAt: { not: null }, user: { tenantId } },
      include: { user: { select: { name: true } } },
    });
    if (!recipient?.chatId || !recipient.linkedAt) return;
    const date = order.dueDate ? new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.TELEGRAM_TIME_ZONE || 'America/Bogota',
    }).format(order.dueDate) : 'Sin fecha';
    const base = process.env.CMMS_PUBLIC_URL?.replace(/\/$/, '');
    const text = [
      `Hola, ${recipient.user.name}. Se actualizó tu asignación o programación.`,
      `OS: ${order.id}`, order.assetCode ? `Activo: ${order.assetCode}` : '', `Programación: ${date}`,
      base ? `${base}/service-orders/${encodeURIComponent(order.id)}` : '',
    ].filter(Boolean).join('\n');
    // Avoid delivering an obsolete date after a newer schedule was committed.
    await tx.telegramDelivery.updateMany({
      where: { tenantId, userId, workOrderId: order.id, kind: 'SCHEDULE', status: 'PENDING' },
      data: { status: 'CANCELED', error: 'Sustituido por una programación más reciente' },
    });
    await tx.telegramDelivery.create({ data: {
      tenantId, userId, actorUserId, chatId: recipient.chatId, linkedAt: recipient.linkedAt,
      eventKey: `schedule:${randomUUID()}`, kind: 'SCHEDULE', workOrderId: order.id, text: renderTelegramText(text, recipient.user.name),
    } });
  }

  async webhook(update: any) {
    try {
      return await this.prisma.$transaction(tx => this.processUpdate(update, tx));
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      return { ok: true };
    }
  }

  // The polling receiver commits these effects and its cursor in the same transaction.
  async processUpdate(update: any, tx: Prisma.TransactionClient) {
    const message = update?.message;
    const membership = update?.my_chat_member;
    const chat = message?.chat || membership?.chat;
    if (chat?.type !== 'private' || !Number.isSafeInteger(chat.id) || chat.id <= 0) return { ok: true };
    const chatId = String(chat.id);
    const command = typeof message?.text === 'string' ? message.text.trim() : '';
    if (/^\/stop(?:@\w+)?$/.test(command) || membership?.new_chat_member?.status === 'kicked') {
      await tx.telegramConnection.updateMany({ where: { chatId }, data: { enabled: false, linkTokenHash: null, linkExpiresAt: null } });
      await tx.telegramDelivery.updateMany({ where: { chatId, status: 'PENDING' }, data: { status: 'CANCELED', error: 'Bot detenido por el destinatario' } });
      return { ok: true };
    }
    const match = /^\/start(?:@\w+)? ([A-Za-z0-9_-]{43})$/.exec(command);
    if (!match || message?.from?.id !== chat.id || message?.from?.is_bot) return { ok: true };
    const hash = createHash('sha256').update(match[1]).digest('hex');
    const row = await tx.telegramConnection.findFirst({ where: { linkTokenHash: hash, linkExpiresAt: { gt: new Date() } } });
    if (!row) return { ok: true };
    // A different account in the same tenant may already own this identity.
    // Treat this as a handled update, so polling does not retry it forever.
    const owner = await tx.telegramConnection.findFirst({ where: {
      tenantId: row.tenantId, telegramUserId: String(message.from.id), id: { not: row.id },
    }, select: { id: true } });
    if (owner) return { ok: true };
    const linkedAt = new Date();
    const changed = await tx.telegramConnection.updateMany({
      where: { id: row.id, linkTokenHash: hash, linkExpiresAt: { gt: linkedAt } },
      data: { chatId, telegramUserId: String(message.from.id), username: typeof message.from.username === 'string' ? message.from.username.slice(0, 64) : null,
        linkedAt, enabled: true, linkTokenHash: null, linkExpiresAt: null },
    });
    if (!changed.count) return { ok: true };
    await tx.telegramDelivery.create({ data: {
      tenantId: row.tenantId, userId: row.userId, chatId, linkedAt, eventKey: `welcome:${hash}`, kind: 'WELCOME',
      text: 'Telegram conectado al CMMS. Puedes gestionar tus avisos en la sección Telegram. Envía /stop para detener los mensajes de este bot.',
    } });
    return { ok: true };
  }
}
