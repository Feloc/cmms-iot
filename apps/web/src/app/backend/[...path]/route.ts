import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const apiTarget = () => (process.env.API_INTERNAL_URL || 'http://api:3001').replace(/\/$/, '');

async function proxy(request: NextRequest, context: { params: { path?: string[] } }) {
  const sessionToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const accessToken = typeof sessionToken?.accessToken === 'string' ? sessionToken.accessToken : '';
  if (!accessToken) {
    return Response.json({ statusCode: 401, message: 'Sesión requerida' }, { status: 401 });
  }

  const path = (context.params.path || []).map(encodeURIComponent).join('/');
  const target = new URL(`${apiTarget()}/${path}`);
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of ['authorization', 'cookie', 'host', 'content-length', 'connection']) headers.delete(name);
  headers.set('authorization', `Bearer ${accessToken}`);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch {
    return Response.json({ statusCode: 502, message: 'API no disponible' }, { status: 502 });
  }

  const responseHeaders = new Headers(upstream.headers);
  // fetch puede descomprimir la respuesta; evita longitudes/codificaciones obsoletas.
  for (const name of ['connection', 'content-encoding', 'content-length', 'transfer-encoding']) {
    responseHeaders.delete(name);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
