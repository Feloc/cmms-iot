'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AssetSearchSelect } from '@/components/AssetSearchSelect';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { type AssemblyTemplate, criticalPathMinutes, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';

type User = { id: string; name: string; email: string; role: string };
const weekDays = [{ value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' }, { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' }];
const timeMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
function zonedLocalISOString(value: string, timezone: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('La fecha de inicio no es válida');
  const [, year, month, day, hour, minute] = match.map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    timestamp += target - represented;
  }
  return new Date(timestamp).toISOString();
}

export default function NewAssemblyPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role;
  const { data: templates } = useApiSWR<AssemblyTemplate[]>('/assemblies/templates?active=true', auth.token, auth.tenantSlug);
  const { data: technicians } = useApiSWR<User[]>('/users?role=TECH', auth.token, auth.tenantSlug);
  const [assetCode, setAssetCode] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [scheduleTimezone, setScheduleTimezone] = useState('America/Bogota');
  const [workdayStart, setWorkdayStart] = useState('08:00');
  const [workdayEnd, setWorkdayEnd] = useState('17:00');
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [excludedDates, setExcludedDates] = useState('');
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = templates?.find((item) => item.id === templateId);
  const planned = selected ? criticalPathMinutes(selected.steps) : 0;
  const labor = selected?.steps.reduce((sum, step) => sum + step.estimatedMinutes * step.plannedTechnicians, 0) || 0;

  async function submit() {
    if (!assetCode || !templateId || !scheduledStartAt || !auth.token || !auth.tenantSlug) return;
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/assemblies', {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug,
        body: {
          assetCode, templateId, technicianIds,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          scheduledStartAt: zonedLocalISOString(scheduledStartAt, scheduleTimezone),
          scheduleTimezone,
          workdayStartMinute: timeMinutes(workdayStart),
          workdayEndMinute: timeMinutes(workdayEnd),
          workingDays,
          excludedDates: excludedDates.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean),
        },
      });
      router.push(`/assemblies/${created.id}`);
    } catch (e: any) {
      setError(e?.message || 'No se pudo crear el montaje');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (role !== 'ADMIN') return <div className="p-6">Solo un administrador puede crear montajes.</div>;

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-5">
      <div><h1 className="text-2xl font-semibold">Nuevo montaje</h1><p className="text-sm text-gray-600">Se creará una orden de servicio y una copia del procedimiento seleccionado.</p></div>
      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div> : null}

      <div className="space-y-1">
        <label className="text-sm font-medium">Equipo</label>
        <AssetSearchSelect value={assetCode} onChange={setAssetCode} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Plantilla de montaje</label>
        <select className="border rounded px-3 py-2 w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Seleccionar…</option>
          {(templates || []).map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}
        </select>
        {!templates?.length ? <p className="text-xs text-amber-700">Primero debes crear una plantilla de montaje.</p> : null}
      </div>

      {selected ? (
        <div className="grid grid-cols-3 gap-3 border rounded p-3 text-sm bg-gray-50">
          <div><div className="text-xs text-gray-500">Actividades</div>{selected.steps.length}</div>
          <div><div className="text-xs text-gray-500">Duración</div>{minutesLabel(planned)}</div>
          <div><div className="text-xs text-gray-500">Horas-hombre</div>{minutesLabel(labor)}</div>
        </div>
      ) : null}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-1"><label className="text-sm font-medium">Título opcional</label><input className="border rounded px-3 py-2 w-full" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1"><label className="text-sm font-medium">Inicio programado</label><input type="datetime-local" className="border rounded px-3 py-2 w-full" value={scheduledStartAt} onChange={(e) => setScheduledStartAt(e.target.value)} required /></div>
      </div>
      <div className="space-y-1"><label className="text-sm font-medium">Descripción</label><textarea className="border rounded px-3 py-2 w-full min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></div>

      <fieldset className="border rounded-lg p-4 space-y-3">
        <legend className="px-1 font-medium">Calendario laboral</legend>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm space-y-1"><span className="block">Zona horaria</span><select className="border rounded px-3 py-2 w-full" value={scheduleTimezone} onChange={(e) => setScheduleTimezone(e.target.value)}><option value="America/Bogota">Bogotá</option><option value="America/Lima">Lima</option><option value="America/Mexico_City">Ciudad de México</option><option value="America/Santiago">Santiago</option><option value="America/Argentina/Buenos_Aires">Buenos Aires</option><option value="UTC">UTC</option></select></label>
          <label className="text-sm space-y-1"><span className="block">Inicio jornada</span><input type="time" className="border rounded px-3 py-2 w-full" value={workdayStart} onChange={(e) => setWorkdayStart(e.target.value)} /></label>
          <label className="text-sm space-y-1"><span className="block">Fin jornada</span><input type="time" className="border rounded px-3 py-2 w-full" value={workdayEnd} onChange={(e) => setWorkdayEnd(e.target.value)} /></label>
        </div>
        <div className="space-y-1"><div className="text-sm">Días laborables</div><div className="flex flex-wrap gap-2">{weekDays.map((day) => <label key={day.value} className="border rounded px-2.5 py-1.5 text-sm"><input className="mr-1.5" type="checkbox" checked={workingDays.includes(day.value)} onChange={(event) => setWorkingDays((current) => event.target.checked ? [...current, day.value] : current.filter((value) => value !== day.value))} />{day.label}</label>)}</div></div>
        <label className="text-sm space-y-1 block"><span className="block">Fechas no laborables</span><textarea className="border rounded px-3 py-2 w-full min-h-16" value={excludedDates} onChange={(e) => setExcludedDates(e.target.value)} placeholder="2026-12-08, 2026-12-25" /><span className="text-xs text-gray-500">Separadas por coma o salto de línea, en formato AAAA-MM-DD.</span></label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Técnicos asignados</legend>
        <div className="grid md:grid-cols-2 gap-2">
          {(technicians || []).map((user) => (
            <label key={user.id} className="border rounded p-3 flex gap-2 items-center text-sm">
              <input type="checkbox" checked={technicianIds.includes(user.id)} onChange={(e) => setTechnicianIds((prev) => e.target.checked ? [...prev, user.id] : prev.filter((id) => id !== user.id))} />
              <span>{user.name}<span className="block text-xs text-gray-500">{user.email}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2 justify-end">
        <button className="border rounded px-4 py-2" type="button" onClick={() => router.back()}>Cancelar</button>
        <button className="rounded px-4 py-2 bg-black text-white disabled:opacity-50" disabled={!assetCode || !templateId || !scheduledStartAt || !workingDays.length || timeMinutes(workdayEnd) <= timeMinutes(workdayStart) || busy} onClick={submit}>{busy ? 'Creando…' : 'Crear montaje'}</button>
      </div>
    </div>
  );
}
