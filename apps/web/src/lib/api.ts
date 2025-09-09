export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function apiFetch(
  path: string,
  token?: string,
  tenant?: string,
  init?: RequestInit
) {
  const url = `${API_URL}${path.startsWith('/') ? path : '/' + path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenant ? { 'x-tenant': tenant } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${msg}`);
  }
  return res.json();
}
