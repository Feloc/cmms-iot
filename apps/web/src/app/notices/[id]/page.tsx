'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Notice = {
  id: string;
  title: string;
  body?: string | null;
  assetCode?: string | null;
  category?: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt?: string;
};

export default function NoticeDetailPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const { data: notice, error, isLoading, mutate } = useApiSWR<Notice>(
    token && tenantSlug && params?.id ? `/notices/${params.id}` : null,
    token,
    tenantSlug
  );

  const createWO = async () => {
    if (!notice) return;
    try {
      setCreating(true);
      const wo = await apiFetch<{ id: string }>(`/notices/${notice.id}/work-orders`, {
        method: 'POST',
        token,
        tenantSlug,
        body: {}, // opcional: { title, description, priority, dueDate }
      });
      mutate();
      router.push(`/work-orders/${wo.id}`);
    } finally { setCreating(false); }
  };

  if (!token || !tenantSlug) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Notice</h1>
        <p className="text-sm text-gray-500">No hay credenciales. Inicia sesión.</p>
      </div>
    );
  }

  if (isLoading) return <div className="p-6">Cargando…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {String(error)}</div>;
  if (!notice) return <div className="p-6">No encontrado</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{notice.title}</h1>
        <div className="flex gap-2">
          <Link href={`/notices/${notice.id}/edit`} className="px-3 py-2 border rounded">
            Editar
          </Link>
        </div>
      </div>

      <div className="text-sm text-gray-500 flex flex-wrap gap-3">
        <span><span className="font-medium">Asset:</span> {notice.assetCode ?? '—'}</span>
        <span><span className="font-medium">Categoría:</span> {notice.category ?? '—'}</span>
        <span><span className="font-medium">Estado:</span> {notice.status}</span>
        {notice.createdAt && (
          <span><span className="font-medium">Creado:</span> {new Date(notice.createdAt).toLocaleString()}</span>
        )}
      </div>

      {notice.body && <p className="text-sm whitespace-pre-wrap">{notice.body}</p>}

      <button
        onClick={createWO}
        disabled={creating || notice.status === 'RESOLVED'}
        className="px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
      >
        {creating ? 'Creando…' : 'Crear OT'}
      </button>
    </div>
  );
}
