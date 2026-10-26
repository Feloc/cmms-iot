'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useApiSWR } from '@/lib/swr';
import { ToolAuth, ToolEvent, ToolUser, toolActions, toolConditions, toolDate, toolError } from '@/lib/tools';
const fieldLabels: Record<string, string> = { code: 'Código', name: 'Nombre', category: 'Categoría', brand: 'Marca', model: 'Modelo', serialNumber: 'Serial', location: 'Ubicación', responsibleUserId: 'Responsable', acquiredOn: 'Fecha de compra', notes: 'Observaciones' };
function display(key: string, value: any, users: ToolUser[]) {
  if (value === null || value === undefined || value === '') return 'Sin asignar';
  if (key === 'responsibleUserId') return users.find(u => u.id === value)?.name || 'Usuario anterior';
  if (key === 'acquiredOn') return toolDate(value);
  return String(value);
}
function EventDetails({ event, users }: { event: ToolEvent; users: ToolUser[] }) {
  const d = event.details;
  if (event.action === 'edited') {
    const changed = Object.keys(d.after || {}).filter(key => JSON.stringify(d.before?.[key]) !== JSON.stringify(d.after[key]));
    return <ul className="space-y-1 text-sm text-gray-600">{changed.length ? changed.map(key => <li key={key}>{fieldLabels[key] || key}: {display(key, d.before?.[key], users)} → {display(key, d.after[key], users)}</li>) : <li>Ficha guardada sin cambios.</li>}</ul>;
  }
  const parts = [d.quantity !== undefined && `${d.quantity} unidad(es)`, d.recipientName && `Responsable: ${d.recipientName}`,
    d.destination && `Destino: ${d.destination}`, d.location && `Regresa a: ${d.location}`, d.condition && `Condición: ${toolConditions[d.condition] || d.condition}`,
    d.from && `${toolConditions[d.from]} → ${toolConditions[d.to]}`, d.expectedReturnOn && `Devolución prevista: ${toolDate(d.expectedReturnOn)}`,
    d.remainingQty !== undefined && `Pendiente de devolver: ${d.remainingQty}`].filter(Boolean);
  return <p className="text-sm text-gray-600">{parts.join(' · ')}</p>;
}
export default function ToolHistory({ id, version, auth, users }: { id: string; version: number; auth: ToolAuth; users: ToolUser[] }) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useApiSWR<{ items: ToolEvent[]; total: number; pages: number }>(`/tools/${id}/events?page=${page}`, auth.token, auth.tenantSlug);
  useEffect(() => { setPage(1); }, [version]);
  useEffect(() => { void mutate(); }, [version, mutate]);
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Historial de movimientos</h2>{error && <p role="alert" className="text-red-700">{toolError(error)}</p>}{isLoading && <p role="status">Cargando historial…</p>}<ol className="divide-y">{data?.items.map(event => <li key={event.id} className="space-y-1 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{toolActions[event.action] || event.action}</span><time className="text-xs text-gray-500">{toolDate(event.createdAt, true)} · {event.actorName}</time></div><EventDetails event={event} users={users} />{event.note && <p className="whitespace-pre-wrap text-sm">{event.note}</p>}</li>)}</ol>{!isLoading && !error && !data?.items.length && <p className="text-sm text-gray-500">Sin movimientos.</p>}<div className="flex items-center justify-between gap-2 text-sm"><span>{data?.total || 0} movimientos</span><div className="flex items-center gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page} / {Math.max(1, data?.pages || 1)}</span><Button variant="outline" disabled={!data || page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></div></section>;
}
