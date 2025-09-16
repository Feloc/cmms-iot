'use client';
import { useSession } from 'next-auth/react';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import { useParams } from 'next/navigation';
import AssignmentsPanel from './panels/AssignmentsPanel';
import WorkPanel from './panels/WorkPanel';

type WorkLog = { id:string; userId:string; startedAt:string; endedAt?:string; note?:string; source:string };
type Assignment = { id:string; userId:string; role:'TECHNICIAN'|'SUPERVISOR'; state:'ACTIVE'|'REMOVED'; note?:string };
type WorkOrder = {
  id: string; title: string; description?: string; assetCode: string;
  status: string; priority?: string; dueDate?: string; createdAt: string;
  assignments?: Assignment[]; workLogs?: WorkLog[];
};

export default function WorkOrderDetailPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useApiSWR<WorkOrder>(
    params?.id ? `/work-orders/${params.id}` : null,
    token,
    tenantSlug
  );

  if (error) return <div className="p-6 text-red-600">Error: {String(error)}</div>;
  if (isLoading || !data) return <div className="p-6">Cargando…</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">WO #{data.id.slice(0,6)} — {data.title}</h1>
        <div className="grid gap-2 text-sm">
          <div><span className="font-medium">Asset:</span> {data.assetCode}</div>
          <div><span className="font-medium">Estado:</span> {data.status}</div>
          <div><span className="font-medium">Prioridad:</span> {data.priority ?? '—'}</div>
          <div><span className="font-medium">Vence:</span> {data.dueDate ? new Date(data.dueDate).toLocaleString() : '—'}</div>
        </div>
        {data.description && <div className="mt-2 whitespace-pre-wrap text-sm">{data.description}</div>}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <AssignmentsPanel wo={data} />
        <WorkPanel wo={data} />
      </div>
    </div>
  );
}
