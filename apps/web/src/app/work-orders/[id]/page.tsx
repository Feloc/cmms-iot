'use client';
import { useSession } from 'next-auth/react';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import { useParams } from 'next/navigation';

type WorkOrder = {
  id: string;
  title: string;
  description?: string;
  assetCode: string;
  status: string;
  priority?: string;
  dueDate?: string;
  assignedToUserIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export default function WorkOrderDetailPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useApiSWR<WorkOrder>(`work-orders/${params.id}`, token, tenantSlug);

  if (!token || !tenantSlug) return <div>Necesitas iniciar sesión.</div>;
  if (isLoading) return <div>Cargando...</div>;
  if (error) return <div>Error: {(error as any).message}</div>;
  if (!data) return <div>No encontrada</div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-semibold">{data.title}</h1>
      <div className="grid gap-2 text-sm">
        <div><span className="font-medium">Asset:</span> {data.assetCode}</div>
        <div><span className="font-medium">Estado:</span> {data.status}</div>
        <div><span className="font-medium">Prioridad:</span> {data.priority ?? '—'}</div>
        <div><span className="font-medium">Vence:</span> {data.dueDate ? new Date(data.dueDate).toLocaleString() : '—'}</div>
        <div><span className="font-medium">Asignados:</span> {(data.assignedToUserIds ?? []).join(', ') || '—'}</div>
      </div>
      {data.description && (
        <div className="mt-2 whitespace-pre-wrap text-sm">{data.description}</div>
      )}
    </div>
  );
}
