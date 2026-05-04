import { Injectable, Logger } from '@nestjs/common';

type ServiceOrderCommercialNotification = {
  id: string;
  assetCode?: string | null;
  title?: string | null;
  customer?: string | null;
  serialNumber?: string | null;
  previousStatus?: string | null;
  nextStatus: string;
};

const COMMERCIAL_STATUS_LABELS: Record<string, string> = {
  NO_MANAGEMENT: 'No gestion',
  PENDING_QUOTE: 'Pendiente cotizar',
  PENDING_APPROVAL: 'Pendiente aprobacion',
  NOT_APPROVED: 'No aprobado',
  APPROVED: 'Aprobado',
  PROGRAMMED: 'Programado',
  CONFIRMED: 'Confirmado',
  COMPLETED: 'Completado',
};

@Injectable()
export class TelegramNotifierService {
  private readonly logger = new Logger(TelegramNotifierService.name);

  shouldNotifyCommercialStatus(status?: string | null): boolean {
    const normalized = String(status || '').trim().toUpperCase();
    if (!normalized || !this.isConfigured()) return false;

    const configured = String(process.env.TELEGRAM_SERVICE_ORDER_COMMERCIAL_STATUSES || 'APPROVED,PROGRAMMED')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    return configured.includes(normalized);
  }

  async notifyServiceOrderCommercialStatusChange(payload: ServiceOrderCommercialNotification) {
    if (!this.isConfigured()) return;

    const nextLabel = this.commercialStatusLabel(payload.nextStatus);
    const previousLabel = payload.previousStatus ? this.commercialStatusLabel(payload.previousStatus) : 'Sin definir';
    const title = String(payload.title || '').trim();
    const customer = String(payload.customer || '').trim();
    const serial = String(payload.serialNumber || '').trim();

    const lines = [
      `OS con negociacion ${nextLabel}`,
      '',
      `OS: ${payload.id}`,
      payload.assetCode ? `Activo: ${payload.assetCode}` : null,
      title ? `Titulo: ${title}` : null,
      customer ? `Cliente: ${customer}` : null,
      serial ? `Serie: ${serial}` : null,
      `Cambio: ${previousLabel} -> ${nextLabel}`,
    ].filter((line): line is string => line !== null);

    await this.sendMessage(lines.join('\n'));
  }

  private isConfigured() {
    return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID;
  }

  private commercialStatusLabel(status: string) {
    const normalized = String(status || '').trim().toUpperCase();
    return COMMERCIAL_STATUS_LABELS[normalized] || normalized || 'Sin definir';
  }

  private async sendMessage(text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(`Telegram sendMessage failed: ${response.status} ${body}`);
      }
    } catch (error: any) {
      this.logger.warn(`Telegram sendMessage failed: ${error?.message || error}`);
    }
  }
}
