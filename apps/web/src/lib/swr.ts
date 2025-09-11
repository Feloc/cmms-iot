'use client';

import useSWR from 'swr';
import { apiFetch } from '@/lib/api';

/**
 * Hook SWR para consumir la API con token + tenant.
 * Llama siempre a useSWR; si falta info, usa `null` para pausar el fetch.
 */
export function useApiSWR<T>(
  path: string | null,
  token?: string,
  tenantSlug?: string
) {
  const key = path && token && tenantSlug ? [path, token, tenantSlug] as const : null;
  return useSWR<T>(key, ([p, t, s]) => apiFetch<T>(p, { token: t, tenantSlug: s }));
}
