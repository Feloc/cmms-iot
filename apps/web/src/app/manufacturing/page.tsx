'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import {
  dateLabel,
  type ManufacturingOrder,
  manufacturingStatusClass,
  manufacturingStatusLabel,
  type Paginated,
} from '@/lib/manufacturing';

const PAGE_SIZE = 25;

export default function ManufacturingPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = String((session as any)?.user?.role || '');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const path = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    return `/manufacturing/orders?${params.toString()}`;
  }, [q, status, page]);
  const { data, error, isLoading, mutate } = useApiSWR<Paginated<ManufacturingOrder>>(
    auth.token && auth.tenantSlug ? path : null,
    auth.token,
    auth.tenantSlug,
  );

  const items = data?.items || [];
  const counts = useMemo(() => ({
    visible: items.length,
    draft: items.filter((item) => item.status === 'DRAFT').length,
    engineering: items.filter((item) => item.status === 'ENGINEERING').length,
    released: items.filter((item) => item.status === 'RELEASED').length,
    onHold: items.filter((item) => item.status === 'ON_HOLD').length,
  }), [items]);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Manufactura</h1>
          <p className="text-sm text-gray-600">Expedientes de máquinas desde Ingeniería hasta su liberación.</p>
        </div>
        {role === 'ADMIN' ? <Link href="/manufacturing/new" className="rounded px-4 py-2 bg-black text-white text-sm">Nueva orden</Link> : null}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="En página" value={counts.visible} />
        <Stat label="Borrador" value={counts.draft} />
        <Stat label="Ingeniería" value={counts.engineering} tone="sky" />
        <Stat label="Liberadas" value={counts.released} tone="green" />
        <Stat label="En pausa" value={counts.onHold} tone="amber" />
      </div>

      <div className="border rounded-lg p-3 flex flex-wrap gap-3">
        <input
          className="border rounded px-3 py-2 text-sm flex-1 min-w-64"
          placeholder="Buscar OF, proyecto, producto, modelo o cliente…"
          value={q}
          onChange={(event) => { setQ(event.target.value); setPage(1); }}
        />
        <select className="border rounded px-3 py-2 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="ENGINEERING">Ingeniería</option>
          <option value="RELEASED">Liberada</option>
          <option value="ON_HOLD">En pausa</option>
          <option value="CANCELED">Cancelada</option>
        </select>
        <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => mutate()}>Actualizar</button>
      </div>

      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">No se pudieron cargar las órdenes de manufactura.</div> : null}
      {isLoading ? <div className="text-sm text-gray-500">Cargando órdenes…</div> : null}
      {!isLoading && !items.length ? <div className="border rounded-lg p-10 text-center text-gray-500">No hay órdenes que coincidan con los filtros.</div> : null}

      {items.length ? (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[940px] text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Orden</th>
                <th className="px-3 py-2">Proyecto / producto</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Unidades</th>
                <th className="px-3 py-2">Ingeniería</th>
                <th className="px-3 py-2">Entrega</th>
                <th className="px-3 py-2">Responsable</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-3"><Link href={`/manufacturing/${item.id}`} className="font-semibold hover:underline">{item.number}</Link></td>
                  <td className="px-3 py-3"><div className="font-medium">{item.projectName}</div><div className="text-xs text-gray-500">{[item.productCode, item.productName, item.model].filter(Boolean).join(' · ')}</div></td>
                  <td className="px-3 py-3"><div>{item.customerName || '—'}</div><div className="text-xs text-gray-500">{item.customerReference || ''}</div></td>
                  <td className="px-3 py-3">{item.metrics.unitCount}</td>
                  <td className="px-3 py-3"><div>{item.metrics.engineeringApprovedCount}/{item.metrics.engineeringDocumentCount} aprobados</div>{item.metrics.pendingEngineeringChanges ? <div className="text-xs text-amber-700">Cambios pendientes</div> : <div className="text-xs text-gray-500">Sin pendientes</div>}</td>
                  <td className="px-3 py-3">{dateLabel(item.requestedDeliveryAt)}</td>
                  <td className="px-3 py-3">{item.responsibleUser?.name || '—'}</td>
                  <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs ${manufacturingStatusClass[item.status]}`}>{manufacturingStatusLabel[item.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Total: {data?.total || 0}</span>
        <div className="flex items-center gap-2">
          <button className="border rounded px-3 py-2 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</button>
          <span>Página {page} de {Math.max(1, data?.pages || 1)}</span>
          <button className="border rounded px-3 py-2 disabled:opacity-50" disabled={page >= (data?.pages || 1)} onClick={() => setPage((value) => value + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'sky' | 'green' | 'amber' }) {
  const colors = { gray: 'text-gray-900', sky: 'text-sky-700', green: 'text-emerald-700', amber: 'text-amber-700' };
  return <div className="border rounded-lg p-3"><div className="text-xs text-gray-500">{label}</div><div className={`text-2xl font-semibold ${colors[tone]}`}>{value}</div></div>;
}
