'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Measurement = {
  id: string;
  type: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit?: string | null;
  phase: 'BEFORE'|'AFTER'|'OTHER';
  takenAt: string;
};

export default function MeasurementsPanel({ woId }: { woId: string }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const { data, error, isLoading, mutate } = useApiSWR<Measurement[]>(
    token && tenantSlug ? `/work-orders/${woId}/measurements` : null,
    token, tenantSlug
  );

  const [form, setForm] = useState<Partial<Measurement>>({ phase: 'OTHER' });

  const add = async () => {
    try {
      await apiFetch(`/work-orders/${woId}/measurements`, {
        method: 'POST', token, tenantSlug,
        body: {
          type: form.type,
          valueNumeric: form.valueNumeric ?? undefined,
          valueText: form.valueText ?? undefined,
          unit: form.unit ?? undefined,
          phase: form.phase ?? 'OTHER',
          takenAt: form.takenAt ?? undefined,
        }
      });
      setForm({ phase: 'OTHER' });
      mutate();
    } catch (e:any) { alert(e.message || 'Error guardando medición'); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar medición?')) return;
    try {
      await apiFetch(`/work-orders/${woId}/measurements/${id}`, { method:'DELETE', token, tenantSlug });
      mutate();
    } catch (e:any) { alert(e.message || 'Error eliminando medición'); }
  };

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error: {(error as any).message}</div>;

  const measurements = data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-5 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-gray-600">Tipo</label>
          <input className="border rounded w-full px-3 py-2" value={form.type ?? ''} onChange={e=>setForm(f=>({ ...f, type: e.target.value }))}/>
        </div>
        <div>
          <label className="text-xs text-gray-600">Valor num.</label>
          <input type="number" className="border rounded w-full px-3 py-2" value={form.valueNumeric ?? ''} onChange={e=>setForm(f=>({ ...f, valueNumeric: e.target.value===''?undefined:Number(e.target.value) }))}/>
        </div>
        <div>
          <label className="text-xs text-gray-600">Unidad</label>
          <input className="border rounded w-full px-3 py-2" value={form.unit ?? ''} onChange={e=>setForm(f=>({ ...f, unit: e.target.value }))}/>
        </div>
        <div>
          <label className="text-xs text-gray-600">Fase</label>
          <select className="border rounded w-full px-3 py-2" value={form.phase ?? 'OTHER'} onChange={e=>setForm(f=>({ ...f, phase: e.target.value as any }))}>
            <option value="BEFORE">Antes</option>
            <option value="AFTER">Después</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        <div className="md:col-span-5">
          <label className="text-xs text-gray-600">Valor texto (opcional)</label>
          <input className="border rounded w-full px-3 py-2" value={form.valueText ?? ''} onChange={e=>setForm(f=>({ ...f, valueText: e.target.value }))}/>
        </div>
        <div className="md:col-span-5">
          <button onClick={add} className="px-3 py-2 rounded bg-black text-white">Agregar</button>
        </div>
      </div>

      <div className="grid gap-2">
        {measurements.map(m => (
          <div key={m.id} className="border rounded p-2 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{m.type} {m.unit ? `(${m.unit})` : ''} — {m.phase}</div>
              <div className="text-gray-600">
                {m.valueNumeric != null ? m.valueNumeric : m.valueText ?? '—'} • {new Date(m.takenAt).toLocaleString()}
              </div>
            </div>
            <button onClick={()=>remove(m.id)} className="px-2 py-1 border rounded">Eliminar</button>
          </div>
        ))}
        {measurements.length===0 && <div className="text-sm text-gray-500">Sin mediciones</div>}
      </div>
    </div>
  );
}
