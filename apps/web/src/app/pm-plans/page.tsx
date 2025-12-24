'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

type PmPlan = {
  id: string;
  name: string;
  intervalHours: number;
  description?: string | null;
  defaultDurationMin?: number | null;
  checklist?: any;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export default function PmPlansPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const { data, mutate, isLoading, error } = useApiSWR<PmPlan[]>('/pm-plans?all=1', auth.token, auth.tenantSlug);

  const [selectedId, setSelectedId] = useState<string>('');
  const selected = useMemo(() => (data ?? []).find((p) => p.id === selectedId) ?? null, [data, selectedId]);

  const [form, setForm] = useState({
    name: '',
    intervalHours: 200,
    defaultDurationMin: 120,
    description: '',
    active: true,
    checklistText: '[]',
  });

  function loadToForm(p: PmPlan) {
    setForm({
      name: p.name ?? '',
      intervalHours: p.intervalHours ?? 200,
      defaultDurationMin: p.defaultDurationMin ?? 120,
      description: p.description ?? '',
      active: p.active ?? true,
      checklistText: JSON.stringify(p.checklist ?? [], null, 2),
    });
  }

  async function createPlan() {
    const checklist = safeJson(form.checklistText);
    await apiFetch('/pm-plans', {
      method: 'POST',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: {
        name: form.name,
        intervalHours: Number(form.intervalHours),
        defaultDurationMin: Number(form.defaultDurationMin),
        description: form.description || null,
        active: !!form.active,
        checklist,
      },
    });
    setForm({ ...form, name: '', description: '' });
    await mutate();
  }

  async function updatePlan() {
    if (!selected) return;
    const checklist = safeJson(form.checklistText);
    await apiFetch(`/pm-plans/${selected.id}`, {
      method: 'PATCH',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: {
        name: form.name,
        intervalHours: Number(form.intervalHours),
        defaultDurationMin: Number(form.defaultDurationMin),
        description: form.description || null,
        active: !!form.active,
        checklist,
      },
    });
    await mutate();
  }

  async function deactivatePlan() {
    if (!selected) return;
    await apiFetch(`/pm-plans/${selected.id}`, {
      method: 'DELETE',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
    });
    setSelectedId('');
    await mutate();
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error cargando PM plans.</div>;

  const plans = data ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">PM Plans</div>
          <div className="text-sm text-gray-600">Planes preventivos por horas (200h, 600h, 1200h...).</div>
        </div>
        <a className="px-3 py-2 border rounded" href="/service-orders">
          Volver
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="border rounded p-3">
          <div className="font-semibold">Planes</div>
          <div className="mt-2 space-y-2">
            {plans.length === 0 ? (
              <div className="text-sm text-gray-600">No hay planes.</div>
            ) : (
              plans.map((p) => (
                <button
                  key={p.id}
                  className={
                    'w-full text-left border rounded p-2 hover:bg-gray-50 ' +
                    (selectedId === p.id ? 'bg-gray-50 border-black' : '')
                  }
                  onClick={() => {
                    setSelectedId(p.id);
                    loadToForm(p);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-600">{p.intervalHours}h</div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Duración: {p.defaultDurationMin ?? 60} min · {p.active ? 'Activo' : 'Inactivo'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="border rounded p-3 space-y-3">
          <div className="font-semibold">{selected ? 'Editar plan' : 'Nuevo plan'}</div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nombre" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
            <Field
              label="Intervalo (horas)"
              type="number"
              value={String(form.intervalHours)}
              onChange={(v) => setForm((s) => ({ ...s, intervalHours: Number(v) }))}
            />
            <Field
              label="Duración por defecto (min)"
              type="number"
              value={String(form.defaultDurationMin)}
              onChange={(v) => setForm((s) => ({ ...s, defaultDurationMin: Number(v) }))}
            />
            <div className="flex items-end gap-2">
              <label className="text-sm">Activo</label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Descripción</label>
            <textarea
              className="border rounded px-2 py-1 min-h-[70px]"
              value={form.description}
              onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm">Checklist (JSON)</label>
            <textarea
              className="border rounded px-2 py-1 font-mono text-xs min-h-[180px]"
              value={form.checklistText}
              onChange={(e) => setForm((s) => ({ ...s, checklistText: e.target.value }))}
            />
            <div className="text-xs text-gray-600">
              Ejemplo: <code>{`[{"label":"Revisar aceite","required":true}]`}</code>
            </div>
          </div>

          <div className="flex gap-2">
            {selected ? (
              <>
                <button className="px-3 py-2 border rounded bg-black text-white" onClick={updatePlan}>
                  Guardar cambios
                </button>
                <button className="px-3 py-2 border rounded" onClick={deactivatePlan}>
                  Desactivar
                </button>
                <button
                  className="px-3 py-2 border rounded"
                  onClick={() => {
                    setSelectedId('');
                    setForm({
                      name: '',
                      intervalHours: 200,
                      defaultDurationMin: 120,
                      description: '',
                      active: true,
                      checklistText: '[]',
                    });
                  }}
                >
                  Nuevo
                </button>
              </>
            ) : (
              <button className="px-3 py-2 border rounded bg-black text-white" onClick={createPlan}>
                Crear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm">{label}</label>
      <input className="border rounded px-2 py-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function safeJson(txt: string) {
  try {
    return JSON.parse(txt || '[]');
  } catch {
    return [];
  }
}
