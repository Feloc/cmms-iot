'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { apiFetch } from '../../lib/api';
import { getAuthFromSession } from '../../lib/auth';

type Asset = {
  id: string; code: string; name: string; type?: string; location?: string;
  createdAt: string; updatedAt: string;
};

export default function AssetsPage() {
  const { data: session, status } = useSession();
  const { token, tenant } = getAuthFromSession(session);

  const canFetch = !!token && !!tenant;
  const { data, error, mutate, isLoading } = useSWR<Asset[]>(
    canFetch ? ['/assets', token, tenant] : null,
    ([path, t, ten]) => apiFetch(path as string, t as string, ten as string),
    { revalidateOnFocus: true }
  );

  async function del(id: string) {
    if (!confirm('¿Eliminar asset?')) return;
    await apiFetch(`/assets/${id}`, token!, tenant!, { method: 'DELETE' });
    mutate();
  }

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <Link href="/assets/new" className="rounded-xl px-3 py-2 border">Nuevo</Link>
      </div>

      {status === 'loading' && <div>Cargando sesión…</div>}

      {!canFetch && status !== 'loading' && (
        <div className="text-amber-600 text-sm">
          No hay credenciales disponibles. Inicia sesión o define NEXT_PUBLIC_STATIC_TOKEN para desarrollo.
        </div>
      )}

      {isLoading && canFetch && <div>Cargando…</div>}
      {error && canFetch && <div className="text-red-500 text-sm">Error cargando assets</div>}
      {canFetch && data && data.length === 0 && <div>No hay assets</div>}

      {canFetch && !!data?.length && (
        <table className="w-full border rounded overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Código</th>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Tipo</th>
              <th className="p-2 text-left">Ubicación</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.code}</td>
                <td className="p-2">{a.name}</td>
                <td className="p-2">{a.type ?? '—'}</td>
                <td className="p-2">{a.location ?? '—'}</td>
                <td className="p-2 text-right space-x-2">
                  <Link href={`/assets/${a.id}/edit`} className="px-2 py-1 border rounded">Editar</Link>
                  <button onClick={() => del(a.id)} className="px-2 py-1 border rounded">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
