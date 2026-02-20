'use client';

import React from 'react';
import { useAssetsDetail } from '../assets-detail.context';

type Unit = 'DAY' | 'MONTH' | 'YEAR';
type PmPlan = { id: string; name: string; intervalHours?: number | null; defaultDurationMin?: number | null; active?: boolean };
type FutureServiceOrder = { id: string; dueDate?: string | null; status?: string | null; title?: string | null; pmPlanId?: string | null };
type CompletedPreventiveOrder = {
  id: string;
  dueDate?: string | null;
  executedAt?: string | null;
  status?: string | null;
  title?: string | null;
  pmPlanId?: string | null;
};

function isoToDateInput(v?: string | null) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function unitLabel(u: Unit) {
  if (u === 'DAY') return 'Día(s)';
  if (u === 'MONTH') return 'Mes(es)';
  return 'Año(s)';
}

export default function MaintenancePlanTab({
  asset,
  onUpdated,
}: {
  asset: any;
  onUpdated?: () => void | Promise<void>;
}) {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const [pmPlans, setPmPlans] = React.useState<PmPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [generateResult, setGenerateResult] = React.useState<any>(null);
  const [futureOrders, setFutureOrders] = React.useState<FutureServiceOrder[]>([]);
  const [lastMaintenances, setLastMaintenances] = React.useState<CompletedPreventiveOrder[]>([]);
  const [loadingFutureOrders, setLoadingFutureOrders] = React.useState(false);

  const [pmPlanId, setPmPlanId] = React.useState('');
  const [frequencyValue, setFrequencyValue] = React.useState<number>(1);
  const [frequencyUnit, setFrequencyUnit] = React.useState<Unit>('MONTH');
  const [lastMaintenanceAt, setLastMaintenanceAt] = React.useState('');
  const [planningHorizonValue, setPlanningHorizonValue] = React.useState<number>(6);
  const [planningHorizonUnit, setPlanningHorizonUnit] = React.useState<Unit>('MONTH');
  const [active, setActive] = React.useState(true);

  const configuredPlan = asset?.maintenancePlan ?? null;

  React.useEffect(() => {
    setPmPlanId(String(configuredPlan?.pmPlanId ?? ''));
    setFrequencyValue(Number(configuredPlan?.frequencyValue ?? 1));
    setFrequencyUnit((String(configuredPlan?.frequencyUnit || 'MONTH').toUpperCase() as Unit) || 'MONTH');
    setLastMaintenanceAt(isoToDateInput(configuredPlan?.lastMaintenanceAt));
    setPlanningHorizonValue(Number(configuredPlan?.planningHorizonValue ?? 6));
    setPlanningHorizonUnit((String(configuredPlan?.planningHorizonUnit || 'MONTH').toUpperCase() as Unit) || 'MONTH');
    setActive(configuredPlan?.active !== false);
  }, [configuredPlan?.id, configuredPlan?.pmPlanId, configuredPlan?.frequencyValue, configuredPlan?.frequencyUnit, configuredPlan?.lastMaintenanceAt, configuredPlan?.planningHorizonValue, configuredPlan?.planningHorizonUnit, configuredPlan?.active]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadPmPlans() {
      setLoadingPlans(true);
      try {
        const res = await fetch(`${apiBase}/pm-plans`, { headers, credentials: 'include' });
        const text = await res.text();
        let json: any = [];
        try { json = text ? JSON.parse(text) : []; } catch {}
        if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        if (!cancelled) setPmPlans(Array.isArray(json) ? json : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? 'Error cargando PM Plans');
      } finally {
        if (!cancelled) setLoadingPlans(false);
      }
    }
    loadPmPlans();
    return () => {
      cancelled = true;
    };
  }, [apiBase, headers]);

  const loadFutureOrders = React.useCallback(async () => {
    setLoadingFutureOrders(true);
    try {
      const res = await fetch(`${apiBase}/assets/${assetId}/maintenance-plan`, { headers, credentials: 'include' });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      setFutureOrders(Array.isArray(json?.futureServiceOrders) ? json.futureServiceOrders : []);
      setLastMaintenances(Array.isArray(json?.lastPreventiveMaintenances) ? json.lastPreventiveMaintenances : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando OS futuras');
    } finally {
      setLoadingFutureOrders(false);
    }
  }, [apiBase, assetId, headers]);

  React.useEffect(() => {
    loadFutureOrders();
  }, [loadFutureOrders]);

  const baseDateText = lastMaintenanceAt || isoToDateInput(asset?.acquiredOn);

  async function saveConfig(syncFutureOrders = false) {
    setBusy(true);
    setErr(null);
    setInfo(null);
    setGenerateResult(null);
    try {
      if (!pmPlanId) throw new Error('Debes seleccionar un PM Plan');
      if (!Number.isFinite(frequencyValue) || frequencyValue <= 0) throw new Error('La frecuencia debe ser mayor a 0');
      if (!Number.isFinite(planningHorizonValue) || planningHorizonValue <= 0) throw new Error('El horizonte debe ser mayor a 0');

      const body = {
        pmPlanId,
        frequencyValue: Math.round(frequencyValue),
        frequencyUnit,
        lastMaintenanceAt: lastMaintenanceAt ? new Date(`${lastMaintenanceAt}T00:00:00`).toISOString() : null,
        planningHorizonValue: Math.round(planningHorizonValue),
        planningHorizonUnit,
        active,
        syncFutureOrders,
      };

      const res = await fetch(`${apiBase}/assets/${assetId}/maintenance-plan`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const sync = json?.syncFutureOrders;
      if (syncFutureOrders && sync) {
        setInfo(
          `Configuración guardada. OS futuras: ${sync.updatedCount ?? 0} actualizadas, ${sync.createdCount ?? 0} creadas, ${sync.canceledCount ?? 0} canceladas.`,
        );
      } else {
        setInfo('Configuración de mantenimiento guardada.');
      }
      await onUpdated?.();
      await loadFutureOrders();
    } catch (e: any) {
      setErr(e?.message ?? 'Error guardando configuración');
    } finally {
      setBusy(false);
    }
  }

  async function generateSchedule() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    setGenerateResult(null);
    try {
      const body = {
        horizonValue: Math.round(planningHorizonValue),
        horizonUnit: planningHorizonUnit,
      };

      const res = await fetch(`${apiBase}/assets/${assetId}/maintenance-plan/generate`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json: any = {};
      try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      setGenerateResult(json);
      setInfo(`Plan generado: ${json?.generatedCount ?? 0} OS nuevas.`);
      await loadFutureOrders();
    } catch (e: any) {
      setErr(e?.message ?? 'Error generando plan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      {err ? <div className="border rounded p-3 bg-red-50 text-red-700 text-sm">{err}</div> : null}
      {info ? <div className="border rounded p-3 bg-blue-50 text-blue-700 text-sm">{info}</div> : null}

      <div className="border rounded-lg p-4 space-y-4">
        <div>
          <h2 className="font-semibold">Plan de mantenimiento por activo</h2>
          <p className="text-sm text-gray-600">
            La fecha base será la última ejecución registrada. Si no existe, se usa la fecha de adquisición del activo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">PM Plan</span>
            <select className="border rounded px-3 py-2 w-full" value={pmPlanId} disabled={busy || loadingPlans} onChange={(e) => setPmPlanId(e.target.value)}>
              <option value="">(seleccionar)</option>
              {pmPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Último mantenimiento</span>
            <input type="date" className="border rounded px-3 py-2 w-full" value={lastMaintenanceAt} disabled={busy} onChange={(e) => setLastMaintenanceAt(e.target.value)} />
          </label>

          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Frecuencia</span>
              <input
                type="number"
                min={1}
                step={1}
                className="border rounded px-3 py-2 w-full"
                value={String(frequencyValue)}
                disabled={busy}
                onChange={(e) => setFrequencyValue(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Unidad</span>
              <select className="border rounded px-3 py-2 w-full" value={frequencyUnit} disabled={busy} onChange={(e) => setFrequencyUnit(e.target.value as Unit)}>
                <option value="DAY">Día</option>
                <option value="MONTH">Mes</option>
                <option value="YEAR">Año</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Horizonte a generar</span>
              <input
                type="number"
                min={1}
                step={1}
                className="border rounded px-3 py-2 w-full"
                value={String(planningHorizonValue)}
                disabled={busy}
                onChange={(e) => setPlanningHorizonValue(Number(e.target.value))}
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Unidad horizonte</span>
              <select className="border rounded px-3 py-2 w-full" value={planningHorizonUnit} disabled={busy} onChange={(e) => setPlanningHorizonUnit(e.target.value as Unit)}>
                <option value="DAY">Día</option>
                <option value="MONTH">Mes</option>
                <option value="YEAR">Año</option>
              </select>
            </label>
          </div>
        </div>

        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={active} disabled={busy} onChange={(e) => setActive(e.target.checked)} />
          Activo para generación automática/manual
        </label>

        <div className="text-xs text-gray-600">
          Base actual: {baseDateText ? baseDateText : 'No definida (configura último mantenimiento o fecha de adquisición)'} · Frecuencia:{' '}
          {frequencyValue > 0 ? `${frequencyValue} ${unitLabel(frequencyUnit)}` : '—'}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50" disabled={busy} onClick={() => saveConfig(false)}>
            Guardar configuración
          </button>
          <button type="button" className="px-3 py-2 border rounded disabled:opacity-50" disabled={busy} onClick={() => saveConfig(true)}>
            Guardar y actualizar OS futuras
          </button>
          <button type="button" className="px-3 py-2 border rounded disabled:opacity-50" disabled={busy} onClick={generateSchedule}>
            Generar OS futuras
          </button>
        </div>
        <div className="text-xs text-gray-500">
          Puedes guardar solo la configuración o aplicar inmediatamente los cambios a las OS preventivas futuras registradas.
        </div>
      </div>

      {generateResult ? (
        <div className="border rounded-lg p-4 space-y-2">
          <h3 className="font-semibold">Resultado de generación</h3>
          <div className="text-sm text-gray-700">
            Generadas: <b>{generateResult.generatedCount ?? 0}</b> · Ya existentes: <b>{generateResult.existingCount ?? 0}</b>
          </div>
          {(generateResult.created ?? []).length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {(generateResult.created ?? []).slice(0, 15).map((r: any) => (
                <li key={r.id}>
                  {new Date(r.dueDate).toLocaleString()} · <a className="underline" href={`/service-orders/${r.id}`}>{r.id}</a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">No se crearon nuevas OS en el horizonte seleccionado.</div>
          )}
        </div>
      ) : null}

      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold">Últimos 3 mantenimientos preventivos realizados</h3>
        {loadingFutureOrders ? (
          <div className="text-sm text-gray-600">Cargando…</div>
        ) : lastMaintenances.length === 0 ? (
          <div className="text-sm text-gray-600">No hay mantenimientos preventivos cerrados para este activo/plan.</div>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {lastMaintenances.map((r) => (
              <li key={r.id}>
                {r?.executedAt ? new Date(r.executedAt).toLocaleString() : 'Sin fecha de cierre'} · {r?.status ?? '-'} ·{' '}
                <a className="underline" href={`/service-orders/${r.id}`}>{r.title || r.id}</a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="font-semibold">OS preventivas futuras registradas</h3>
        {loadingFutureOrders ? (
          <div className="text-sm text-gray-600">Cargando…</div>
        ) : futureOrders.length === 0 ? (
          <div className="text-sm text-gray-600">No hay OS preventivas futuras para este activo/plan.</div>
        ) : (
          <ul className="list-disc pl-5 text-sm">
            {futureOrders.slice(0, 50).map((r) => (
              <li key={r.id}>
                {r?.dueDate ? new Date(r.dueDate).toLocaleString() : 'Sin fecha'} · {r?.status ?? '-'} ·{' '}
                <a className="underline" href={`/service-orders/${r.id}`}>{r.title || r.id}</a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
