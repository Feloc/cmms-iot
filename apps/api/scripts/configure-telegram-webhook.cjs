// Run explicitly after deployment with the API's environment loaded.
(async () => {
  if ((process.env.TELEGRAM_RECEIVE_MODE || 'webhook').toLowerCase() === 'polling') throw new Error('Desactiva polling antes de configurar el webhook');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const base = process.env.CMMS_PUBLIC_URL;
  if (!token || !secret || !base) throw new Error('Faltan TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET o CMMS_PUBLIC_URL');
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('Usa un secreto aleatorio de 32 a 256 caracteres: letras, números, guion o guion bajo');
  const url = new URL('/api/telegram/webhook', base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('CMMS_PUBLIC_URL debe ser una URL pública HTTPS');
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ url: url.href, secret_token: secret, allowed_updates: ['message', 'my_chat_member'], max_connections: 1 }),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`Telegram rechazó el webhook (${response.status})`);
  console.log(`Webhook registrado: ${url.href}`);
})().catch(() => {
  // fetch errors can contain the token in the URL. Never print the original error.
  console.error('No se pudo registrar el webhook. Revisa las variables requeridas, la URL HTTPS y la conectividad.');
  process.exitCode = 1;
});
