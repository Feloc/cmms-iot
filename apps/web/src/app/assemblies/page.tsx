'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { type Assembly, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';

function signal(item: Assembly) {
  if (item.status === 'COMPLETED') return 'bg-emerald-100 text-emerald-800';
  if (item.activities.some((activity) => activity.status === 'BLOCKED')) return 'bg-red-100 text-red-800';
  if (item.metrics.budgetConsumedPercent > item.metrics.progressPercent + 15) return 'bg-amber-100 text-amber-800';
  return 'bg-sky-100 text-sky-800';
}

export default function AssembliesPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role;
  const { data, error, isLoading } = useApiSWR<Assembly[]>('/assemblies', auth.token, auth.tenantSlug);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Montajes</h1>
          <p className="text-sm text-gray-600">Seguimiento del avance físico y las horas presupuestadas.</p>
        </div>
        {role === 'ADMIN' ? (
          <div className="flex gap-2">
            <Link className="border rounded px-3 py-2 text-sm" href="/assemblies/templates">Plantillas</Link>
            <Link className="rounded px-3 py-2 text-sm bg-black text-white" href="/assemblies/new">Nuevo montaje</Link>
          </div>
        ) : null}
      </div>

      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3">No se pudieron cargar los montajes.</div> : null}
      {isLoading ? <div className="text-gray-500">Cargando…</div> : null}
      {!isLoading && !data?.length ? <div className="border rounded p-8 text-center text-gray-500">Todavía no hay montajes registrados.</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {(data || []).map((item) => {
          const blocked = item.activities.filter((activity) => activity.status === 'BLOCKED').length;
          return (
            <Link key={item.id} href={`/assemblies/${item.id}`} className="block border rounded-lg p-4 hover:shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{item.workOrder.title}</div>
                  <div className="text-sm text-gray-600">
                    {item.asset?.code || item.workOrder.assetCode} · {item.asset?.name || 'Equipo'}
                    {item.asset?.customer ? ` · ${item.asset.customer}` : ''}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${signal(item)}`}>
                  {assemblyStatusLabel[item.status] || item.status}
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Avance {item.metrics.progressPercent}%</span>
                  <span>Presupuesto consumido {item.metrics.budgetConsumedPercent}%</span>
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, item.metrics.progressPercent)}%` }} />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><div className="text-xs text-gray-500">Presupuestado</div>{minutesLabel(item.plannedLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Real</div>{minutesLabel(item.metrics.actualLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Pronóstico</div>{minutesLabel(item.metrics.forecastLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Bloqueos</div><span className={blocked ? 'text-red-700 font-medium' : ''}>{blocked}</span></div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
