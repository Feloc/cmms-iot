import { PUBLIC_API_BASE } from '@/lib/api-url';

const baseFromEnv = (v?: string) => (v ? v.replace(/\/$/, "") : undefined);

const apiBase =
  typeof window === "undefined"
    ? baseFromEnv(process.env.API_INTERNAL_URL) ?? "http://api:3001"
    : PUBLIC_API_BASE;

/**
 * Llama a la API externa (apps/api) y agrega headers de auth y tenant.
 * `path` puede ser "assets" o "/assets".
 */
export async function apiFetch<T>(
  path: string,
  opts: {
    method?: string;
    token?: string;
    tenantSlug?: string;
    body?: any;
  } = {},
): Promise<T> {
  const { method = "GET", token, tenantSlug, body } = opts;
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantSlug ? { "x-tenant": tenantSlug } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('cmms:unauthorized'));
    }
    throw new Error(`API ${method} ${url} -> ${res.status} ${text}`);
  }

  // Si no hay body (204), devuelve undefined
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export { apiBase };
