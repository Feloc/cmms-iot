'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { dateLabel } from '@/lib/manufacturing';

type Control = {
  id: string; number: string; projectName: string; stage: string; status: string; progress: number;
  nextAction: string; responsible: string; requestedDeliveryAt?: string | null;
  blockers: string[]; warnings: string[]; risk: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLOSED';
  units: Array<{ id: string; unitNumber: number; stage: string; progress: number }>;
};
const riskLabels = { HIGH: 'Requiere atención', MEDIUM: 'Entrega próxima', LOW: 'Sin alertas', CLOSED: 'Cerrada' };

export function ManufacturingControl({ auth, orderId }: { auth: { token?: string; tenantSlug?: string }; orderId?: string }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState(false);
  const params = new URLSearchParams({ page: String(page), q: search, closed: String(closed) });
  const path = orderId ? `/manufacturing/orders/${orderId}/control` : `/manufacturing/control?${params}`;
  const { data, error, isLoading, mutate } = useApiSWR<Control | { items: Control[]; total: number; pages: number }>(path, auth.token, auth.tenantSlug);
  const rows = data ? ('items' in data ? data.items : [data]) : [];
  const pages = data && 'pages' in data ? data.pages : 1;
  return <section className="space-y-3 rounded-lg border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-lg">Control operativo</h2><p className="text-xs text-gray-600">Avance por hitos, calculado por unidad. El porcentaje no representa horas trabajadas.</p></div><button className="border rounded px-3 py-2 text-sm" onClick={() => mutate()}>Actualizar control</button></div>
    {!orderId ? <form className="flex flex-wrap items-center gap-3" onSubmit={e => { e.preventDefault(); setSearch(query); setPage(1); }}>
      <input aria-label="Buscar en control operativo" className="border rounded px-3 py-2 text-sm" placeholder="Buscar orden o proyecto" value={query} onChange={e => setQuery(e.target.value)} />
      <button className="border rounded px-3 py-2 text-sm">Buscar</button>
      <label className="text-sm"><input type="checkbox" checked={closed} onChange={e => { setClosed(e.target.checked); setPage(1); }} /> Incluir cerradas</label>
      <span className="text-xs text-gray-600">En esta página: {rows.filter(r => r.risk === 'HIGH').length} requieren atención · {rows.filter(r => r.risk === 'MEDIUM').length} próximas a entrega</span>
    </form> : null}
    {error ? <p role="alert" className="text-red-700">No se pudo cargar el control operativo.</p> : isLoading ? <p>Cargando avance…</p> : !rows.length ? <p className="text-gray-600">No hay órdenes para estos filtros.</p> : <div className="space-y-3">{rows.map(row => <article key={row.id} className="rounded border p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><Link className="font-medium underline" href={`/manufacturing/${row.id}`}>{row.number} · {row.projectName}</Link><span className={`text-xs rounded px-2 py-1 ${row.risk === 'HIGH' ? 'bg-red-50 text-red-800' : row.risk === 'MEDIUM' ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'}`}>{riskLabels[row.risk]}</span></div>
      <div className="text-sm">{row.stage}{row.status === 'ON_HOLD' ? ' · En pausa' : ''} · Responsable: {row.responsible} · Entrega: {dateLabel(row.requestedDeliveryAt)}</div>
      <div className="flex items-center gap-3"><progress aria-label={`Avance de ${row.number}`} max={100} value={row.progress} className="h-3 w-full" /><span className="text-sm">{row.progress}%</span></div>
      <p className="text-sm">Siguiente acción: {row.nextAction}</p>
      {row.blockers.length + row.warnings.length > 0 ? <ul className="list-disc pl-5 text-sm text-amber-900">{[...row.blockers, ...row.warnings].map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
      {row.units.length ? <details><summary className="cursor-pointer text-sm">Avance de {row.units.length} unidades</summary><ul className="mt-2 space-y-1 text-sm">{row.units.map(unit => <li key={unit.id}>Unidad {unit.unitNumber}: {unit.stage} · {unit.progress}%</li>)}</ul></details> : null}
    </article>)}</div>}
    {!orderId ? <div className="flex items-center justify-between text-sm"><span>{data && 'total' in data ? data.total : 0} órdenes</span><div className="flex gap-3 items-center"><button disabled={page <= 1} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage(p => p - 1)}>Anterior</button><span>{page} / {pages}</span><button disabled={page >= pages} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => setPage(p => p + 1)}>Siguiente</button></div></div> : null}
  </section>;
}
