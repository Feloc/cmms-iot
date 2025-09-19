'use client';
import { useSession } from 'next-auth/react';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';


import AssignmentsPanel from './panels/AssignmentsPanel';
import WorkPanel from './panels/WorkPanel';
import CompleteButton from './components/CompleteButton';

import ResolutionPanel from './tabs/ResolutionPanel';
import PartsPanel from './tabs/PartsPanel';
import MeasurementsPanel from './tabs/MeasurementsPanel';
import AttachmentsPanel from './tabs/AttachmentsPanel';
import NotesPanel from './tabs/NotesPanel';


type WorkOrder = {
  id: string;
  title: string;
  description?: string;
  assetCode: string;
  status: 'OPEN'|'IN_PROGRESS'|'ON_HOLD'|'COMPLETED'|'CANCELED';
  priority?: string;
  dueDate?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  noticeId?: string | null;
  assignments?: any[];
  workLogs?: any[];
};

const TABS = ['Trabajo','Resolución','Partes','Mediciones','Adjuntos','Notas'] as const;
type Tab = typeof TABS[number];

export default function WorkOrderDetailPage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('Trabajo');

  const path = useMemo(() => params?.id ? `/work-orders/${params.id}` : null, [params?.id]);
  const { data: wo, error, isLoading, mutate } = useApiSWR<WorkOrder>(path, token, tenantSlug);

  if (!token || !tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading || !wo) return <div className="p-6">Cargando…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {String(error)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">WO #{wo.id.slice(0,6)} — {wo.title}</h1>
          <div className="text-sm text-gray-600 flex flex-wrap gap-3 mt-1">
            <span><span className="font-medium">Estado:</span> {wo.status}</span>
            <span><span className="font-medium">Asset:</span> {wo.assetCode}</span>
            <span><span className="font-medium">Prioridad:</span> {wo.priority ?? '—'}</span>
            {wo.dueDate && <span><span className="font-medium">Vence:</span> {new Date(wo.dueDate).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <CompleteButton workOrderId={wo.id} disabled={wo.status === 'COMPLETED'} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t}
            onClick={()=>setTab(t)}
            className={`px-3 py-2 text-sm rounded-t ${tab===t ? 'bg-white border border-b-0' : 'hover:bg-gray-100'} `}
            style={{ borderColor: '#e5e7eb' }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="border rounded-b p-4">
        {tab === 'Trabajo' && (
          <div className="grid md:grid-cols-2 gap-6">
            <AssignmentsPanel wo={wo}/>
            <WorkPanel wo={wo}/>
          </div>
        )}

        {tab === 'Resolución' && (
          <ResolutionPanel woId={wo.id} onSaved={mutate} />
        )}

        {tab === 'Partes' && (
          <PartsPanel woId={wo.id} />
        )}

        {tab === 'Mediciones' && (
          <MeasurementsPanel woId={wo.id} />
        )}

        {tab === 'Adjuntos' && (
          <AttachmentsPanel woId={wo.id} />
        )}

        {tab === 'Notas' && (
          <NotesPanel woId={wo.id} />
        )}
      </div>
    </div>
  );
}