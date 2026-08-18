'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { Assembly } from '@/lib/assemblies';

const weekDays = [{ value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' }, { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' }];
const minuteTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const timeMinute = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };

function localValue(value: string | null | undefined, timezone: string) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function zonedISOString(value: string, timezone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('La fecha de inicio no es válida');
  const values = match.slice(1).map(Number);
  const target = Date.UTC(values[0], values[1] - 1, values[2], values[3], values[4]);
  let timestamp = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
    timestamp += target - Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  }
  return new Date(timestamp).toISOString();
}

type DraftActivity = { id: string; position: number; name: string; estimatedMinutes: number; dependsOnPositions: number[] };

export function ScheduleEditor({ assembly, token, tenantSlug, canEdit, onSaved }: { assembly: Assembly; token: string; tenantSlug: string; canEdit: boolean; onSaved: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(() => localValue(assembly.scheduledStartAt || assembly.metrics.baselineStartAt, assembly.scheduleTimezone));
  const [timezone, setTimezone] = useState(assembly.scheduleTimezone);
  const [workdayStart, setWorkdayStart] = useState(minuteTime(assembly.workdayStartMinute));
  const [workdayEnd, setWorkdayEnd] = useState(minuteTime(assembly.workdayEndMinute));
  const [workingDays, setWorkingDays] = useState<number[]>(assembly.workingDays);
  const [excludedDates, setExcludedDates] = useState(assembly.excludedDates.join(', '));
  const [activities, setActivities] = useState<DraftActivity[]>(() => assembly.activities.map((activity) => ({ id: activity.id, position: activity.position, name: activity.name, estimatedMinutes: activity.estimatedMinutes, dependsOnPositions: activity.dependsOnPositions })));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function patchActivity(id: string, patch: Partial<DraftActivity>) {
    setActivities((current) => current.map((activity) => activity.id === id ? { ...activity, ...patch } : activity));
  }

  async function save() {
    if (!reason.trim() || !start || !workingDays.length) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/assemblies/${assembly.id}/schedule`, {
        method: 'PATCH', token, tenantSlug,
        body: {
          reason: reason.trim(),
          scheduledStartAt: zonedISOString(start, timezone),
          scheduleTimezone: timezone,
          workdayStartMinute: timeMinute(workdayStart),
          workdayEndMinute: timeMinute(workdayEnd),
          workingDays,
          excludedDates: excludedDates.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean),
          activities: activities.map(({ id, estimatedMinutes, dependsOnPositions }) => ({ id, estimatedMinutes, dependsOnPositions })),
        },
      });
      await onSaved();
      setOpen(false); setReason('');
    } catch (caught: any) {
      setError(caught?.message || 'No se pudo reprogramar el montaje');
    } finally { setBusy(false); }
  }

  return <section className="border rounded-lg bg-white">
    <div className="p-4 flex flex-wrap items-center justify-between gap-3">
      <div><div className="font-semibold">Línea base v{assembly.scheduleVersion}</div><div className="text-sm text-gray-600">{assembly.scheduleRevisions?.length || 0} revisiones anteriores conservadas.</div></div>
      {canEdit ? <button className="border rounded px-3 py-2 text-sm" onClick={() => setOpen((value) => !value)}>{open ? 'Cerrar edición' : 'Reprogramar'}</button> : null}
    </div>

    {open ? <div className="border-t p-4 space-y-5 bg-gray-50">
      {error ? <div className="rounded bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div> : null}
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <label className="text-sm space-y-1"><span className="font-medium block">Nuevo inicio</span><input type="datetime-local" className="border rounded px-3 py-2 w-full bg-white" value={start} onChange={(event) => setStart(event.target.value)} /></label>
        <label className="text-sm space-y-1"><span className="font-medium block">Zona horaria</span><select className="border rounded px-3 py-2 w-full bg-white" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Bogota">Bogotá</option><option value="America/Lima">Lima</option><option value="America/Mexico_City">Ciudad de México</option><option value="America/Santiago">Santiago</option><option value="America/Argentina/Buenos_Aires">Buenos Aires</option><option value="UTC">UTC</option></select></label>
        <label className="text-sm space-y-1"><span className="font-medium block">Inicio jornada</span><input type="time" className="border rounded px-3 py-2 w-full bg-white" value={workdayStart} onChange={(event) => setWorkdayStart(event.target.value)} /></label>
        <label className="text-sm space-y-1"><span className="font-medium block">Fin jornada</span><input type="time" className="border rounded px-3 py-2 w-full bg-white" value={workdayEnd} onChange={(event) => setWorkdayEnd(event.target.value)} /></label>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-1"><div className="text-sm font-medium">Días laborables</div><div className="flex flex-wrap gap-2">{weekDays.map((day) => <label key={day.value} className="border rounded px-2 py-1 text-sm bg-white"><input className="mr-1" type="checkbox" checked={workingDays.includes(day.value)} onChange={(event) => setWorkingDays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div></div>
        <label className="text-sm space-y-1"><span className="font-medium block">Fechas no laborables</span><input className="border rounded px-3 py-2 w-full bg-white" value={excludedDates} onChange={(event) => setExcludedDates(event.target.value)} placeholder="2026-12-08, 2026-12-25" /></label>
      </div>

      <div className="space-y-3"><div><h3 className="font-semibold">Duraciones y dependencias</h3><p className="text-xs text-gray-500">Una actividad sin predecesoras se programa en paralelo desde el inicio.</p></div>{activities.map((activity, index) => <div key={activity.id} className="border rounded p-3 bg-white grid lg:grid-cols-[minmax(220px,1fr)_160px_2fr] gap-3 items-start">
        <div><div className="font-medium text-sm">{activity.position}. {activity.name}</div></div>
        <label className="text-xs text-gray-600">Duración (min)<div className="flex mt-1"><button type="button" className="border rounded-l px-2" onClick={() => patchActivity(activity.id, { estimatedMinutes: Math.max(1, activity.estimatedMinutes - 15) })}>−</button><input type="number" min="1" className="border-y px-2 py-1 w-full text-center text-sm" value={activity.estimatedMinutes} onChange={(event) => patchActivity(activity.id, { estimatedMinutes: Number(event.target.value) })} /><button type="button" className="border rounded-r px-2" onClick={() => patchActivity(activity.id, { estimatedMinutes: activity.estimatedMinutes + 15 })}>+</button></div></label>
        <div><div className="text-xs text-gray-600 mb-1">Predecesoras</div>{index === 0 ? <span className="text-xs text-gray-500">Inicio del montaje</span> : <div className="flex flex-wrap gap-1.5">{activities.slice(0, index).map((previous) => <label key={previous.id} className="border rounded px-2 py-1 text-xs"><input className="mr-1" type="checkbox" checked={activity.dependsOnPositions.includes(previous.position)} onChange={(event) => patchActivity(activity.id, { dependsOnPositions: event.target.checked ? [...activity.dependsOnPositions, previous.position].sort((a, b) => a - b) : activity.dependsOnPositions.filter((position) => position !== previous.position) })} />{previous.position}. {previous.name}</label>)}</div>}</div>
      </div>)}</div>

      <label className="text-sm space-y-1 block"><span className="font-medium block">Motivo de la reprogramación *</span><textarea className="border rounded px-3 py-2 w-full min-h-20 bg-white" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej.: cambio solicitado por el cliente, demora en obra civil…" /></label>
      <div className="flex justify-end"><button className="rounded bg-black text-white px-4 py-2 disabled:opacity-50" disabled={busy || !reason.trim() || !start || !workingDays.length || timeMinute(workdayEnd) <= timeMinute(workdayStart) || activities.some((activity) => activity.estimatedMinutes <= 0)} onClick={save}>{busy ? 'Recalculando…' : 'Guardar nueva línea base'}</button></div>
    </div> : null}

    {assembly.scheduleRevisions?.length ? <div className="border-t p-4"><details><summary className="cursor-pointer text-sm font-medium">Historial de líneas base</summary><div className="mt-3 space-y-2">{assembly.scheduleRevisions.map((revision) => <div key={revision.id} className="border rounded p-3 text-sm grid md:grid-cols-4 gap-2"><div><span className="text-xs text-gray-500 block">Versión</span>v{revision.version}</div><div><span className="text-xs text-gray-500 block">Vigencia anterior</span>{new Date(revision.baselineStartAt).toLocaleString()} – {new Date(revision.baselineEndAt).toLocaleString()}</div><div><span className="text-xs text-gray-500 block">Cambio</span>{revision.reason}</div><div><span className="text-xs text-gray-500 block">Responsable</span>{revision.createdByName}<span className="block text-xs">{new Date(revision.createdAt).toLocaleString()}</span></div></div>)}</div></details></div> : null}
  </section>;
}
