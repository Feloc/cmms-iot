'use client';

import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAssetsDetail } from '../assets-detail.context';

type Bucket = 'day' | 'week' | 'month';

type SummaryResponse = {
  asset: { id: string; code: string; name?: string | null };
  window: { from: string; to: string };
  readings: { count: number; first: number | null; last: number | null; delta: number | null };
  usage: { avgHoursPerDay: number | null; avgHoursPerWeek: number | null };
  quality: { decreaseEvents: number; largeJumpEvents: number };
};

type SeriesPoint = { periodStart: string; reading: number; delta: number | null };
type SeriesResponse = {
  asset: { id: string; code: string; name?: string | null };
  window: { from: string; to: string };
  bucket: Bucket;
  items: SeriesPoint[];
};

type PmPerformanceItem = {
  workOrderId: string;
  closedAt: string;
  status?: string | null;
  title?: string | null;
  readingAtPm: number | null;
  readingAtPmAt?: string | null;
  source: 'BY_ORDER' | 'FALLBACK_AT_CLOSE' | 'NONE';
  deltaFromPreviousPm: number | null;
  compliance: 'EARLY' | 'ON_TIME' | 'LATE' | 'UNKNOWN';
};
type PmPerformanceResponse = {
  asset: { id: string; code: string; name?: string | null };
  targetHours: number | null;
  items: PmPerformanceItem[];
};

type RiskItem = {
  assetId: string;
  assetCode: string;
  assetName?: string | null;
  customer?: string | null;
  pmPlanId: string;
  pmPlanName?: string | null;
  targetHours: number;
  lastPmWorkOrderId: string | null;
  lastPmClosedAt: string | null;
  lastPmReading: number | null;
  latestReading: number | null;
  hoursSinceLastPm: number | null;
  remainingHours: number | null;
  status: 'OVERDUE' | 'DUE_SOON' | 'OK' | 'UNKNOWN';
};
type RiskResponse = { items: RiskItem[]; totalCandidates?: number };

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtNum(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  return Number(v).toFixed(digits);
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, credentials: 'include' });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
  return json;
}

