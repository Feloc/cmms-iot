'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AssetSearchSelect } from '@/components/AssetSearchSelect';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { type AssemblyTemplate, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';

type User = { id: string; name: string; email: string; role: string };

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
  const [dueDate, setDueDate] = useState('');
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = templates?.find((item) => item.id === templateId);
  const planned = selected?.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0) || 0;
  const labor = selected?.steps.reduce((sum, step) => sum + step.estimatedMinutes * step.plannedTechnicians, 0) || 0;

  async function submit() {
    if (!assetCode || !templateId || !auth.token || !auth.tenantSlug) return;
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<{ id: string }>('/assemblies', {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug,
        body: {
          assetCode, templateId, technicianIds,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
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
        <div className="space-y-1"><label className="text-sm font-medium">Fecha programada</label><input type="datetime-local" className="border rounded px-3 py-2 w-full" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
      </div>
      <div className="space-y-1"><label className="text-sm font-medium">Descripción</label><textarea className="border rounded px-3 py-2 w-full min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} /></div>

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
        <button className="rounded px-4 py-2 bg-black text-white disabled:opacity-50" disabled={!assetCode || !templateId || busy} onClick={submit}>{busy ? 'Creando…' : 'Crear montaje'}</button>
      </div>
    </div>
  );
}
