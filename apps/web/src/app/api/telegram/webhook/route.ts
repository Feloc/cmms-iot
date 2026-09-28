import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Telegram cannot authenticate with NextAuth. Forward only this fixed endpoint;
// the API validates Telegram's secret header before processing the update.
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!secret || secret.length > 256) return Response.json({ ok: false }, { status: 401 });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ ok: false }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 65536) { await reader.cancel(); return Response.json({ ok: false }, { status: 413 }); }
    chunks.push(chunk.value);
  }
  try {
    const base = (process.env.API_INTERNAL_URL || 'http://api:3001').replace(/\/$/, '');
    const response = await fetch(`${base}/telegram/webhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
      body: Buffer.concat(chunks), signal: AbortSignal.timeout(15_000), redirect: 'error', cache: 'no-store',
    });
    return Response.json({ ok: response.ok }, { status: response.status });
  } catch { return Response.json({ ok: false }, { status: 502 }); }
}