export default function HourmeterAnalyticsTab({ asset }: { asset: any }) {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const [from, setFrom] = React.useState<string>(() => toDateInputValue(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = React.useState<string>(() => toDateInputValue(new Date()));
  const [bucket, setBucket] = React.useState<Bucket>('week');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [series, setSeries] = React.useState<SeriesResponse | null>(null);
  const [pmPerformance, setPmPerformance] = React.useState<PmPerformanceResponse | null>(null);
  const [risk, setRisk] = React.useState<RiskResponse | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const windowQs = new URLSearchParams({ from, to }).toString();
      const riskQs = new URLSearchParams({
        limit: '20',
        ...(asset?.customer ? { customer: String(asset.customer) } : {}),
      }).toString();

      const [summaryResp, seriesResp, pmResp, riskResp] = await Promise.all([
        fetchJson(`${apiBase}/assets/${assetId}/hourmeter-analytics/summary?${windowQs}`, headers),
        fetchJson(`${apiBase}/assets/${assetId}/hourmeter-analytics/series?${windowQs}&bucket=${bucket}`, headers),
        fetchJson(`${apiBase}/assets/${assetId}/hourmeter-analytics/pm-performance?limit=12`, headers),
        fetchJson(`${apiBase}/assets/hourmeter-analytics/risk?${riskQs}`, headers),
      ]);

      setSummary(summaryResp as SummaryResponse);
      setSeries(seriesResp as SeriesResponse);
      setPmPerformance(pmResp as PmPerformanceResponse);
      setRisk(riskResp as RiskResponse);
    } catch (e: any) {
      setError(e?.message ?? 'No fue posible cargar analítica de horómetro');
      setSummary(null);
      setSeries(null);
      setPmPerformance(null);
      setRisk(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, assetId, headers, from, to, bucket, asset?.customer]);

  React.useEffect(() => {
    load();
  }, [load]);

  const chartData = React.useMemo(
    () =>
      (series?.items ?? []).map((it) => ({
        period: new Date(it.periodStart).toLocaleDateString(),
        reading: it.reading,
        delta: it.delta,
      })),
    [series?.items],
  );

  const isRangeInvalid = new Date(from).getTime() > new Date(to).getTime();

  return (
    <section className="space-y-4">
      {error ? (
        <div className="border rounded p-3 bg-red-50 text-red-700 text-sm">{error}</div>
      ) : null}

      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-semibold">Filtros</div>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_180px_auto] gap-2 items-end">
          <label className="space-y-1">
            <span className="text-sm font-medium">Desde</span>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Hasta</span>
            <input
              type="date"
              className="border rounded px-3 py-2 w-full"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Bucket serie</span>
            <select
              className="border rounded px-3 py-2 w-full"
              value={bucket}
              onChange={(e) => setBucket(e.target.value as Bucket)}
            >
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </label>
          <button
            type="button"
            className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
            disabled={loading || isRangeInvalid}
            onClick={load}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {isRangeInvalid ? (
          <div className="text-sm text-amber-700">El rango de fechas es inválido (Desde debe ser menor o igual a Hasta).</div>
        ) : null}
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-semibold">Resumen de uso</div>
        {!summary ? (
          <div className="text-sm text-gray-600">Sin datos para el rango seleccionado.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-gray-600">Lecturas en ventana</div>
              <div className="text-lg font-semibold">{summary.readings.count}</div>
              <div className="text-xs text-gray-600">
                {fmtDateTime(summary.window.from)} → {fmtDateTime(summary.window.to)}
              </div>
            </div>
            <div className="border rounded p-3 space-y-0.5">
              <div><span className="text-gray-600">Primera:</span> <b>{fmtNum(summary.readings.first, 2)} h</b></div>
              <div><span className="text-gray-600">Última:</span> <b>{fmtNum(summary.readings.last, 2)} h</b></div>
              <div><span className="text-gray-600">Delta:</span> <b>{fmtNum(summary.readings.delta, 2)} h</b></div>
            </div>
            <div className="border rounded p-3 space-y-0.5">
              <div><span className="text-gray-600">Promedio/día:</span> <b>{fmtNum(summary.usage.avgHoursPerDay, 3)} h</b></div>
              <div><span className="text-gray-600">Promedio/semana:</span> <b>{fmtNum(summary.usage.avgHoursPerWeek, 3)} h</b></div>
              <div><span className="text-gray-600">Calidad:</span> ↓{summary.quality.decreaseEvents} · saltos {summary.quality.largeJumpEvents}</div>
            </div>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="font-semibold">Serie de horómetro ({bucket})</div>
        {!series || (series.items ?? []).length === 0 ? (
          <div className="text-sm text-gray-600">Sin puntos en la serie.</div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" minTickGap={24} />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="reading" name="Lectura (h)" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="delta" name="Delta" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-semibold">Desempeño PM por horas</div>
        <div className="text-sm text-gray-600">Objetivo intervalo: {fmtNum(pmPerformance?.targetHours ?? null, 2)} h</div>
        {!pmPerformance || pmPerformance.items.length === 0 ? (
          <div className="text-sm text-gray-600">Sin mantenimientos preventivos cerrados para evaluar.</div>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Cierre PM</th>
                  <th className="px-3 py-2 text-left">Lectura PM</th>
                  <th className="px-3 py-2 text-left">Delta vs PM anterior</th>
                  <th className="px-3 py-2 text-left">Cumplimiento</th>
                  <th className="px-3 py-2 text-left">OS</th>
                </tr>
              </thead>
              <tbody>
                {pmPerformance.items.map((it) => (
                  <tr key={it.workOrderId} className="border-t">
                    <td className="px-3 py-2">{fmtDateTime(it.closedAt)}</td>
                    <td className="px-3 py-2">{fmtNum(it.readingAtPm, 2)} h</td>
                    <td className="px-3 py-2">{fmtNum(it.deltaFromPreviousPm, 2)} h</td>
                    <td className="px-3 py-2">{it.compliance}</td>
                    <td className="px-3 py-2">
                      <a className="underline" href={`/service-orders/${it.workOrderId}`}>{it.title || it.workOrderId}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <div className="font-semibold">Riesgo por horas (top 20)</div>
        {!risk || risk.items.length === 0 ? (
          <div className="text-sm text-gray-600">Sin activos en riesgo para este filtro.</div>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Activo</th>
                  <th className="px-3 py-2 text-left">Plan PM</th>
                  <th className="px-3 py-2 text-left">Objetivo (h)</th>
                  <th className="px-3 py-2 text-left">Desde último PM (h)</th>
                  <th className="px-3 py-2 text-left">Restante (h)</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody>
                {risk.items.map((it) => (
                  <tr key={`${it.assetId}-${it.pmPlanId}`} className="border-t">
                    <td className="px-3 py-2">
                      <a className="underline" href={`/assets/${it.assetId}`}>{it.assetCode}</a>
                      {it.assetName ? <span className="text-gray-600"> · {it.assetName}</span> : null}
                    </td>
                    <td className="px-3 py-2">{it.pmPlanName || it.pmPlanId}</td>
                    <td className="px-3 py-2">{fmtNum(it.targetHours, 2)}</td>
                    <td className="px-3 py-2">{fmtNum(it.hoursSinceLastPm, 2)}</td>
                    <td className="px-3 py-2">{fmtNum(it.remainingHours, 2)}</td>
                    <td className="px-3 py-2">{it.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
