'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { apiFetch, sessionParts } from '@/lib/api';

type Alert = {
  id: string;
  assetCode: string;
  sensor: string;
  message: string;
  status: 'OPEN' | 'ACK' | 'CLOSED' | string;
  createdAt?: string;
  ts?: string | null;
  value?: number | null;
  delta?: number | null;
  kind?: string | null;
  type?: string | null;
};

export default function AlertsPage() {
  const { data: session } = useSession();
  const { token, tenant } = sessionParts(session);

  const { data, error, isLoading } = useSWR<Alert[]>(
    token && tenant ? ['/alerts/recent?take=25', token, tenant] : null,
    ([url, t, ten]) => apiFetch(url, { token: t, tenant: ten }),
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Alertas recientes</h1>
        <Link href="/dashboard" className="text-sm underline">
          Volver al dashboard
        </Link>
      </div>

      {isLoading && <p>Cargando…</p>}
      {error && (
        <p className="text-red-600 text-sm">
          {(error as Error).message}
        </p>
      )}

      <ul className="divide-y rounded-lg border bg-white">
        {(data ?? []).map((a) => {
          const when = a.ts ?? a.createdAt;
          const kind = a.kind ?? a.type ?? '';
          return (
            <li
              key={a.id}
              className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
            >
              <div className="space-y-1 min-w-0">
                <div className="text-xs text-gray-500 truncate">
                  {when ? new Date(when).toLocaleString() : ''}
                </div>
                <div className="font-medium truncate">{a.message}</div>
                <div className="text-sm text-gray-600 truncate">
                  {kind} · {a.assetCode}/{a.sensor}
                  {a.value != null ? ` · v=${a.value}` : ''}
                  {a.delta != null
                    ? ` · Δ=${
                        typeof a.delta === 'number'
                          ? a.delta.toFixed(2)
                          : a.delta
                      }`
                    : ''}
                </div>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full border shrink-0 ${
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
        {!isLoading && !error && !(data ?? []).length && (
          <li className="p-4 text-sm text-gray-500">No hay alertas.</li>
        )}
      </ul>
    </div>
  );
}
