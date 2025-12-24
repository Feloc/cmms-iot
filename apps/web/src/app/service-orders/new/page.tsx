'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { AssetSearchSelect } from '@/components/AssetSearchSelect';

type PmPlan = {
  id: string;
  name: string;
  intervalHours?: number | null;
  defaultDurationMin?: number | null;
  description?: string | null;
};

type ServiceOrderType = 'ALISTAMIENTO' | 'DIAGNOSTICO' | 'PREVENTIVO' | 'CORRECTIVO' | 'ENTREGA' | 'OTRO';

export default function NewServiceOrderPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [assetCode, setAssetCode] = useState('');
  const [type, setType] = useState<ServiceOrderType>('DIAGNOSTICO');
  const [pmPlanId, setPmPlanId] = useState('');
  const [dueLocal, setDueLocal] = useState('');

  // Calendar duration (minutes)
  const [durationMin, setDurationMin] = useState<number>(60);
  const [durationTouched, setDurationTouched] = useState(false);

  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);

  const [description, setDescription] = useState('');
  const [descTouched, setDescTouched] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: pmPlans } = useApiSWR<PmPlan[]>(`/pm-plans`, auth.token, auth.tenantSlug);

  const selectedPmPlan = useMemo(() => {
    if (!pmPlanId) return null;
    return (pmPlans ?? []).find((p) => p.id === pmPlanId) ?? null;
  }, [pmPlans, pmPlanId]);

  // Si cambia el tipo y deja de ser PREVENTIVO, limpiamos pmPlanId y valores auto.
  useEffect(() => {
    if (type !== 'PREVENTIVO') {
      setPmPlanId('');
      if (!durationTouched) setDurationMin(60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Autofill desde el PM Plan (duración + título/descripcion sugeridos) sin pisar cambios manuales.
  useEffect(() => {
    if (type !== 'PREVENTIVO') return;
    if (!selectedPmPlan) return;

    const planDur = selectedPmPlan.defaultDurationMin ?? 60;
    if (!durationTouched) setDurationMin(planDur);

    // Sugerencia de título: PM {interval}h - {assetCode} (o nombre del plan)
    if (!titleTouched) {
      const base = selectedPmPlan.intervalHours ? `PM ${selectedPmPlan.intervalHours}h` : selectedPmPlan.name;
      const a = assetCode.trim();
      setTitle(a ? `${base} - ${a}` : base);
    }

    // Sugerencia de descripción desde plan (si existe) y si no la tocó el usuario
    if (!descTouched) {
      const d = (selectedPmPlan.description ?? '').trim();
      if (d) setDescription(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, selectedPmPlan?.id, assetCode]);

  const requirePmPlan = type === 'PREVENTIVO';
  const canSubmit =
    assetCode.trim().length > 0 &&
    !!type &&
    !busy &&
    (!requirePmPlan || (requirePmPlan && !!pmPlanId));

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string }>(`/service-orders`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: {
          assetCode,
          serviceOrderType: type,
          pmPlanId: type === 'PREVENTIVO' ? (pmPlanId || undefined) : undefined,
          dueDate: dueLocal ? new Date(dueLocal).toISOString() : undefined,
          durationMin: Number.isFinite(durationMin) ? Math.max(15, Math.round(durationMin)) : undefined,
          title: title?.trim() ? title.trim() : undefined,
          description: description?.trim() ? description.trim() : undefined,
        },
      });
      router.push(`/service-orders/${res.id}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Nueva Orden de Servicio</h1>

      {err && <div className="p-3 border rounded text-red-700 bg-red-50">{err}</div>}

      <div className="space-y-1">
        <label className="text-sm font-medium">Activo (buscar por cliente / serie / código)</label>
        <AssetSearchSelect value={assetCode} onChange={(code) => setAssetCode(code)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Tipo de OS</label>
          <select className="border rounded px-3 py-2 w-full" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="ALISTAMIENTO">Alistamiento</option>
            <option value="DIAGNOSTICO">Diagnóstico</option>
            <option value="PREVENTIVO">Mtto preventivo</option>
            <option value="CORRECTIVO">Mtto correctivo</option>
            <option value="ENTREGA">Entrega</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Fecha/hora ejecución (opcional)</label>
          <input
            type="datetime-local"
            className="border rounded px-3 py-2 w-full"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Duración planificada (min)</label>
          <input
            type="number"
            min={15}
            step={15}
            className="border rounded px-3 py-2 w-full"
            value={String(durationMin)}
            onChange={(e) => {
              setDurationTouched(true);
              setDurationMin(Number(e.target.value));
            }}
          />
          <p className="text-xs text-gray-600">Se usa para el calendario (resize y agenda).</p>
        </div>

        {type === 'PREVENTIVO' ? (
          <div className="space-y-1">
            <label className="text-sm font-medium">Plan preventivo (PM Plan)</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={pmPlanId}
              onChange={(e) => {
                setPmPlanId(e.target.value);
              }}
            >
              <option value="">(seleccionar)</option>
              {(pmPlans ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.intervalHours ? ` (${p.intervalHours}h)` : ''}
                </option>
              ))}
            </select>

            <div className="text-xs text-gray-600 flex items-center gap-2">
              <span>Administra planes en</span>
              <a className="underline" href="/pm-plans">
                /pm-plans
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <label className="text-sm font-medium">PM Plan</label>
            <div className="text-sm text-gray-500 border rounded px-3 py-2">Solo aplica para Preventivo</div>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Título (opcional)</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={title}
          onChange={(e) => {
            setTitleTouched(true);
            setTitle(e.target.value);
          }}
        />
        {type === 'PREVENTIVO' && selectedPmPlan ? (
          <p className="text-xs text-gray-600">
            Sugerido desde PM Plan: <span className="font-mono">{selectedPmPlan.name}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Descripción (opcional)</label>
        <textarea
          className="border rounded px-3 py-2 w-full"
          rows={4}
          value={description}
          onChange={(e) => {
            setDescTouched(true);
            setDescription(e.target.value);
          }}
        />
      </div>

      <button disabled={!canSubmit} className="px-4 py-2 border rounded disabled:opacity-50" onClick={submit}>
        {busy ? 'Creando...' : 'Crear OS'}
      </button>

      {type === 'PREVENTIVO' && !pmPlanId ? (
        <div className="text-xs text-amber-700 bg-amber-50 border rounded p-2">
          Para Preventivo debes seleccionar un <b>PM Plan</b> (200h, 600h, 1200h, etc.).
        </div>
      ) : null}
    </div>
  );
}
