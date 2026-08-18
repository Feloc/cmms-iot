'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { getAuthFromSession } from '@/lib/auth';
import { type Assembly, type AssemblyActivity, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';
import { ScheduleEditor } from './ScheduleEditor';

const HOUR = 3_600_000;
const MINUTE = 60_000;

type Zoom = 'COMPACT' | 'NORMAL' | 'DETAIL';
const pixelsPerHour: Record<Zoom, number> = { COMPACT: 24, NORMAL: 48, DETAIL: 96 };

function statusColor(status: string, riskLevel?: string) {
  if (riskLevel === 'CRITICAL') return 'bg-red-500';
  if (riskLevel === 'WARNING') return 'bg-amber-500';
  if (status === 'COMPLETED') return 'bg-emerald-500';
  if (status === 'IN_PROGRESS') return 'bg-sky-500';
  if (status === 'BLOCKED') return 'bg-red-500';
  if (status === 'PAUSED') return 'bg-amber-500';
  if (status === 'NOT_APPLICABLE') return 'bg-gray-400';
  return 'bg-slate-400';
}

function formatTick(value: number, spanMs: number) {
  const date = new Date(value);
  if (spanMs > 72 * HOUR) return date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (spanMs > 24 * HOUR) return date.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatWorkdayMinute(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export default function AssemblyGanttPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const { data, error, isLoading, mutate } = useApiSWR<Assembly>(id ? `/assemblies/${id}` : null, auth.token, auth.tenantSlug, { refreshInterval: 60_000 });
  const role = (session as any)?.user?.role;
  const [zoom, setZoom] = useState<Zoom>('NORMAL');
  const now = Date.now();

  const timeline = useMemo(() => {
    if (!data) return null;
    const plannedStart = new Date(data.metrics.baselineStartAt).getTime();
    const plannedEnd = new Date(data.metrics.baselineEndAt).getTime();
    const actualDates = data.activities.flatMap((activity) => [
      activity.startedAt ? new Date(activity.startedAt).getTime() : NaN,
      activity.completedAt ? new Date(activity.completedAt).getTime() : activity.startedAt ? now : NaN,
    ]).filter(Number.isFinite);
    const rawStart = Math.min(plannedStart, ...(actualDates.length ? actualDates : [plannedStart]));
    const rawEnd = Math.max(plannedEnd, ...(actualDates.length ? actualDates : [plannedEnd]), now >= plannedStart && now <= plannedEnd ? now : plannedEnd);
    const rawSpan = Math.max(30 * MINUTE, rawEnd - rawStart);
    const padding = Math.max(10 * MINUTE, rawSpan * 0.04);
    const start = rawStart - padding;
    const end = rawEnd + padding;
    const span = end - start;
    const hours = span / HOUR;
    const width = Math.min(14_000, Math.max(760, hours * pixelsPerHour[zoom]));
    const tickCount = Math.max(7, Math.min(14, Math.round(width / 130)));
    const ticks = Array.from({ length: tickCount + 1 }, (_, index) => start + (span * index) / tickCount);
    return { start, end, span, width, ticks, plannedStart, plannedEnd };
  }, [data, now, zoom]);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6 text-gray-500">Construyendo cronograma…</div>;
  if (error || !data || !timeline) return <div className="p-6 text-red-700">No se pudo cargar el cronograma.</div>;

  const delayed = data.activities.filter((activity) => activityDelay(activity, now) > 0).length;
  const active = data.activities.find((activity) => activity.status === 'IN_PROGRESS');

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href={`/assemblies/${id}`} className="text-sm text-gray-600 hover:underline">← Volver al montaje</Link><h1 className="text-2xl font-semibold mt-1">Cronograma Gantt</h1><p className="text-sm text-gray-600">{data.workOrder.title} · {data.asset?.code || data.workOrder.assetCode}</p></div>
        <div className="flex items-center gap-2"><label className="text-sm text-gray-600">Escala</label><select className="border rounded px-3 py-2 text-sm" value={zoom} onChange={(event) => setZoom(event.target.value as Zoom)}><option value="COMPACT">Compacta</option><option value="NORMAL">Normal</option><option value="DETAIL">Detallada</option></select></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Summary label="Inicio base" value={new Date(timeline.plannedStart).toLocaleString()} />
        <Summary label="Fin base" value={new Date(timeline.plannedEnd).toLocaleString()} />
        <Summary label="Duración prevista" value={minutesLabel(data.plannedMinutes)} />
        <Summary label="Actividad actual" value={active?.name || '—'} />
        <Summary label="Pasos con atraso" value={String(delayed)} warn={delayed > 0} />
        <Summary label="Calendario" value={`${formatWorkdayMinute(data.workdayStartMinute)}–${formatWorkdayMinute(data.workdayEndMinute)} · ${data.scheduleTimezone}`} />
      </div>

      <ScheduleEditor assembly={data} token={auth.token} tenantSlug={auth.tenantSlug} canEdit={role === 'ADMIN'} onSaved={() => mutate()} />

      {data.operationalAlerts.length ? <div className={`border rounded-lg p-3 flex flex-wrap gap-2 text-sm ${data.metrics.riskLevel === 'CRITICAL' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>{data.operationalAlerts.map((alert) => <span key={alert.code} className={`rounded px-2 py-1 ${alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{alert.message}</span>)}</div> : null}

      <div className="flex flex-wrap gap-4 text-xs text-gray-600 border rounded p-3">
        <Legend className="border-2 border-dashed border-slate-400 bg-slate-100" label="Línea base" />
        <Legend className="bg-sky-500" label="Ejecución real" />
        <Legend className="bg-emerald-500" label="Completada" />
        <Legend className="bg-red-500" label="Bloqueada" />
        <span>Las barras superiores son planificadas; las inferiores muestran ejecución real.</span>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <div style={{ width: 300 + timeline.width }} className="min-w-full">
            <div className="flex border-b bg-gray-50 sticky top-0 z-20">
              <div className="w-[300px] shrink-0 p-3 border-r font-medium sticky left-0 bg-gray-50 z-30">Actividad</div>
              <div className="relative h-14" style={{ width: timeline.width }}>
                {timeline.ticks.map((tick, index) => <div key={tick} className="absolute top-0 bottom-0 border-l border-gray-200" style={{ left: `${((tick - timeline.start) / timeline.span) * 100}%` }}><span className={`absolute top-2 text-[11px] text-gray-600 whitespace-nowrap ${index === timeline.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}>{formatTick(tick, timeline.span)}</span></div>)}
              </div>
            </div>

            {data.activities.map((activity) => <GanttRow key={activity.id} activity={activity} timeline={timeline} now={now} />)}
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500">La línea base respeta las dependencias, actividades paralelas, jornada laboral y fechas no laborables configuradas. Las horas-hombre se controlan por separado en el detalle del montaje.</p>
    </div>
  );
}

function GanttRow({ activity, timeline, now }: { activity: AssemblyActivity; timeline: { start: number; span: number; width: number; ticks: number[]; end: number; plannedStart: number; plannedEnd: number }; now: number }) {
  const plannedStart = new Date(activity.plannedStartAt).getTime();
  const plannedEnd = new Date(activity.plannedEndAt).getTime();
  const actualStart = activity.startedAt ? new Date(activity.startedAt).getTime() : null;
  const actualEnd = actualStart ? (activity.completedAt ? new Date(activity.completedAt).getTime() : now) : null;
  const delay = activityDelay(activity, now);
  const left = (value: number) => ((value - timeline.start) / timeline.span) * 100;
  const width = (start: number, end: number) => Math.max(0.35, ((Math.max(end, start + MINUTE) - start) / timeline.span) * 100);
  return <div className="flex border-b last:border-b-0 min-h-[82px] group">
    <div className="w-[300px] shrink-0 px-3 py-2 border-r sticky left-0 bg-white group-hover:bg-gray-50 z-10">
      <div className="flex gap-2"><span className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs shrink-0 ${activity.riskLevel === 'CRITICAL' ? 'border-red-500 text-red-700' : activity.riskLevel === 'WARNING' ? 'border-amber-500 text-amber-700' : ''}`}>{activity.position}</span><div className="min-w-0"><div className="font-medium text-sm truncate" title={activity.name}>{activity.name}</div><div className="text-xs text-gray-500">{activity.phase || 'Sin etapa'} · {minutesLabel(activity.estimatedMinutes)}</div><div className="text-[11px] text-gray-500">{activity.dependsOnPositions.length ? `Depende de: ${activity.dependsOnPositions.join(', ')}` : 'Sin predecesoras'}</div><div className={`text-xs ${activity.riskLevel === 'CRITICAL' ? 'text-red-700 font-medium' : activity.riskLevel === 'WARNING' ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>{activity.alerts[0]?.message || (assemblyStatusLabel[activity.status] || activity.status)}{delay > 0 && !activity.alerts.length ? ` · atraso ${minutesLabel(delay)}` : ''}</div></div></div>
    </div>
    <div className="relative" style={{ width: timeline.width }}>
      {timeline.ticks.map((tick) => <div key={tick} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: `${left(tick)}%` }} />)}
      {now >= timeline.start && now <= timeline.start + timeline.span ? <div className="absolute top-0 bottom-0 border-l-2 border-fuchsia-500 z-[5]" style={{ left: `${left(now)}%` }} title="Ahora" /> : null}
      <div className="absolute h-5 rounded border-2 border-dashed border-slate-400 bg-slate-100/80 top-4" style={{ left: `${left(plannedStart)}%`, width: `${width(plannedStart, plannedEnd)}%` }} title={`Plan: ${new Date(plannedStart).toLocaleString()} – ${new Date(plannedEnd).toLocaleString()}`} />
      {actualStart && actualEnd ? <div className={`absolute h-5 rounded top-11 ${statusColor(activity.status, activity.riskLevel)}`} style={{ left: `${left(actualStart)}%`, width: `${width(actualStart, actualEnd)}%` }} title={`Real: ${new Date(actualStart).toLocaleString()} – ${activity.completedAt ? new Date(actualEnd).toLocaleString() : 'en curso'}`}><div className="h-full bg-black/15 rounded-l" style={{ width: `${Math.max(0, Math.min(100, activity.status === 'COMPLETED' ? 100 : activity.progressPercent))}%` }} /></div> : null}
    </div>
  </div>;
}

function activityDelay(activity: AssemblyActivity, now: number) {
  const plannedEnd = new Date(activity.plannedEndAt).getTime();
  if (activity.completedAt) return Math.max(0, Math.round((new Date(activity.completedAt).getTime() - plannedEnd) / MINUTE));
  if (!['COMPLETED', 'NOT_APPLICABLE'].includes(activity.status) && now > plannedEnd) return Math.round((now - plannedEnd) / MINUTE);
  return 0;
}

function Summary({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) { return <div className={`border rounded-lg p-3 ${warn ? 'border-red-300 bg-red-50' : 'bg-white'}`}><div className="text-xs text-gray-500">{label}</div><div className={`font-semibold text-sm ${warn ? 'text-red-700' : ''}`}>{value}</div></div>; }
function Legend({ className, label }: { className: string; label: string }) { return <span className="inline-flex items-center gap-1.5"><span className={`w-8 h-3 rounded ${className}`} />{label}</span>; }
