'use client';
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApiSWR } from "@/lib/swr";
import { getAuthFromSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function NoticeDetail() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const params = useParams<{ id: string }>();
  const r = useRouter();
  const { data: n, error, isLoading } = useApiSWR<any>(
    params?.id ? `/notices/${params.id}` : null,
    token,
    tenantSlug
  );
  const [creating, setCreating] = useState(false);

  const createWO = async () => {
    try {
      setCreating(true);
      const wo = await apiFetch<any>('/work-orders/from-notice', {
        method: 'POST', token, tenantSlug,
        body: { noticeId: n.id },
      });
      r.push(`/work-orders/${wo.id}`);
    } catch (e:any) {
      alert(e.message || 'Error creando OT');
    } finally {
      setCreating(false);
    }
  };

  if (error) return <div className="p-6 text-red-600">Error: {String(error)}</div>;
  if (isLoading || !n) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{n.title}</h1>
        <div className="flex gap-2">
          <Link href={`/notices/${n.id}/edit`} className="px-3 py-2 border rounded">Editar</Link>
        </div>
      </div>
      <div className="text-sm text-gray-500">
        {n.assetCode} • {n.category} • {n.status}
      </div>
      {n.body && <p>{n.body}</p>}

      <button
        onClick={createWO}
        disabled={creating}
        className="px-4 py-2 rounded-2xl bg-black text-white disabled:opacity-50"
      >
        {creating ? 'Creando…' : 'Crear OT'}
      </button>
    </div>
  );
}
