'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { apiFetch, sessionParts } from '@/lib/api';

type KPI = {
  availability: number;
  mtbf: number;
  mttr: number;
  backlog: number;
  preventiveRate: number;
};

type Alert = {
  id: string;
  assetCode: string;
  sensor: string;
  message: string;
  status: string;
  createdAt?: string;
  ts?: string | null;
  kind?: string | null;
  type?: string | null;
};

export default function Dashboard() {
  const { data: session } = useSession();
  const { token, tenant } = sessionParts(session);

  const { data: kpi, error: kpiErr } = useSWR<KPI>(
    token && tenant ? ['/dashboard', token, tenant] : null,
    ([url, t, ten]) => apiFetch(url, { token: t, tenant: ten }),
  );

  const { data: alerts, error: alertsErr } = useSWR<Alert[]>(
    token && tenant ? ['/alerts/recent?take=6', token, tenant] : null,
    ([url, t, ten]) => apiFetch(url, { token: t, tenant: ten }),
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Disponibilidad" value={fmtPct(kpi?.availability)} />
        <KpiCard label="MTBF" value={fmtHours(kpi?.mtbf)} />
        <KpiCard label="MTTR" value={fmtHours(kpi?.mttr)} />
        <KpiCard label="Backlog (WO)" value={kpi?.backlog ?? '—'} />
        <KpiCard label="% Preventivo" value={fmtPct(kpi?.preventiveRate)} />
      </div>

      {/* Alertas recientes */}
      <div className="rounded-xl border bg-white">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Alertas recientes</h2>
          <Link href="/alerts" className="text-sm underline">
            Ver todas
          </Link>
        </div>
        {alertsErr ? (
          <div className="p-4 text-sm text-red-600">
            {(alertsErr as Error).message}
          </div>
        ) : (
          <ul className="divide-y">
            {(alerts ?? []).map((a) => {
              const when = a.ts ?? a.createdAt;
              const kind = a.kind ?? a.type ?? '';
              return (
                <li
                  key={a.id}
                  className="p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.message}</div>
                    <div className="text-xs text-gray-600">
                      {kind} · {a.assetCode}/{a.sensor}{' '}
                      {when ? '· ' + new Date(when).toLocaleString() : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                      a.status === 'OPEN'
                        ? 'bg-red-50 border-red-300 text-red-700'
                        : 'bg-green-50 border-green-300 text-green-700'
                    }`}
                  >
                    {a.status}
                  </span>
                </li>
              );
            })}
            {!alerts?.length && (
              <li className="p-4 text-sm text-gray-500">No hay alertas.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value ?? '—'}</div>
    </div>
  );
}

function fmtPct(n?: number) {
  if (typeof n !== 'number') return '—';
  return `${(n * 100).toFixed(1)}%`;
}
function fmtHours(n?: number) {
  if (typeof n !== 'number') return '—';
  return `${n.toFixed(1)} h`;
}
