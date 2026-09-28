export function telegramReceiveMode(): 'polling' | 'webhook' | null {
  const mode = (process.env.TELEGRAM_RECEIVE_MODE || 'webhook').trim().toLowerCase();
  return mode === 'polling' || mode === 'webhook' ? mode : null;
}

export function telegramConfigured() {
  const mode = telegramReceiveMode();
  return !!(mode && process.env.TELEGRAM_BOT_TOKEN?.trim() &&
    /^[A-Za-z0-9_]+$/.test((process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '')) &&
    (mode === 'polling' || process.env.TELEGRAM_WEBHOOK_SECRET?.trim()));
}
