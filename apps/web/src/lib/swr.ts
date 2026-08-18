'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { apiFetch } from '@/lib/api';

/**
 * Hook SWR para consumir la API con token + tenant.
 * Llama siempre a useSWR; si falta info, usa `null` para pausar el fetch.
 */
export function useApiSWR<T>(
  path: string | null,
  token?: string,
  tenantSlug?: string,
  config?: SWRConfiguration<T>,
) {
  type ApiKey = readonly [string, string, string];

  const key: ApiKey | null =
    path && token && tenantSlug ? ([path, token, tenantSlug] as const) : null;

  const fetcher = (args: readonly unknown[]) => {
    const [p, t, s] = args as ApiKey;
    return apiFetch<T>(p, { token: t, tenantSlug: s });
  };

  return useSWR<T>(key, fetcher, config);
}
