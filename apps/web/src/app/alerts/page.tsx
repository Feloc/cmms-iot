'use client';

import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';

type Alert = {
  id: string;
  type: 'THRESHOLD' | 'ROC';
  assetCode: string;
  sensor: string;
  message: string;
  status: 'OPEN' | 'ACK' | 'CLOSED';
  createdAt: string;
};

export default function AlertsPage() {
  const { data: session } = useSession();
  const token = (session as any)?.backendToken as string | undefined;
  const tenantSlug = (session as any)?.tenant?.slug as string | undefined;

  const { data: alerts } = useSWR<Alert[]>(
    token && tenantSlug ? ['/alerts/recent', token, tenantSlug] : null,
    ([url, t, slug]) => apiFetch(url, { token: t, tenant: slug }),
    { refreshInterval: 5000 }
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Alertas</h1>
      {!alerts?.length && <div className="text-sm text-neutral-500">Sin alertas</div>}
      <ul className="space-y-2">
        {alerts?.map(a => (
          <li key={a.id} className="p-3 rounded border">
            <div className="text-sm">
              <span className="font-mono">[{a.type}]</span>{' '}
              <span className="font-semibold">{a.assetCode}/{a.sensor}</span>{' '}
              – {a.message}
            </div>
            <div className="text-xs text-neutral-500">
              {new Date(a.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
