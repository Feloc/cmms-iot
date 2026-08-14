'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { type AssemblyTemplate, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';

type StepDraft = { phase: string; name: string; instructions: string; estimatedMinutes: number; plannedTechnicians: number; required: boolean; evidenceRequired: boolean };
const blankStep = (): StepDraft => ({ phase: '', name: '', instructions: '', estimatedMinutes: 60, plannedTechnicians: 1, required: true, evidenceRequired: false });

export default function AssemblyTemplatesPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role;
  const { data, mutate } = useApiSWR<AssemblyTemplate[]>('/assemblies/templates', auth.token, auth.tenantSlug);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([blankStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function patchStep(index: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  }

  async function create() {
    if (!auth.token || !auth.tenantSlug) return;
    setBusy(true); setError('');
    try {
      await apiFetch('/assemblies/templates', {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug,
        body: { code, name, description, brand, model, steps },
      });
      setCode(''); setName(''); setDescription(''); setBrand(''); setModel(''); setSteps([blankStep()]); setShowForm(false);
      await mutate();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la plantilla');
    } finally { setBusy(false); }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (role !== 'ADMIN') return <div className="p-6">Solo administradores pueden gestionar plantillas.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Plantillas de montaje</h1><p className="text-sm text-gray-600">Procedimientos reutilizables por familia o modelo de equipo.</p></div>
        <button className="rounded px-3 py-2 bg-black text-white text-sm" onClick={() => setShowForm((value) => !value)}>{showForm ? 'Cerrar' : 'Nueva plantilla'}</button>
      </div>

      {showForm ? (
        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="font-semibold">Información de la plantilla</h2>
          {error ? <div className="bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div> : null}
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm space-y-1"><span className="font-medium">Código</span><input className="border rounded px-3 py-2 w-full" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MONT-CBD20" /></label>
            <label className="text-sm space-y-1"><span className="font-medium">Nombre</span><input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-sm space-y-1"><span className="font-medium">Marca</span><input className="border rounded px-3 py-2 w-full" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
            <label className="text-sm space-y-1"><span className="font-medium">Modelo o familia</span><input className="border rounded px-3 py-2 w-full" value={model} onChange={(e) => setModel(e.target.value)} /></label>
          </div>
          <label className="text-sm space-y-1 block"><span className="font-medium">Descripción</span><textarea className="border rounded px-3 py-2 w-full" value={description} onChange={(e) => setDescription(e.target.value)} /></label>

          <div className="space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-semibold">Actividades</h3><button className="border rounded px-3 py-1 text-sm" onClick={() => setSteps((value) => [...value, blankStep()])}>Agregar actividad</button></div>
            {steps.map((step, index) => (
              <div key={index} className="border rounded p-3 space-y-3 bg-gray-50">
                <div className="flex justify-between"><span className="font-medium text-sm">Paso {index + 1}</span>{steps.length > 1 ? <button className="text-xs text-red-700" onClick={() => setSteps((value) => value.filter((_, i) => i !== index))}>Quitar</button> : null}</div>
                <div className="grid md:grid-cols-2 gap-2">
                  <input className="border rounded px-3 py-2" placeholder="Etapa (opcional)" value={step.phase} onChange={(e) => patchStep(index, { phase: e.target.value })} />
                  <input className="border rounded px-3 py-2" placeholder="Nombre de la actividad" value={step.name} onChange={(e) => patchStep(index, { name: e.target.value })} />
                </div>
                <textarea className="border rounded px-3 py-2 w-full" placeholder="Instrucciones" value={step.instructions} onChange={(e) => patchStep(index, { instructions: e.target.value })} />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <label>Minutos<input type="number" min="1" className="border rounded px-2 py-1 w-full" value={step.estimatedMinutes} onChange={(e) => patchStep(index, { estimatedMinutes: Number(e.target.value) })} /></label>
                  <label>Técnicos<input type="number" min="1" className="border rounded px-2 py-1 w-full" value={step.plannedTechnicians} onChange={(e) => patchStep(index, { plannedTechnicians: Number(e.target.value) })} /></label>
                  <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={step.required} onChange={(e) => patchStep(index, { required: e.target.checked })} />Obligatoria</label>
                  <label className="flex items-center gap-2 pt-5"><input type="checkbox" checked={step.evidenceRequired} onChange={(e) => patchStep(index, { evidenceRequired: e.target.checked })} />Evidencia</label>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end"><button className="rounded px-4 py-2 bg-black text-white disabled:opacity-50" disabled={busy || !code.trim() || !name.trim() || steps.some((step) => !step.name.trim())} onClick={create}>{busy ? 'Guardando…' : 'Guardar plantilla'}</button></div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {(data || []).map((template) => {
          const duration = template.steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);
          const labor = template.steps.reduce((sum, step) => sum + step.estimatedMinutes * step.plannedTechnicians, 0);
          return <div className="border rounded-lg p-4 space-y-2" key={template.id}>
            <div className="flex justify-between gap-2"><div><div className="font-semibold">{template.name}</div><div className="text-xs text-gray-500">{template.code} · versión {template.version}</div></div><span className={`text-xs px-2 py-1 rounded-full h-fit ${template.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100'}`}>{template.active ? 'Activa' : 'Inactiva'}</span></div>
            <div className="text-sm text-gray-600">{template.brand || 'Todas las marcas'} · {template.model || 'Todos los modelos'}</div>
            <div className="flex gap-4 text-sm"><span>{template.steps.length} actividades</span><span>{minutesLabel(duration)} calendario</span><span>{minutesLabel(labor)} HH</span></div>
          </div>;
        })}
      </div>
    </div>
  );
}
