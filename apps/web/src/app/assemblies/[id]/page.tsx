'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { type Assembly, type AssemblyActivity, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';

function activityColor(status: string) {
  if (status === 'COMPLETED') return 'border-emerald-300 bg-emerald-50';
  if (status === 'IN_PROGRESS') return 'border-sky-300 bg-sky-50';
  if (status === 'BLOCKED') return 'border-red-300 bg-red-50';
  if (status === 'PAUSED') return 'border-amber-300 bg-amber-50';
  return 'border-gray-200 bg-white';
}

export default function AssemblyDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = String((session as any)?.user?.role || '');
  const canOperate = role === 'ADMIN' || role === 'TECH';
  const currentUserId = String((session as any)?.user?.id || (session as any)?.user?.sub || '');
  const { data, error, isLoading, mutate } = useApiSWR<Assembly>(id ? `/assemblies/${id}` : null, auth.token, auth.tenantSlug);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  async function action(activity: AssemblyActivity, name: 'start' | 'pause' | 'complete' | 'block') {
    if (!auth.token || !auth.tenantSlug) return;
    let body: any = undefined;
    if (name === 'block') {
      const reason = window.prompt('Motivo del bloqueo:');
      if (!reason?.trim()) return;
      body = { reason: reason.trim() };
    }
    if (name === 'complete') {
      const notes = window.prompt('Observaciones de cierre (opcional):');
      if (notes === null) return;
      body = { notes: notes.trim() || undefined };
    }
    setBusyId(activity.id); setMessage('');
    try {
      const next = await apiFetch<Assembly>(`/assemblies/${id}/activities/${activity.id}/${name}`, {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body,
      });
      await mutate(next, { revalidate: false });
    } catch (e: any) {
      setMessage(e?.message || 'No se pudo actualizar la actividad');
    } finally { setBusyId(''); }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6 text-gray-500">Cargando montaje…</div>;
  if (error || !data) return <div className="p-6 text-red-700">No se pudo cargar el montaje.</div>;

  const blocked = data.activities.filter((activity) => activity.status === 'BLOCKED').length;
  const assignedNames = data.workOrder.assignments.map((item) => item.user?.name).filter(Boolean).join(', ');

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href="/assemblies" className="text-sm text-gray-600 hover:underline">← Montajes</Link>
          <h1 className="text-2xl font-semibold mt-1">{data.workOrder.title}</h1>
          <p className="text-sm text-gray-600">{data.asset?.code || data.workOrder.assetCode} · {data.asset?.name || 'Equipo'}{data.asset?.customer ? ` · ${data.asset.customer}` : ''}</p>
        </div>
        <div className="text-right"><span className="inline-block text-sm rounded-full px-3 py-1 bg-gray-100">{assemblyStatusLabel[data.status] || data.status}</span><div className="text-xs text-gray-500 mt-1">{data.templateName} · v{data.templateVersion}</div></div>
      </div>

      {message ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm whitespace-pre-wrap">{message}</div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Metric label="Avance físico" value={`${data.metrics.progressPercent}%`} />
        <Metric label="Presupuesto HH" value={minutesLabel(data.plannedLaborMinutes)} />
        <Metric label="Tiempo real HH" value={minutesLabel(data.metrics.actualLaborMinutes)} />
        <Metric label="Consumo" value={`${data.metrics.budgetConsumedPercent}%`} warn={data.metrics.budgetConsumedPercent > data.metrics.progressPercent + 15} />
        <Metric label="Pronóstico HH" value={minutesLabel(data.metrics.forecastLaborMinutes)} />
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm"><span>Avance general</span><strong>{data.metrics.progressPercent}%</strong></div>
        <div className="h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, data.metrics.progressPercent)}%` }} /></div>
        <div className="grid md:grid-cols-3 text-sm gap-2 text-gray-600">
          <div><span className="text-xs block">Técnicos</span>{assignedNames || 'Sin asignar'}</div>
          <div><span className="text-xs block">Programado</span>{data.workOrder.dueDate ? new Date(data.workOrder.dueDate).toLocaleString() : 'Sin fecha'}</div>
          <div><span className="text-xs block">Bloqueos activos</span><span className={blocked ? 'text-red-700 font-medium' : ''}>{blocked}</span></div>
        </div>
      </div>

      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Paso a paso</h2><p className="text-sm text-gray-600">Los tiempos reales corresponden a la suma del trabajo de todos los técnicos.</p></div>
        {data.activities.map((activity) => {
          const myOpen = activity.workLogs?.some((log) => log.userId === currentUserId && !log.endedAt);
          const anyOpen = activity.workLogs?.some((log) => !log.endedAt);
          const canStart = !['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status) && !myOpen;
          return (
            <article key={activity.id} className={`border rounded-lg p-4 space-y-3 ${activityColor(activity.status)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3"><div className="w-8 h-8 shrink-0 rounded-full bg-white border flex items-center justify-center text-sm font-semibold">{activity.position}</div><div><div className="font-semibold">{activity.name}{activity.required ? <span className="text-red-600"> *</span> : null}</div>{activity.phase ? <div className="text-xs text-gray-500">{activity.phase}</div> : null}</div></div>
                <span className="text-xs rounded-full bg-white border px-2 py-1">{assemblyStatusLabel[activity.status] || activity.status}</span>
              </div>
              {activity.instructions ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.instructions}</p> : null}
              {activity.blockedReason ? <div className="rounded bg-red-100 text-red-800 p-2 text-sm"><strong>Bloqueo:</strong> {activity.blockedReason}</div> : null}
              {activity.notes ? <div className="text-sm"><span className="text-gray-500">Observaciones:</span> {activity.notes}</div> : null}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><span className="text-xs text-gray-500 block">Estimado</span>{minutesLabel(activity.estimatedMinutes * activity.plannedTechnicians)} HH</div>
                <div><span className="text-xs text-gray-500 block">Real</span>{minutesLabel(activity.actualMinutes)} HH</div>
                <div><span className="text-xs text-gray-500 block">Técnicos previstos</span>{activity.plannedTechnicians}</div>
                <div><span className="text-xs text-gray-500 block">Evidencia</span>{activity.evidenceRequired ? 'Obligatoria' : 'Opcional'}</div>
              </div>
              {activity.workLogs?.length ? <div className="text-xs text-gray-600">Intervenciones: {activity.workLogs.map((log) => log.user?.name || 'Técnico').join(', ')}</div> : null}
              {canOperate ? <div className="flex flex-wrap gap-2 justify-end">
                {canStart ? <button disabled={!!busyId} onClick={() => action(activity, 'start')} className="border rounded px-3 py-2 text-sm bg-white">{activity.status === 'BLOCKED' ? 'Reanudar' : 'Iniciar'}</button> : null}
                {myOpen ? <button disabled={!!busyId} onClick={() => action(activity, 'pause')} className="border rounded px-3 py-2 text-sm bg-white">Pausar</button> : null}
                {!['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status) ? <button disabled={!!busyId} onClick={() => action(activity, 'block')} className="border border-red-300 text-red-700 rounded px-3 py-2 text-sm bg-white">Bloquear</button> : null}
                {!['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status) && (anyOpen || activity.status !== 'PENDING') ? <button disabled={!!busyId} onClick={() => action(activity, 'complete')} className="rounded px-3 py-2 text-sm bg-black text-white">Completar</button> : null}
              </div> : null}
            </article>
          );
        })}
      </section>

      <div className="text-sm"><Link className="underline" href={`/service-orders/${data.workOrder.id}`}>Abrir orden de servicio y evidencias</Link></div>
    </div>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className={`border rounded-lg p-3 ${warn ? 'border-amber-300 bg-amber-50' : ''}`}><div className="text-xs text-gray-500">{label}</div><div className={`text-lg font-semibold ${warn ? 'text-amber-800' : ''}`}>{value}</div></div>;
}
