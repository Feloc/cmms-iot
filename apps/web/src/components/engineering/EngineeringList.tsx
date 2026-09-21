'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { EngineeringRequest, EngineeringUser, engineeringStatuses, priorities, engineeringInput, engineeringError, engineeringDate } from '@/lib/engineering';
import NewRequest from './NewRequest';

export default function EngineeringList({ assetId }: { assetId?: string }) {
  const { data: session, status } = useSession();
  const auth = getAuthFromSession(session);
  const canWrite = ['ADMIN','TECH'].includes((session as any)?.user?.role);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [priority, setPriority] = useState('');
  const [responsible, setResponsible] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [origin, setOrigin] = useState<{ assetId?: string; workOrderId?: string; noticeId?: string }>({});
  useEffect(() => {
    if (assetId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      setOrigin({ assetId: params.get('assetId') || undefined, workOrderId: params.get('workOrderId') || undefined, noticeId: params.get('noticeId') || undefined });
      setCreating(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [assetId]);
  const qs = new URLSearchParams({ q: query, status: filter, priority, responsibleUserId: responsible, page: String(page), ...(assetId ? { assetId } : {}) });
  const { data, error, isLoading, mutate } = useApiSWR<{ items: EngineeringRequest[]; total: number; pages: number }>('/engineering-requests?' + qs, auth.token, auth.tenantSlug);
  const { data: users } = useApiSWR<EngineeringUser[]>('/users', auth.token, auth.tenantSlug);
  if (status === 'loading') return <p role="status">Cargando...</p>;
  if (!auth.token) return <p>Inicia sesión.</p>;
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">{assetId ? 'Ingeniería del equipo' : 'Solicitudes de ingeniería'}</h1><div className="flex gap-2">
      <Button variant="outline" size="icon" title="Actualizar" aria-label="Actualizar" onClick={() => mutate()}><RefreshCw /></Button>
      {canWrite && <Button className="bg-emerald-700 text-white hover:bg-emerald-800" onClick={() => { setOrigin({}); setCreating(true); }}><Plus />Nueva solicitud</Button>}
    </div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm">Buscar<input className={engineeringInput} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Solicitud, equipo o cliente" /></label>
      <label className="grid gap-1 text-sm">Estado<select className={engineeringInput} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}><option value="">Todos</option>{Object.entries(engineeringStatuses).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Prioridad<select className={engineeringInput} value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}><option value="">Todas</option>{Object.entries(priorities).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Responsable<select className={engineeringInput} value={responsible} onChange={(e) => { setResponsible(e.target.value); setPage(1); }}><option value="">Todos</option>{users?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="text-red-700">{engineeringError(error)}</p>}
    <div className="overflow-x-auto border-y">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-gray-50"><tr>{['Solicitud','Equipo / cliente','Estado','Prioridad','Responsable','Actualización'].map((label) => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{isLoading ? <tr><td colSpan={6} className="p-6">Cargando solicitudes...</td></tr> : data?.items.map((r) => <tr key={r.id} className="border-t">
          <td className="p-3 max-w-xs break-words"><Link href={'/engineering-requests/' + r.id} className="font-medium text-emerald-700 underline">{r.number}</Link><div>{r.title}</div></td>
          <td className="p-3"><Link href={'/assets/' + r.assetId} className="underline">{r.asset.code}</Link><div className="text-gray-500">{r.asset.customer || '-'}</div></td>
          <td className="p-3">{engineeringStatuses[r.status]}</td><td className="p-3">{priorities[r.priority]}</td>
          <td className="p-3">{users?.find((u) => u.id === r.responsibleUserId)?.name || 'Sin asignar'}</td><td className="p-3">{engineeringDate(r.updatedAt)}</td>
        </tr>)}</tbody>
      </table>
      {!isLoading && !error && !data?.items.length && <p className="p-6 text-sm text-gray-500">No hay solicitudes para estos filtros.</p>}
    </div>
    <div className="flex items-center justify-between text-sm"><span>{data?.total ?? 0} solicitudes</span><div className="flex items-center gap-2">
      <Button variant="outline" size="icon" title="Página anterior" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></Button>
      <span>{page} / {Math.max(1, data?.pages || 1)}</span>
      <Button variant="outline" size="icon" title="Página siguiente" aria-label="Página siguiente" disabled={!data || page >= data.pages} onClick={() => setPage(page + 1)}><ChevronRight /></Button>
    </div></div>
    {creating && canWrite && <NewRequest auth={auth} {...origin} assetId={assetId || origin.assetId} onClose={() => setCreating(false)} />}
  </div>;
}
