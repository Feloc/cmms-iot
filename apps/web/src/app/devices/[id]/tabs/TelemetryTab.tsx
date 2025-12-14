'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

type Point = { ts: string; value: number | null; unit: string | null };

type Props = {
  deviceId: string;
  /**
   * Opcional: si tu page.tsx ya lo pasa.
   * Si no se pasa, se intenta obtener desde next-auth session o localStorage.
   */
  token?: string;
  /** Opcional: slug (ej. 'acme'). Si no se pasa, se intenta obtener de session/localStorage. */
  tenantSlug?: string;
};

type RangeMode = 'last_points' | '1h' | '24h' | '7d' | 'custom';

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function toLocalLabel(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function maskToken(t?: string) {
  if (!t) return '';
  const s = String(t);
  if (s.length <= 16) return '***';
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

export default function TelemetryTab({ deviceId, token, tenantSlug }: Props) {
  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Si estás usando next-auth, aquí intentamos obtener token/tenant desde la session.
  // OJO: depende de cómo tengas configurados callbacks de NextAuth.
  const { data: session } = useSession();

  // Heurísticas típicas para token/tenant guardados en session (ajusta si tu app usa otros nombres)
  const sessionToken =
    // @ts-ignore
    (session as any)?.accessToken ??
    // @ts-ignore
    (session as any)?.token ??
    // @ts-ignore
    (session as any)?.user?.accessToken ??
    // @ts-ignore
    (session as any)?.user?.token;

  const sessionTenantSlug =
    // @ts-ignore
    (session as any)?.tenantSlug ??
    // @ts-ignore
    (session as any)?.user?.tenantSlug ??
    // @ts-ignore
    (session as any)?.tenant ??
    // @ts-ignore
    (session as any)?.user?.tenant;

  // Fallback: localStorage (útil si ya guardas el tenant/token en el cliente)
  const lsTenant =
    safeLocalStorageGet('tenantSlug') ||
    safeLocalStorageGet('x-tenant') ||
    safeLocalStorageGet('tenant') ||
    null;

  const lsToken =
    safeLocalStorageGet('accessToken') ||
    safeLocalStorageGet('token') ||
    safeLocalStorageGet('cmms_token') ||
    null;

  const effectiveToken = token || sessionToken || lsToken || '';
  const effectiveTenantSlug = (tenantSlug || sessionTenantSlug || lsTenant || '').trim();

  const [metrics, setMetrics] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>('');
  const [rangeMode, setRangeMode] = useState<RangeMode>('last_points');
  const [fromInput, setFromInput] = useState<string>(''); // datetime-local
  const [toInput, setToInput] = useState<string>(''); // datetime-local
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Importante: en browser muchas veces el problema es que token/tenant no están llegando.
  // Esto lo deja súper visible sin exponer el token completo.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[TelemetryTab] auth ctx', {
      deviceId,
      tenantSlug: effectiveTenantSlug || '(missing)',
      token: effectiveToken ? maskToken(effectiveToken) : '(missing)',
    });
  }, [deviceId, effectiveTenantSlug, effectiveToken]);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (effectiveToken) h['Authorization'] = `Bearer ${effectiveToken}`;
    // Si tu API ya soporta tenantId por JWT, esto es opcional.
    // Pero en tu caso el controller todavía reporta missing x-tenant en algunos paths,
    // así que lo mandamos si lo tenemos.
    if (effectiveTenantSlug) h['x-tenant'] = effectiveTenantSlug;
    return h;
  }, [effectiveToken, effectiveTenantSlug]);

  const canCallApi = !!effectiveToken || !!effectiveTenantSlug;

  const computeWindow = (): { from: Date; to: Date } | null => {
    const now = new Date();
    if (rangeMode === '1h') return { from: new Date(now.getTime() - 3600_000), to: now };
    if (rangeMode === '24h') return { from: new Date(now.getTime() - 24 * 3600_000), to: now };
    if (rangeMode === '7d') return { from: new Date(now.getTime() - 7 * 24 * 3600_000), to: now };
    if (rangeMode === 'custom' && fromInput && toInput) return { from: new Date(fromInput), to: new Date(toInput) };
    return null; // last_points
  };

  // 1) Load metrics
  useEffect(() => {
    let alive = true;

    (async () => {
      setError('');
      if (!canCallApi) {
        setMetrics(['ax', 'ay', 'az']);
        setMetric((m) => m || 'ax');
        return;
      }

      try {
        const res = await fetch(`${API}/devices/${deviceId}/metrics`, { headers });
        const txt = await res.text();
        if (!res.ok) {
          // Mostramos el body para diagnosticar el 400 (ej. missing x-tenant)
          throw new Error(`HTTP ${res.status} ${txt}`);
        }
        const json = txt ? JSON.parse(txt) : [];
        const list = Array.isArray(json) ? (json as string[]) : [];
        if (!alive) return;

        const fallback = ['ax', 'ay', 'az'];
        const finalList = list.length ? list : fallback;
        setMetrics(finalList);
        setMetric((m) => m || finalList[0]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'Error loading metrics');
        const fallback = ['ax', 'ay', 'az'];
        setMetrics(fallback);
        setMetric((m) => m || fallback[0]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [API, deviceId, headers, canCallApi]);

  // 2) Load telemetry
  const load = async () => {
    setError('');
    if (!metric) return;

    // Si no hay auth, no bloqueamos el UI; pero no llamamos API.
    if (!canCallApi) {
      setPoints([]);
      setError('Falta token/tenant en el cliente. Revisa que tu page.tsx pase token/tenantSlug o que NextAuth los exponga en session.');
      return;
    }

    setLoading(true);
    try {
      const window = computeWindow();
      const qs = new URLSearchParams();
      qs.set('metric', metric);
      qs.set('bucket', 'raw');
      qs.set('limit', '2000');

      // Si no hay ventana => “últimos puntos” (funciona aunque ts sea 1970)
      if (window) {
        qs.set('from', window.from.toISOString());
        qs.set('to', window.to.toISOString());
      }

      const res = await fetch(`${API}/devices/${deviceId}/telemetry?${qs.toString()}`, { headers });
      const txt = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${txt}`);

      const json = txt ? JSON.parse(txt) : [];
      const arr: Point[] = Array.isArray(json)
        ? (json as Point[])
        : Array.isArray((json as any)?.rows)
          ? ((json as any).rows as Point[])
          : [];
      setPoints(arr);
    } catch (e: any) {
      setError(e?.message || 'Error loading telemetry');
      setPoints([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!metric) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, rangeMode]);

  const yearLooksWrong = useMemo(() => {
    if (!points.length) return false;
    const y = new Date(points[points.length - 1].ts).getUTCFullYear();
    return y < 2000;
  }, [points]);

  const unit = points.length ? points[points.length - 1].unit : null;

  return (
    <div className="p-4 space-y-4">
      {!canCallApi && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          No detecté token/tenant en el cliente. El tab usará fallback de métricas, pero no podrá consultar el API.
          <div className="mt-2 text-xs text-amber-800">
            Pasa props desde <code>page.tsx</code> o expón <code>accessToken</code>/<code>tenantSlug</code> en NextAuth session.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-gray-500">Métrica</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            {metrics.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500">Rango</label>
          <select
            className="border rounded-md px-3 py-2 text-sm bg-white"
            value={rangeMode}
            onChange={(e) => setRangeMode(e.target.value as RangeMode)}
          >
            <option value="last_points">Últimos puntos</option>
            <option value="1h">Última hora</option>
            <option value="24h">Últimas 24h</option>
            <option value="7d">Últimos 7 días</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>

        {rangeMode === 'custom' && (
          <>
            <div>
              <label className="text-xs text-gray-500">Desde</label>
              <input
                className="border rounded-md px-3 py-2 text-sm bg-white"
                type="datetime-local"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Hasta</label>
              <input
                className="border rounded-md px-3 py-2 text-sm bg-white"
                type="datetime-local"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          className="border rounded-md px-3 py-2 text-sm bg-black text-white disabled:opacity-50"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && <div className="text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

      {yearLooksWrong && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Tus timestamps parecen ser <b>uptime (millis)</b> (año &lt; 2000). Para ver rangos como “Última hora”,
          manda <b>epoch ms</b> desde el device (NTP) o no envíes <code>ts</code> para que el ingest use <code>now()</code>.
          Mientras tanto, usa <b>“Últimos puntos”</b>.
        </div>
      )}

      <div className="h-[380px] w-full border rounded-md bg-white">
        {!points.length ? (
          <div className="text-sm text-gray-500 p-6">Sin datos para mostrar.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid strokeDasharray="3 3" />
              {/* Ocultamos X por densidad; Tooltip muestra hora exacta */}
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={(l) => toLocalLabel(l as string)}
                formatter={(v: any) => [v, unit || metric]}
              />
              <Line type="monotone" dataKey="value" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {points.length > 0 && (
        <div className="text-xs text-gray-500">
          Último punto: {toLocalLabel(points[points.length - 1].ts)} — {points[points.length - 1].value ?? 'null'}{' '}
          {unit ?? ''}
        </div>
      )}
    </div>
  );
}
