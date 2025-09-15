'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";
import { getAuthFromSession } from "@/lib/auth";
import { useApiSWR } from "@/lib/swr";
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

type Notice = {
  id: string;
  title: string;
  status: string;
  assetCode?: string | null;
  source?: string | null;
  createdAt?: string;
};

export default function NoticesPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const router = useRouter();

  const { data, error, isLoading, mutate } = useApiSWR<Notice[]>("notices", token, tenantSlug);

  const createWO = async (noticeId: string) => {
    const wo = await apiFetch<{ id: string }>(`/notices/${noticeId}/work-orders`, {
      method: 'POST',
      token,
      tenantSlug,
      body: {}, // opcionalmente priority/dueDate/etc
    });
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

  if (isLoading) return <div>Cargando...</div>;
  if (error) return <div>Error: {(error as any).message}</div>;
  const notices = data ?? [];

  return (
    <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Notices</h1>
            <Link href="/notices/new" className="px-3 py-2 rounded bg-black text-white text-sm">
                Nuevo
            </Link>
        </div>
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
              <td className="py-2">{n.title}</td>
              <td className="py-2">{n.assetCode}</td>
              <td className="py-2">{n.status}</td>
              <td className="py-2">
                <button
                  onClick={() => createWO(n.id)}
                  className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  disabled={n.status === 'CLOSED'}
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
