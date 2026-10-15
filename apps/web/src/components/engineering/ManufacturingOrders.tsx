'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Factory, Link2, Unlink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useApiSWR } from '@/lib/swr';
import { EngineeringRequest, EngineeringUser, engineeringInput as input, engineeringError } from '@/lib/engineering';
import { manufacturingStatusLabel, ManufacturingOrderStatus } from '@/lib/manufacturing';

type Props = {
  row: EngineeringRequest; auth: { token?: string; tenantSlug?: string };
  users: EngineeringUser[]; admin: boolean; busy: boolean; error: string;
  change: (path: string, body: Record<string, unknown>) => Promise<boolean>;
};
type Candidate = { id: string; number: string; productName: string; quantity: number };
export default function ManufacturingOrders({ row, auth, users, admin, busy, error, change }: Props) {
  const [mode, setMode] = useState<'create' | 'link' | 'unlink' | ''>('');
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [responsible, setResponsible] = useState(row.responsibleUserId || '');
  const [delivery, setDelivery] = useState('');
  const [note, setNote] = useState('');
  const editable = admin && ['APPROVED', 'EXECUTION'].includes(row.status);
  const { data: candidates, error: candidateError, isLoading, mutate } = useApiSWR<Candidate[]>(mode === 'link' ? '/engineering-requests/' + row.id + '/eligible-manufacturing-orders' : null, auth.token, auth.tenantSlug);
  const { data: items, error: itemError, isLoading: searching } = useApiSWR<{ id: string; sku: string; name: string; status: string }[]>(mode === 'create' && search.trim().length >= 2 ? '/inventory/search?q=' + encodeURIComponent(search.trim()) : null, auth.token, auth.tenantSlug);
  const links = row.manufacturingOrders || [];
  const activeItems = items?.filter(item => item.status === 'ACTIVE');
  function open(next: typeof mode, id = '') { setSelected(id); setNote(''); setMode(next); }
  async function submit() {
    const suffix = mode === 'unlink' ? selected + '/unlink' : mode;
    const body = mode === 'create' ? { inventoryItemId: itemId, quantity, responsibleUserId: responsible, ...(delivery ? { requestedDeliveryAt: delivery } : {}) } : mode === 'link' ? { manufacturingOrderId: selected } : { note };
    if (await change('/manufacturing-orders/' + suffix, body)) { setMode(''); setSelected(''); setItemId(''); setSearch(''); }
  }
  return <section className="space-y-3 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-medium">Fabricación de componentes</h2>
      {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => open('create')}><Factory />Crear OF</Button><Button variant="outline" disabled={busy} onClick={() => open('link')}><Link2 />Vincular OF</Button></div>}
    </div>
    {!links.length && <p className="text-sm text-gray-500">Sin órdenes de fabricación vinculadas.</p>}
    {links.map(({ id, revision, manufacturingOrder: order }) => <div key={id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
      <div className="min-w-0 flex-1"><Link href={'/manufacturing/' + order.id} className="break-words font-medium text-emerald-700 underline">{order.number} · {order.productName}</Link><p className="mt-1 text-gray-500">Revisión {revision.revision} · Recibido {order.outputReceipts.reduce((sum, receipt) => sum + receipt.quantity, 0)} / {order.quantity}</p></div>
      <span>{manufacturingStatusLabel[order.status as ManufacturingOrderStatus] || order.status}</span>
      {editable && ['DRAFT', 'CANCELED'].includes(order.status) && <Button size="icon" variant="ghost" disabled={busy} title="Desvincular OF" aria-label={'Desvincular ' + order.number} onClick={() => open('unlink', id)}><Unlink /></Button>}
    </div>)}
    {mode && <Dialog open onOpenChange={value => { if (!value && !busy) setMode(''); }}><DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg bg-white text-gray-900">
      <DialogHeader><DialogTitle>{mode === 'create' ? 'Crear OF de componente' : mode === 'link' ? 'Vincular OF' : 'Desvincular OF'}</DialogTitle><DialogDescription>{row.number} · Revisión aprobada {row.approvedRevision}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); submit(); }}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          {mode === 'create' && <>
            <label className="grid gap-1 text-sm">Buscar componente<input className={input} value={search} onChange={event => { setSearch(event.target.value); setItemId(''); }} /></label>
            <label className="grid gap-1 text-sm">Componente *<select required className={input} value={itemId} onChange={event => setItemId(event.target.value)}><option value="">{searching ? 'Buscando...' : 'Seleccionar componente'}</option>{activeItems?.map(item => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label>
            {search.trim().length >= 2 && !searching && activeItems?.length === 0 && <p className="text-sm text-gray-500">Sin componentes coincidentes.</p>}
            {itemError && <p role="alert" className="text-sm text-red-700">{engineeringError(itemError)}</p>}
            <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Cantidad *<input className={input} type="number" required min={1} max={1000} step={1} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label><label className="grid gap-1 text-sm">Entrega solicitada<input className={input} type="date" value={delivery} onChange={event => setDelivery(event.target.value)} /></label></div>
            <label className="grid gap-1 text-sm">Responsable de fabricación *<select className={input} required value={responsible} onChange={event => setResponsible(event.target.value)}><option value="">Seleccionar responsable</option>{users.filter(user => ['ADMIN', 'TECH'].includes(user.role)).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          </>}
          {mode === 'link' && <>
            <div className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm">OF de componente en borrador *<select className={input} required value={selected} onChange={event => setSelected(event.target.value)}><option value="">{isLoading ? 'Cargando...' : 'Seleccionar OF'}</option>{candidates?.map(order => <option key={order.id} value={order.id}>{order.number} · {order.productName} · {order.quantity}</option>)}</select></label><Button size="icon" variant="outline" type="button" title="Actualizar OF disponibles" aria-label="Actualizar OF disponibles" onClick={() => mutate()}><RefreshCw /></Button></div>
            {!isLoading && candidates?.length === 0 && <p className="text-sm text-gray-500">No hay OF de componentes en borrador sin vínculos previos.</p>}
            {candidateError && <p role="alert" className="text-sm text-red-700">{engineeringError(candidateError)}</p>}
          </>}
          {mode === 'unlink' && <label className="grid gap-1 text-sm">Motivo *<textarea className={input} required maxLength={10000} value={note} onChange={event => setNote(event.target.value)} /></label>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={() => setMode('')}>Volver</Button><Button type="submit" disabled={busy || (mode === 'create' && !itemId) || (mode === 'link' && !selected)}>{mode === 'create' ? <Factory /> : mode === 'link' ? <Link2 /> : <Unlink />}{busy ? 'Guardando...' : mode === 'create' ? 'Crear OF' : mode === 'link' ? 'Vincular OF' : 'Desvincular OF'}</Button></div>
      </form>
    </DialogContent></Dialog>}
  </section>;
}
