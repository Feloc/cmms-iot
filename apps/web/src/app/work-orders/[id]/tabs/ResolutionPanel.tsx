'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import CodeAutocomplete from '@/components/CodeAutocomplete';

type Resolution = {
  id?: string;
  workOrderId: string;
  symptomCodeId?: string | null;
  symptomOther?: string | null;
  causeCodeId?: string | null;
  causeOther?: string | null;
  rootCauseText?: string | null;
  remedyCodeId?: string | null;
  remedyOther?: string | null;
  solutionSummary?: string | null;
  preventiveRecommendation?: string | null;
  resolvedAt?: string | null;
  symptomCode?: { id:string; code:string; name:string } | null;
  causeCode?:   { id:string; code:string; name:string } | null;
  remedyCode?:  { id:string; code:string; name:string } | null;
  symptomLabel?: string | null;
  causeLabel?:   string | null;
  remedyLabel?:  string | null;
};

export default function ResolutionPanel({ woId, onSaved }: { woId: string; onSaved?: () => void }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const { data, error, isLoading, mutate } = useApiSWR<Resolution>(
    token && tenantSlug ? `/work-orders/${woId}/resolution` : null,
    token,
    tenantSlug
  );

  const [form, setForm] = useState<Partial<Resolution>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm({}); }, [woId]);

  const savedHasCause = !!(data?.causeCodeId || data?.causeOther);
  const savedHasRemedy = !!(data?.remedyCodeId || data?.remedyOther);

  const res = useMemo(() => ({ ...data, ...form }), [data, form]);
  const draftHasCause = !!(res.causeCodeId || res.causeOther);
  const draftHasRemedy = !!(res.remedyCodeId || res.remedyOther);

  const dirty =
    (form.symptomCodeId !== undefined) ||
    (form.symptomOther !== undefined) ||
    (form.causeCodeId !== undefined) ||
    (form.causeOther !== undefined) ||
    (form.rootCauseText !== undefined) ||
    (form.remedyCodeId !== undefined) ||
    (form.remedyOther !== undefined) ||
    (form.solutionSummary !== undefined) ||
    (form.preventiveRecommendation !== undefined);

  const save = async () => {
    try {
      setSaving(true);
      await apiFetch(`/work-orders/${woId}/resolution`, {
        method: 'PUT',
        token, tenantSlug,
        body: {
          symptomCodeId: res.symptomCodeId ?? undefined,
          symptomOther: res.symptomOther ?? undefined,
          causeCodeId: res.causeCodeId ?? undefined,
          causeOther: res.causeOther ?? undefined,
          rootCauseText: res.rootCauseText ?? undefined,
          remedyCodeId: res.remedyCodeId ?? undefined,
          remedyOther: res.remedyOther ?? undefined,
          solutionSummary: res.solutionSummary ?? undefined,
          preventiveRecommendation: res.preventiveRecommendation ?? undefined,
        },
      });
      await mutate();
      setForm({});
      onSaved?.();
    } catch (e: any) {
      alert(e.message || 'Error guardando resolución');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error: {(error as any).message}</div>;

  return (
    <div className="space-y-4">
      {/* Estado guardado vs borrador */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded ${savedHasCause ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          Guardado: {savedHasCause ? 'Causa OK' : 'Falta causa'}
        </span>
        <span className={`px-2 py-1 rounded ${savedHasRemedy ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          Guardado: {savedHasRemedy ? 'Acción OK' : 'Falta acción'}
        </span>
        {dirty && (
          <span className="px-2 py-1 rounded bg-amber-100 text-amber-700">
            Cambios sin guardar
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="font-semibold">Síntoma</h3>
          <CodeAutocomplete
            kind="symptom"
            label="Código de síntoma"
            valueId={res.symptomCodeId ?? null}
            onChangeId={(id)=>setForm(f=>({ ...f, symptomCodeId: id ?? null }))}
            otherText={res.symptomOther ?? null}
            onChangeOther={(t)=>setForm(f=>({ ...f, symptomOther: t ?? null }))}
          />
          <p className="text-m text-black-500">
            Guardado: {data?.symptomLabel ?? '—'}
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="font-semibold">Causa</h3>
          <CodeAutocomplete
            kind="cause"
            label="Código de causa"
            valueId={res.causeCodeId ?? null}
            onChangeId={(id)=>setForm(f=>({ ...f, causeCodeId: id ?? null }))}
            otherText={res.causeOther ?? null}
            onChangeOther={(t)=>setForm(f=>({ ...f, causeOther: t ?? null }))}
          />
          <p className="text-m text-black-500">
            Guardado: {data?.causeLabel ?? '—'}
          </p>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Causa raíz (5-Whys)</label>
            <textarea
              className="border rounded w-full px-3 py-2"
              defaultValue={res.rootCauseText ?? ''}
              onChange={(e)=>setForm(f=>({ ...f, rootCauseText: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Acción correctiva</h3>
        <CodeAutocomplete
          kind="remedy"
          label="Código de acción"
          valueId={res.remedyCodeId ?? null}
          onChangeId={(id)=>setForm(f=>({ ...f, remedyCodeId: id ?? null }))}
          otherText={res.remedyOther ?? null}
          onChangeOther={(t)=>setForm(f=>({ ...f, remedyOther: t ?? null }))}
          />
          <p className="text-m text-black-500">
            Guardado: {data?.remedyLabel ?? '—'}
          </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Resumen de solución</label>
            <textarea
              className="border rounded w-full px-3 py-2"
              defaultValue={res.solutionSummary ?? ''}
              onChange={(e)=>setForm(f=>({ ...f, solutionSummary: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-600">Recomendación preventiva</label>
            <textarea
              className="border rounded w-full px-3 py-2"
              defaultValue={res.preventiveRecommendation ?? ''}
              onChange={(e)=>setForm(f=>({ ...f, preventiveRecommendation: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar resolución'}
        </button>
        {!draftHasCause || !draftHasRemedy ? (
          <span className="text-xs text-red-600 self-center">
            Para completar la OT necesitas **Causa** y **Acción**. Guarda antes de completar.
          </span>
        ) : null}
      </div>
    </div>
  );
}
