'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Assembly, AssemblyPersistentAlert } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';

type User = { id: string; name: string; email: string };
type ResolvedAlert = AssemblyPersistentAlert & { execution?: { id: string; workOrder?: { title: string; assetCode: string } }; activity?: { name: string } | null };

export function OperationalAlertQueue({ assemblies, token, tenantSlug, role, onChanged }: { assemblies: Assembly[]; token: string; tenantSlug: string; role: string; onChanged: () => Promise<unknown> }) {
  const { data: technicians } = useApiSWR<User[]>(role === 'ADMIN' ? '/users?role=TECH' : null, token, tenantSlug);
  const { data: resolvedAlerts, mutate: mutateResolved } = useApiSWR<ResolvedAlert[]>('/assemblies/operational-alerts?status=RESOLVED', token, tenantSlug, { refreshInterval: 60_000 });
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const rows = useMemo(() => assemblies.flatMap((assembly) => assembly.persistentAlerts.map((alert) => ({ assembly, alert }))).sort((a, b) => {
    const escalation = b.alert.escalationLevel - a.alert.escalationLevel;
    if (escalation) return escalation;
    const severity = (a.alert.severity === 'CRITICAL' ? 0 : 1) - (b.alert.severity === 'CRITICAL' ? 0 : 1);
    return severity || new Date(a.alert.firstDetectedAt).getTime() - new Date(b.alert.firstDetectedAt).getTime();
  }), [assemblies]);
  const people = useMemo(() => {
    const result = new Map<string, string>();
    for (const assembly of assemblies) for (const assignment of assembly.workOrder.assignments) if (assignment.user?.name) result.set(assignment.userId, assignment.user.name);
    for (const user of technicians || []) result.set(user.id, user.name);
    return result;
  }, [assemblies, technicians]);

  async function update(alert: AssemblyPersistentAlert, body: { assignedUserId?: string | null; acknowledge?: boolean }) {
    setBusyId(alert.id); setError('');
    try {
      await apiFetch(`/assemblies/operational-alerts/${alert.id}`, { method: 'PATCH', token, tenantSlug, body });
      await Promise.all([onChanged(), mutateResolved()]);
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo actualizar la alerta');
    } finally { setBusyId(''); }
  }

  if (!rows.length && !resolvedAlerts?.length) return null;
  return <section className="border rounded-lg bg-white overflow-hidden">
    <div className="p-4 border-b"><h2 className="font-semibold">Bandeja de alertas operativas</h2><p className="text-xs text-gray-600">Las alertas abiertas escalan automáticamente a los 30 minutos y nuevamente a las 2 horas.</p></div>
    {error ? <div className="m-3 border border-red-200 bg-red-50 text-red-700 rounded p-2 text-sm">{error}</div> : null}
    {rows.length ? <div className="divide-y">{rows.map(({ assembly, alert }) => {
      const escalated = alert.escalationLevel > 0;
      const tone = alert.severity === 'CRITICAL' || alert.escalationLevel >= 2 ? 'bg-red-500' : 'bg-amber-500';
      return <div key={alert.id} className="p-4 grid lg:grid-cols-[minmax(280px,1.4fr)_1fr_1fr_auto] gap-3 items-center">
        <div className="flex gap-3 min-w-0"><span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${tone}`} /><div className="min-w-0"><Link className="font-medium text-sm hover:underline" href={`/assemblies/${assembly.id}`}>{assembly.workOrder.title}</Link><div className="text-sm text-gray-700">{alert.message}</div><div className="text-xs text-gray-500">Detectada {new Date(alert.firstDetectedAt).toLocaleString()}</div></div></div>
        <div className="text-sm"><div className="flex flex-wrap gap-1"><span className={`rounded px-2 py-1 text-xs ${alert.status === 'ACKNOWLEDGED' ? 'bg-sky-100 text-sky-800' : 'bg-gray-100'}`}>{alert.status === 'ACKNOWLEDGED' ? 'Atención confirmada' : 'Abierta'}</span>{escalated ? <span className={`rounded px-2 py-1 text-xs ${alert.escalationLevel >= 2 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>Escalamiento nivel {alert.escalationLevel}</span> : null}</div>{alert.acknowledgedByName ? <div className="text-xs text-gray-500 mt-1">Por {alert.acknowledgedByName}</div> : null}</div>
        <div>{role === 'ADMIN' ? <select className="border rounded px-2 py-1.5 text-sm w-full" value={alert.assignedUserId || ''} disabled={busyId === alert.id} onChange={(event) => update(alert, { assignedUserId: event.target.value || null })}><option value="">Sin responsable</option>{(technicians || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select> : <div className="text-sm"><span className="text-xs text-gray-500 block">Responsable</span>{alert.assignedUserId ? people.get(alert.assignedUserId) || 'Asignado' : 'Sin asignar'}</div>}</div>
        <div className="flex justify-end">{alert.status === 'OPEN' ? <button className="border rounded px-3 py-1.5 text-sm disabled:opacity-50" disabled={!!busyId} onClick={() => update(alert, { acknowledge: true })}>Confirmar atención</button> : role === 'ADMIN' ? <button className="text-xs underline text-gray-600 disabled:opacity-50" disabled={!!busyId} onClick={() => update(alert, { acknowledge: false })}>Reabrir</button> : null}</div>
      </div>;
    })}</div> : <div className="p-4 text-sm text-emerald-700">No hay alertas activas.</div>}
    {resolvedAlerts?.length ? <div className="border-t p-4"><details><summary className="cursor-pointer text-sm font-medium">Historial resuelto ({resolvedAlerts.length})</summary><div className="mt-3 divide-y border rounded">{resolvedAlerts.slice(0, 20).map((alert) => <div key={alert.id} className="p-3 grid md:grid-cols-[1fr_2fr_1fr] gap-2 text-sm"><div>{alert.execution?.workOrder?.title || 'Montaje'}<span className="block text-xs text-gray-500">{alert.activity?.name || 'Alerta general'}</span></div><div>{alert.message}</div><div className="text-xs text-gray-500">Resuelta {alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : '—'}</div></div>)}</div></details></div> : null}
  </section>;
}
