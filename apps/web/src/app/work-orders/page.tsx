'use client';
import { useSession } from 'next-auth/react';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import Link from 'next/link';

type WorkOrder = {
  id: string;
  title: string;
  assetCode: string;
  status: 'OPEN'|'IN_PROGRESS'|'ON_HOLD'|'COMPLETED'|'CANCELED';
};

export default function WorkOrdersPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const { data, error, isLoading } = useApiSWR<WorkOrder[]>('work-orders', token, tenantSlug);

  if (!token || !tenantSlug) return <div>Necesitas iniciar sesión.</div>;
  if (isLoading) return <div>Cargando...</div>;
  if (error) return <div>Error: {(error as any).message}</div>;

  const items = data ?? [];

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Ordenes de trabajo</h1>
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
          {items.map(w => (
            <tr key={w.id} className="border-b">
              <td className="py-2">{w.title}</td>
              <td className="py-2">{w.assetCode}</td>
              <td className="py-2">{w.status}</td>
              <td className="py-2">
                <Link href={`/work-orders/${w.id}`} className="text-blue-600 hover:underline">
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-500">Sin OTs</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
