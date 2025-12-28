'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { resolveAlistamientoTemplate, type ChecklistTemplate } from '@/lib/alistamientoChecklistTemplates';

type ChecklistItem = {
  label: string;
  required?: boolean;
  done: boolean;
  notes?: string | null;
};

type ChecklistState = {
  templateKey: string;
  templateName: string;
  items: ChecklistItem[];
};

function toChecklistState(template: ChecklistTemplate, existing?: ChecklistState | null, legacyChecked?: Record<string, boolean> | null): ChecklistState {
  // Reusar existente si corresponde al template
  if (existing?.templateKey === template.key && Array.isArray(existing.items) && existing.items.length) {
    const byLabel = new Map(existing.items.map((i) => [i.label, i]));
    const merged = template.items.map((t) => {
      const prev = byLabel.get(t.label);
      return {
        label: t.label,
        required: !!t.required,
        done: prev?.done ?? false,
        notes: prev?.notes ?? '',
      };
    });
    return { templateKey: template.key, templateName: template.name, items: merged };
  }

  // Migración simple desde legacy fd.checked (preventivo antiguo)
  if (legacyChecked && Object.keys(legacyChecked).length) {
    return {
      templateKey: template.key,
      templateName: template.name,
      items: template.items.map((t) => ({
        label: t.label,
        required: !!t.required,
        done: !!legacyChecked[t.label],
        notes: '',
      })),
    };
  }

  return {
    templateKey: template.key,
    templateName: template.name,
    items: template.items.map((t) => ({ label: t.label, required: !!t.required, done: false, notes: '' })),
  };
}

function getChecklistFromFormData(formData: any, type: string): ChecklistState | null {
  const s = formData?.checklists?.[type];
  if (!s) return null;
  if (typeof s !== 'object') return null;
  if (!Array.isArray((s as any).items)) return null;
  return s as ChecklistState;
}

export function ServiceOrderChecklistSection({
  soId,
  soType,
  asset,
  pmChecklist,
  initialFormData,
  onSaved,
}: {
  soId: string;
  soType: 'ALISTAMIENTO' | 'PREVENTIVO' | string;
  asset: { brand?: string | null; model?: string | null };
  /** Preventivo: checklist JSON del pmPlan (si aplica) */
  pmChecklist?: any;
  initialFormData?: any;
  onSaved?: (nextFormData: any) => void;
}) {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const enabled = soType === 'ALISTAMIENTO' || soType === 'PREVENTIVO';

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>('');

  // Guardamos en formData.notes + formData.result (para alinear con el detalle actual)
  const [notes, setNotes] = useState<string>(initialFormData?.notes ?? '');
  const [result, setResult] = useState<string>(initialFormData?.result ?? '');

  const [checklist, setChecklist] = useState<ChecklistState | null>(null);

  const resolvedAlistamientoTemplate = useMemo(() => resolveAlistamientoTemplate(asset), [asset.brand, asset.model]);

  // Preventivo: convertir pmChecklist a template "virtual"
  const preventivoTemplate: ChecklistTemplate | null = useMemo(() => {
    if (soType !== 'PREVENTIVO') return null;
    const raw = Array.isArray(pmChecklist) ? pmChecklist : Array.isArray(pmChecklist?.items) ? pmChecklist.items : [];
    const normalized = raw
      .map((x: any) => {
        if (!x) return null;
        if (typeof x === 'string') return { label: x, required: false };
        if (typeof x.label === 'string') return { label: x.label, required: !!x.required };
        return null;
      })
      .filter(Boolean);

    return {
      key: 'PM_PLAN',
      name: 'Checklist preventivo (PM Plan)',
      items: normalized.length ? normalized : [{ label: 'Checklist no configurado en PM Plan', required: false }],
    };
  }, [soType, pmChecklist]);

  // Inicializa checklist desde formData
  useEffect(() => {
    if (!enabled) return;

    if (soType === 'ALISTAMIENTO') {
      const t = resolvedAlistamientoTemplate;
      const existing = getChecklistFromFormData(initialFormData, soType);
      setChecklist(toChecklistState(t, existing, null));
      return;
    }

    if (soType === 'PREVENTIVO') {
      const t = preventivoTemplate;
      if (!t) return;
      const existing = getChecklistFromFormData(initialFormData, soType);
      const legacyChecked = (initialFormData?.checked && typeof initialFormData.checked === 'object') ? (initialFormData.checked as Record<string, boolean>) : null;
      setChecklist(toChecklistState(t, existing, legacyChecked));
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, soType, resolvedAlistamientoTemplate.key, preventivoTemplate?.items?.length]);

  async function save() {
    if (!enabled) return;
    if (!auth.token || !auth.tenantSlug) return;

    setSaving(true);
    setErr('');
    try {
      const nextFormData = {
        ...(initialFormData ?? {}),
        notes,
        result,
        checklists: {
          ...((initialFormData?.checklists as any) ?? {}),
          [soType]: checklist,
        },
      };

      // OJO: en tu app actual el endpoint usado es /form
      await apiFetch(`/service-orders/${soId}/form`, {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: { formData: nextFormData },
      });

      onSaved?.(nextFormData);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  const progress = useMemo(() => {
    if (!checklist?.items?.length) return { done: 0, total: 0, reqPending: 0 };
    const total = checklist.items.length;
    const done = checklist.items.filter((i) => i.done).length;
    const reqPending = checklist.items.filter((i) => i.required && !i.done).length;
    return { done, total, reqPending };
  }, [checklist]);

  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">
            {soType === 'ALISTAMIENTO'
              ? `Alistamiento · ${resolvedAlistamientoTemplate.name}`
              : 'Preventivo · PM Plan'}
          </div>
          <div className="text-xs text-gray-600">Marca: {asset.brand ?? '-'} · Modelo: {asset.model ?? '-'}</div>
        </div>

        <div className="text-xs text-gray-700">
          {progress.total ? (
            <span>
              {progress.done}/{progress.total} · Pendientes requeridos: {progress.reqPending}
            </span>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 bg-red-50 border rounded p-2">{err}</div> : null}

      <div className="space-y-2">
        {(checklist?.items ?? []).map((it, idx) => (
          <div key={idx} className="border rounded p-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={!!it.done}
                onChange={(e) => {
                  const done = e.target.checked;
                  setChecklist((s) => {
                    if (!s) return s;
                    const items = [...s.items];
                    items[idx] = { ...items[idx], done };
                    return { ...s, items };
                  });
                }}
              />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {it.label} {it.required ? <span className="text-xs text-red-600">(requerido)</span> : null}
                </div>
                <input
                  className="mt-1 w-full border rounded px-2 py-1 text-sm"
                  placeholder="Nota / lectura / comentario (opcional)"
                  value={it.notes ?? ''}
                  onChange={(e) => {
                    const notes = e.target.value;
                    setChecklist((s) => {
                      if (!s) return s;
                      const items = [...s.items];
                      items[idx] = { ...items[idx], notes };
                      return { ...s, items };
                    });
                  }}
                />
              </div>
            </label>
          </div>
        ))}
      </div>

      {/* Observaciones + resultado visibles para ALISTAMIENTO y PREVENTIVO */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Resultado</label>
          <input
            className="w-full border rounded px-2 py-1"
            placeholder="Ej: Aprobado / Requiere ajuste"
            value={result}
            onChange={(e) => setResult(e.target.value)}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Observaciones</label>
          <textarea
            className="w-full border rounded px-2 py-1"
            rows={3}
            placeholder="Observaciones del técnico…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
          disabled={saving || !auth.token || !auth.tenantSlug}
          onClick={save}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
