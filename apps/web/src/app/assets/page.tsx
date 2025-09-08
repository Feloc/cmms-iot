'use client';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { apiFetch, sessionParts } from '@/lib/api';

type Asset = { id: string; code: string; name: string; type?: string; location?: string };

export default function AssetsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.token;
  const tenant = (session as any)?.tenant?.slug || 'acme';

  const { data, error, isLoading, mutate } = useSWR<Asset[]>(
    token ? ['/assets', token, tenant] : null,
    () => apiFetch<Asset[]>('/assets', { token, tenant })
  );

  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <a className="px-3 py-2 rounded bg-blue-600 text-white" href="/assets/new">+ Nuevo</a>
      </div>

      {isLoading && <p>Cargando…</p>}
      {error && <p className="text-red-600">Error: {String(error.message)}</p>}

      <table className="w-full text-left border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Code</th>
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Location</th>
          </tr>
        </thead>
        <tbody>
          {(data || []).map(a => (
            <tr key={a.id} className="border-t">
              <td className="p-2">{a.code}</td>
              <td className="p-2">{a.name}</td>
              <td className="p-2">{a.type || '-'}</td>
              <td className="p-2">{a.location || '-'}</td>
            </tr>
          ))}
          {!isLoading && !error && (!data || data.length === 0) && (
            <tr><td className="p-4 text-gray-500" colSpan={4}>Sin activos</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
