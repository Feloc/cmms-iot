'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";
import { getAuthFromSession } from "@/lib/auth";
import { useApiSWR } from "@/lib/swr";
import { apiFetch } from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from "react";

type Notice = {
  id: string;
  title: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  assetCode?: string | null;
  source?: string | null;
  createdAt?: string;
};

export default function NoticesPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const router = useRouter();
  const sp = useSearchParams();

  // Construir querystring (server-side filtering)
  const qs = useMemo(() => {
    const q = new URLSearchParams();
    const qs_q = sp.get('q');
    const qs_status = sp.get('status');
    const qs_asset = sp.get('assetCode');
    if (qs_q) q.set('q', qs_q);
    if (qs_status) q.set('status', qs_status);
    if (qs_asset) q.set('assetCode', qs_asset);
    return q.toString();
  }, [sp]);

  const path = useMemo(() => `/notices${qs ? `?${qs}` : ''}`, [qs]);

  const { data, error, isLoading, mutate } = useApiSWR<Notice[]>(
    token && tenantSlug ? path : null,
    token,
    tenantSlug
  );

  const createWO = async (noticeId: string) => {
    const wo = await apiFetch<{ id: string }>(`/notices/${noticeId}/work-orders`, {
      method: 'POST',
      token,
      tenantSlug,
      body: {}, // opcional: { priority, dueDate, ... }
    });
    // refresca la lista por si cambió el status del notice
    mutate();
    router.push(`/work-orders/${wo.id}`);
  };

  if (!token || !tenantSlug) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Notices</h1>
        <p className="text-sm text-gray-500">No hay credenciales. Inicia sesión.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {(error as any).message}</div>;

  const notices = data?.items ?? [];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notices</h1>
        <Link href="/notices/new" className="px-3 py-2 rounded bg-black text-white text-sm">
          Nuevo
        </Link>
      </div>

      {/* Filtros */}
      <form
        className="flex flex-wrap gap-2"
        action={(formData) => {
          const q = formData.get('q')?.toString() ?? '';
          const status = formData.get('status')?.toString() ?? '';
          const assetCode = formData.get('assetCode')?.toString() ?? '';
          const next = new URLSearchParams();
          if (q) next.set('q', q);
          if (status) next.set('status', status);
          if (assetCode) next.set('assetCode', assetCode);
          router.push(`/notices${next.toString() ? `?${next.toString()}` : ''}`);
        }}
      >
        <input
          name="q"
          placeholder="Buscar..."
          className="border rounded px-3 py-2"
          defaultValue={sp.get('q') ?? ''}
        />
        <select
          name="status"
          className="border rounded px-3 py-2"
          defaultValue={sp.get('status') ?? ''}
        >
          <option value="">Todos</option>
          <option value="OPEN">OPEN</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
        <input
          name="assetCode"
          placeholder="Asset code"
          className="border rounded px-3 py-2"
          defaultValue={sp.get('assetCode') ?? ''}
        />
        <button className="px-3 py-2 rounded border">Filtrar</button>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Título</th>
            <th className="py-2">Asset</th>
            <th className="py-2">Estado</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {notices.map(n => (
            <tr key={n.id} className="border-b">
              <td className="py-2">
                <Link className="underline" href={`/notices/${n.id}`}>{n.title}</Link>
              </td>
              <td className="py-2">{n.assetCode ?? '—'}</td>
              <td className="py-2">{n.status}</td>
              <td className="py-2">
                <button
                  onClick={() => createWO(n.id)}
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  // Deshabilita si ya está RESOLVED (o si prefieres cuando no esté OPEN)
                  disabled={n.status === 'RESOLVED'}
                >
                  Crear OT
                </button>
              </td>
            </tr>
          ))}
          {notices.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">Sin avisos</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
