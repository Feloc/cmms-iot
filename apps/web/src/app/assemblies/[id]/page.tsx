'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { type Assembly, type AssemblyActivity, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';
import { ActivityEvidence } from './ActivityEvidence';
import { SignatureCanvas } from '@/components/SignatureCanvas';

function activityColor(status: string, riskLevel?: string) {
  if (riskLevel === 'CRITICAL') return 'border-red-400 bg-red-50';
  if (riskLevel === 'WARNING') return 'border-amber-300 bg-amber-50';
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
  const { data, error, isLoading, mutate } = useApiSWR<Assembly>(id ? `/assemblies/${id}` : null, auth.token, auth.tenantSlug, { refreshInterval: 60_000 });
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

  async function saveSignature(field: 'technicianSignature' | 'receiverSignature', value: string | null) {
    if (!auth.token || !auth.tenantSlug || !data) return;
    setBusyId(field); setMessage('');
    try {
      const next = await apiFetch<Assembly>(`/assemblies/${id}/signatures`, {
        method: 'PATCH', token: auth.token, tenantSlug: auth.tenantSlug, body: { [field]: value },
      });
      await mutate(next, { revalidate: false });
    } catch (e: any) {
      setMessage(e?.message || 'No se pudo guardar la firma');
    } finally { setBusyId(''); }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6 text-gray-500">Cargando montaje…</div>;
  if (error || !data) return <div className="p-6 text-red-700">No se pudo cargar el montaje.</div>;

  const blocked = data.activities.filter((activity) => activity.status === 'BLOCKED').length;
  const activitiesDone = data.activities.every((activity) => ['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status));
  const assignedNames = data.workOrder.assignments.map((item) => item.user?.name).filter(Boolean).join(', ');

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href="/assemblies" className="text-sm text-gray-600 hover:underline">← Montajes</Link>
          <h1 className="text-2xl font-semibold mt-1">{data.workOrder.title}</h1>
          <p className="text-sm text-gray-600">{data.asset?.code || data.workOrder.assetCode} · {data.asset?.name || 'Equipo'}{data.asset?.customer ? ` · ${data.asset.customer}` : ''}</p>
        </div>
        <div className="text-right space-y-2"><div><span className={`inline-block text-sm rounded-full px-3 py-1 ${data.metrics.riskLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' : data.metrics.riskLevel === 'WARNING' ? 'bg-amber-100 text-amber-800' : data.metrics.riskLevel === 'DONE' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}`}>{data.metrics.riskLevel === 'CRITICAL' ? 'Atención inmediata' : data.metrics.riskLevel === 'WARNING' ? 'En riesgo' : data.metrics.riskLevel === 'DONE' ? 'Sin pendientes' : 'En curso normal'}</span><div className="text-xs text-gray-500 mt-1">{assemblyStatusLabel[data.status] || data.status} · {data.templateName} v{data.templateVersion}</div></div><div className="flex gap-2"><Link className="inline-block border rounded px-3 py-2 text-sm" href={`/assemblies/${id}/gantt`}>Gantt</Link><Link className="inline-block border rounded px-3 py-2 text-sm" href={`/assemblies/${id}/report`}>Reporte</Link></div></div>
      </div>

      {message ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm whitespace-pre-wrap">{message}</div> : null}

      {data.operationalAlerts.length ? <div className={`border rounded-lg p-4 ${data.metrics.riskLevel === 'CRITICAL' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}><div className="font-semibold text-sm mb-2">Alertas operativas</div><ul className="space-y-1 text-sm">{data.operationalAlerts.map((alert) => <li key={alert.code} className="flex gap-2"><span className={`w-2.5 h-2.5 mt-1.5 rounded-full shrink-0 ${alert.severity === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'}`} /><span>{alert.message}</span></li>)}</ul></div> : null}

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <Metric label="Avance físico" value={`${data.metrics.progressPercent}%`} />
        <Metric label="Presupuesto HH" value={minutesLabel(data.plannedLaborMinutes)} />
        <Metric label="Tiempo real HH" value={minutesLabel(data.metrics.actualLaborMinutes)} />
        <Metric label="Consumo" value={`${data.metrics.budgetConsumedPercent}%`} warn={data.metrics.budgetConsumedPercent > data.metrics.progressPercent + 15} />
        <Metric label="Pronóstico HH" value={minutesLabel(data.metrics.forecastLaborMinutes)} />
        <Metric label="Próximas 24 h" value={String(data.metrics.dueSoonActivities)} warn={data.metrics.dueSoonActivities > 0} />
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex justify-between text-sm"><span>Avance general</span><strong>{data.metrics.progressPercent}%</strong></div>
        <div className="h-3 rounded bg-gray-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, data.metrics.progressPercent)}%` }} /></div>
        <div className="grid md:grid-cols-4 text-sm gap-2 text-gray-600">
          <div><span className="text-xs block">Técnicos</span>{assignedNames || 'Sin asignar'}</div>
          <div><span className="text-xs block">Inicio programado</span>{data.scheduledStartAt ? new Date(data.scheduledStartAt).toLocaleString() : 'Sin fecha'}</div>
          <div><span className="text-xs block">Fin previsto</span>{data.metrics.baselineEndAt ? new Date(data.metrics.baselineEndAt).toLocaleString() : 'Sin fecha'}</div>
          <div><span className="text-xs block">Bloqueos activos</span><span className={blocked ? 'text-red-700 font-medium' : ''}>{blocked}</span></div>
        </div>
      </div>

      <section className="space-y-3">
        <div><h2 className="text-xl font-semibold">Paso a paso</h2><p className="text-sm text-gray-600">Los tiempos reales corresponden a la suma del trabajo de todos los técnicos.</p></div>
        {data.activities.map((activity) => {
          const myOpen = activity.workLogs?.some((log) => log.userId === currentUserId && !log.endedAt);
          const anyOpen = activity.workLogs?.some((log) => !log.endedAt);
          const pendingDependencies = data.activities.filter((candidate) => activity.dependsOnPositions.includes(candidate.position) && !['COMPLETED', 'NOT_APPLICABLE'].includes(candidate.status));
          const canStart = !['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status) && !myOpen && pendingDependencies.length === 0;
          return (
            <article key={activity.id} className={`border rounded-lg p-4 space-y-3 ${activityColor(activity.status, activity.riskLevel)}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3"><div className="w-8 h-8 shrink-0 rounded-full bg-white border flex items-center justify-center text-sm font-semibold">{activity.position}</div><div><div className="font-semibold">{activity.name}{activity.required ? <span className="text-red-600"> *</span> : null}</div>{activity.phase ? <div className="text-xs text-gray-500">{activity.phase}</div> : null}</div></div>
                <span className="text-xs rounded-full bg-white border px-2 py-1">{assemblyStatusLabel[activity.status] || activity.status}</span>
              </div>
              {activity.instructions ? <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.instructions}</p> : null}
              {activity.blockedReason ? <div className="rounded bg-red-100 text-red-800 p-2 text-sm"><strong>Bloqueo:</strong> {activity.blockedReason}</div> : null}
              {activity.alerts.filter((alert) => alert.code !== 'BLOCKED').map((alert) => <div key={alert.code} className={`rounded p-2 text-sm ${alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}><strong>{alert.severity === 'CRITICAL' ? 'Crítica' : 'Advertencia'}:</strong> {alert.message}</div>)}
              {pendingDependencies.length ? <div className="rounded bg-amber-100 text-amber-800 p-2 text-sm"><strong>En espera de:</strong> {pendingDependencies.map((item) => item.name).join(', ')}</div> : null}
              {activity.notes ? <div className="text-sm"><span className="text-gray-500">Observaciones:</span> {activity.notes}</div> : null}
              <ActivityEvidence
                activity={activity}
                workOrderId={data.workOrder.id}
                token={auth.token}
                tenantSlug={auth.tenantSlug}
                canUpload={canOperate && !['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status)}
                canDelete={role === 'ADMIN'}
                onChanged={() => mutate()}
              />
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

      <section className="border rounded-lg p-4 space-y-4">
        <div><h2 className="text-xl font-semibold">Firmas de entrega</h2><p className="text-sm text-gray-600">La firma de quien recibe se habilita cuando todas las actividades están terminadas.</p></div>
        <div className="grid md:grid-cols-2 gap-5">
          <SignatureCanvas label="Firma del técnico responsable" initialDataUrl={data.workOrder.technicianSignature || null} disabled={!canOperate || !!busyId} onChange={(value) => saveSignature('technicianSignature', value)} />
          <SignatureCanvas label="Firma de quien recibe en el cliente" initialDataUrl={data.workOrder.receiverSignature || null} disabled={!canOperate || !activitiesDone || !!busyId} onChange={(value) => saveSignature('receiverSignature', value)} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${data.workOrder.technicianSignature ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{data.workOrder.technicianSignature ? 'Firma técnica registrada' : 'Firma técnica pendiente'}</span><span className={`rounded-full px-2 py-1 ${data.workOrder.receiverSignature ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{data.workOrder.receiverSignature ? 'Recibido por cliente' : 'Firma del cliente pendiente'}</span></div>
      </section>

      <div className="text-sm"><Link className="underline" href={`/service-orders/${data.workOrder.id}`}>Abrir orden de servicio y evidencias</Link></div>
    </div>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className={`border rounded-lg p-3 ${warn ? 'border-amber-300 bg-amber-50' : ''}`}><div className="text-xs text-gray-500">{label}</div><div className={`text-lg font-semibold ${warn ? 'text-amber-800' : ''}`}>{value}</div></div>;
}
