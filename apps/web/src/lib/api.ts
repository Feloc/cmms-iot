const baseFromEnv = (v?: string) => (v ? v.replace(/\/$/, "") : undefined);

const apiBase =
  typeof window === "undefined"
    ? baseFromEnv(process.env.API_INTERNAL_URL) ?? "http://api:3001"
    : baseFromEnv(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:3001";

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
    throw new Error(`API ${method} ${url} -> ${res.status} ${text}`);
  }

  // Si no hay body (204), devuelve undefined
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

export { apiBase };
