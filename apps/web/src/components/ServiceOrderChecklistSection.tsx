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

type AuditUser = { id: string; name: string; email: string; role: string };
type AuditEntry = {
  at: string;
  byUserId: string;
  field: string;
  part?: string | null;
  from?: any;
  to?: any;
  user?: AuditUser | null;
};

function canonLabel(s: string) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toChecklistState(
  template: ChecklistTemplate,
  existing?: ChecklistState | null,
  legacyChecked?: Record<string, boolean> | null,
): ChecklistState {
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
  const [dirty, setDirty] = useState(false);

  // Guardamos en formData.notes + formData.result (para alinear con el detalle actual)
  const [notes, setNotes] = useState<string>(initialFormData?.notes ?? '');
  const [result, setResult] = useState<string>(initialFormData?.result ?? '');

  useEffect(() => {
    if (dirty) return;
    setNotes(initialFormData?.notes ?? '');
    setResult(initialFormData?.result ?? '');
  }, [dirty, initialFormData?.notes, initialFormData?.result]);

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
    if (dirty) return;

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
      const legacyChecked =
        initialFormData?.checked && typeof initialFormData.checked === 'object'
          ? (initialFormData.checked as Record<string, boolean>)
          : null;
      setChecklist(toChecklistState(t, existing, legacyChecked));
      return;
    }
  }, [
    enabled,
    dirty,
    soType,
    initialFormData,
    resolvedAlistamientoTemplate.key,
    resolvedAlistamientoTemplate.items.length,
    preventivoTemplate?.items.length,
  ]);

  async function save() {
    if (!enabled) return;
    if (!auth.token || !auth.tenantSlug) return;
    if (!checklist) {
      setErr('Checklist no inicializado (recarga la OS e intenta de nuevo).');
      return;
    }

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
      setDirty(false);
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

  const checkedByLabel = useMemo(() => {
    const fd = initialFormData && typeof initialFormData === 'object' ? initialFormData : {};
    const raw = Array.isArray((fd as any)?._audit) ? ((fd as any)._audit as AuditEntry[]) : [];

    const exact = new Map<string, { name: string; at: string }>();
    const canon = new Map<string, { name: string; at: string }>();
    if (!raw.length) return { exact, canon };

    const acceptKeys = Array.from(
      new Set(
        [soType, checklist?.templateKey, soType === 'PREVENTIVO' ? 'PM_PLAN' : null, soType === 'ALISTAMIENTO' ? resolvedAlistamientoTemplate.key : null]
          .filter(Boolean)
          .map((k) => String(k)),
      ),
    );
    const acceptKeysLc = new Set(acceptKeys.map((k) => k.toLowerCase()));
    const suffix = '.done';

    // raw está en orden cronológico; recorremos al revés para quedarnos con el último "check" por item.
    for (let i = raw.length - 1; i >= 0; i--) {
      const a = raw[i];
      if (!a || a.field !== 'formData') continue;
      const part = typeof a.part === 'string' ? a.part : '';
      if (!part.toLowerCase().startsWith('checklists.') || !part.endsWith(suffix)) continue;
      if (!(a.to === true || a.to === 'true' || a.to === 1 || a.to === '1')) continue; // solo cuando queda marcado

      const withoutSuffix = part.slice(0, part.length - suffix.length); // checklists.<key>.<label>
      const rest = withoutSuffix.slice('checklists.'.length);
      const dot = rest.indexOf('.');
      if (dot <= 0) continue;
      const key = rest.slice(0, dot);
      if (!acceptKeysLc.has(key.toLowerCase())) continue;

      const label = rest.slice(dot + 1);
      if (!label) continue;
      if (exact.has(label)) continue;

      const meta = { name: (a.user?.name ?? a.byUserId) as string, at: a.at };
      exact.set(label, meta);
      const c = canonLabel(label);
      if (c && !canon.has(c)) canon.set(c, meta);
    }

    return { exact, canon };
  }, [initialFormData, soType, checklist?.templateKey, resolvedAlistamientoTemplate.key]);

  if (!enabled) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-sm font-medium">
            {soType === 'ALISTAMIENTO' ? `Alistamiento · ${resolvedAlistamientoTemplate.name}` : 'Preventivo · PM Plan'}
          </div>
          <div className="text-xs text-gray-600">
            Marca: {asset.brand ?? '-'} · Modelo: {asset.model ?? '-'}
          </div>
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
        {(checklist?.items ?? []).map((it, idx) => {
          const meta = it.done
            ? (checkedByLabel.exact.get(it.label) ?? checkedByLabel.canon.get(canonLabel(it.label)))
            : null;

          return (
            <div key={idx} className="border rounded p-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!it.done}
                  onChange={(e) => {
                    const done = e.target.checked;
                    setDirty(true);
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
                    {meta?.name ? <span className="text-xs text-gray-600"> · {meta.name}</span> : null}
                  </div>
                  <input
                    className="mt-1 w-full border rounded px-2 py-1 text-sm"
                    placeholder="Nota / lectura / comentario (opcional)"
                    value={it.notes ?? ''}
                    onChange={(e) => {
                      const notes = e.target.value;
                      setDirty(true);
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
          );
        })}
      </div>

      {/* Observaciones + resultado visibles para ALISTAMIENTO y PREVENTIVO */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Resultado</label>
          <input
            className="w-full border rounded px-2 py-1"
            placeholder="Ej: Aprobado / Requiere ajuste"
            value={result}
            onChange={(e) => {
              setDirty(true);
              setResult(e.target.value);
            }}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">Observaciones</label>
          <textarea
            className="w-full border rounded px-2 py-1"
            rows={3}
            placeholder="Observaciones del técnico…"
            value={notes}
            onChange={(e) => {
              setDirty(true);
              setNotes(e.target.value);
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
          disabled={saving || !auth.token || !auth.tenantSlug}
          onClick={save}
          type="button"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
