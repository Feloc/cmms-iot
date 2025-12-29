'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

type Tenant = { id: string; slug: string; name: string; createdAt?: string };

type Paginated<T> = { items: T[]; total: number; page: number; size: number };

export default function TenantsPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const path = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('size', '50');
    if (q.trim()) qs.set('q', q.trim());
    return `/tenants?${qs.toString()}`;
  }, [q, page]);

  const { data, error, isLoading, mutate } = useApiSWR<Paginated<Tenant>>(auth.token && auth.tenantSlug ? path : null, auth.token, auth.tenantSlug);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Tenants</h1>
          <div className="text-sm text-gray-600">Crear y administrar tenants (multi-tenant).</div>
        </div>
        <Link className="px-3 py-2 border rounded" href="/tenants/new">
          + Nuevo tenant
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="border rounded px-3 py-2 text-sm w-[320px]"
          placeholder="Buscar por nombre o slug…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <button className="px-3 py-2 border rounded text-sm" onClick={() => mutate()}>
          Actualizar
        </button>
      </div>

      {isLoading ? <div className="text-sm text-gray-600">Cargando…</div> : null}
      {error ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{(error as any).message}</div> : null}

      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-[1fr_260px] bg-gray-50 text-sm font-medium px-3 py-2">
          <div>Tenant</div>
          <div>Slug</div>
        </div>

        {(data?.items ?? []).map((t) => (
          <div key={t.id} className="grid grid-cols-[1fr_260px] px-3 py-2 border-t text-sm">
            <div className="font-medium">{t.name}</div>
            <div className="text-gray-700">{t.slug}</div>
          </div>
        ))}

        {(data?.items ?? []).length === 0 && !isLoading ? (
          <div className="px-3 py-6 text-sm text-gray-600">No hay tenants.</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Total: {data?.total ?? 0}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 border rounded text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </button>
          <div className="text-sm">Página {page}</div>
          <button
            className="px-3 py-2 border rounded text-sm disabled:opacity-50"
            disabled={(data?.items?.length ?? 0) < 50}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
