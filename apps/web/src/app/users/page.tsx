'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

type UserRow = { id: string; name: string; email: string; role: 'ADMIN' | 'TECH' | 'VIEWER' | string; createdAt?: string };
type Paginated<T> = { items: T[]; total: number; page: number; size: number };

const ROLE_OPTIONS = [
  { value: '', label: 'Todos los roles' },
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'TECH', label: 'TECH' },
  { value: 'VIEWER', label: 'VIEWER' },
];

export default function UsersPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const path = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('size', '50');
    if (q.trim()) qs.set('q', q.trim());
    if (role) qs.set('role', role);
    return `/admin/users?${qs.toString()}`;
  }, [q, role, page]);

  const { data, error, isLoading, mutate } = useApiSWR<Paginated<UserRow>>(
    auth.token && auth.tenantSlug ? path : null,
    auth.token,
    auth.tenantSlug
  );

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Usuarios</h1>
          <div className="text-sm text-gray-600">Crear usuarios para tu tenant.</div>
        </div>
        <Link className="px-3 py-2 border rounded" href="/users/new">
          + Nuevo usuario
        </Link>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          className="border rounded px-3 py-2 text-sm w-[320px]"
          placeholder="Buscar por nombre o email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="border rounded px-3 py-2 text-sm"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button className="px-3 py-2 border rounded text-sm" onClick={() => mutate()}>
          Actualizar
        </button>
      </div>

      {isLoading ? <div className="text-sm text-gray-600">Cargando…</div> : null}
      {error ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{(error as any).message}</div> : null}

      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_160px] bg-gray-50 text-sm font-medium px-3 py-2">
          <div>Nombre</div>
          <div>Email</div>
          <div>Rol</div>
        </div>

        {(data?.items ?? []).map((u) => (
          <div key={u.id} className="grid grid-cols-[1fr_1fr_160px] px-3 py-2 border-t text-sm">
            <div className="font-medium">{u.name}</div>
            <div className="text-gray-700">{u.email}</div>
            <div className="text-gray-700">{u.role}</div>
          </div>
        ))}

        {(data?.items ?? []).length === 0 && !isLoading ? <div className="px-3 py-6 text-sm text-gray-600">No hay usuarios.</div> : null}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Total: {data?.total ?? 0}</div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 border rounded text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
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
