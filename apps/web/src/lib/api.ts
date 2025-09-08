// apps/web/src/lib/api.ts
export function sessionParts(session: any) {
  const token =
    (session as any)?.accessToken ??
    (session as any)?.user?.token ??
    (session as any)?.token ??
    null;

  const tenant =
    (session as any)?.user?.tenant?.slug ??
    (session as any)?.tenant?.slug ??
    (session as any)?.tenant ??
    null;

  return { token, tenant };
}

export async function apiFetch(
  path: string,
  opts: { token?: string; tenant?: string } = {},
) {
  const base =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') ||
    'http://localhost:3001';
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.tenant ? { 'x-tenant': opts.tenant } : {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText} – ${body}`);
  }
  return res.json();
}
