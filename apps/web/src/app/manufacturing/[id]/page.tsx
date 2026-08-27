'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { EngineeringDocumentsTab } from './EngineeringDocumentsTab';
import { ManufacturingBomTab } from './ManufacturingBomTab';
import { EngineeringReleasesTab } from './EngineeringReleasesTab';
import { ManufacturingSupplyTab } from './ManufacturingSupplyTab';
import { ManufacturingKitsTab } from './ManufacturingKitsTab';
import { ManufacturingAssemblyTab } from './ManufacturingAssemblyTab';
import { ManufacturingFatTab } from './ManufacturingFatTab';
import {
  dateLabel,
  localDateInput,
  type ManufacturedUnit,
  type ManufacturingAuditEvent,
  type ManufacturingMemberFunction,
  type ManufacturingOrder,
  type ManufacturingUser,
  manufacturingStatusClass,
  manufacturingStatusLabel,
  memberFunctionLabel,
  type Paginated,
} from '@/lib/manufacturing';

type Tab = 'summary' | 'units' | 'members' | 'engineering' | 'bom' | 'releases' | 'supply' | 'kits' | 'assembly' | 'fat' | 'history';

export default function ManufacturingDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = String((session as any)?.user?.role || '');
  const currentUserId = String((session as any)?.user?.id || (session as any)?.user?.sub || '');
  const isAdmin = role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('summary');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error, isLoading, mutate } = useApiSWR<ManufacturingOrder>(id ? `/manufacturing/orders/${id}` : null, auth.token, auth.tenantSlug);
  const { data: users } = useApiSWR<ManufacturingUser[]>(isAdmin ? '/users' : null, auth.token, auth.tenantSlug);
  const { data: history, mutate: mutateHistory } = useApiSWR<Paginated<ManufacturingAuditEvent>>(id && tab === 'history' ? `/manufacturing/orders/${id}/history?size=100` : null, auth.token, auth.tenantSlug);

  async function orderAction(action: 'hold' | 'resume' | 'cancel') {
    if (!auth.token || !auth.tenantSlug || !data) return;
    let body: any;
    if (action !== 'resume') {
      const reason = window.prompt(action === 'hold' ? 'Motivo de la pausa:' : 'Motivo de la cancelación:');
      if (!reason?.trim()) return;
      body = { reason: reason.trim() };
    }
    setBusy(true); setMessage('');
    try {
      const next = await apiFetch<ManufacturingOrder>(`/manufacturing/orders/${id}/${action}`, {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body,
      });
      await mutate(next, { revalidate: false });
      await mutateHistory();
    } catch (err: any) {
      setMessage(err?.message || 'No se pudo actualizar la orden');
    } finally { setBusy(false); }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6 text-gray-500">Cargando orden de manufactura…</div>;
  if (error || !data) return <div className="p-6 text-red-700">No se pudo cargar la orden de manufactura.</div>;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'summary', label: 'Resumen' }, { key: 'units', label: `Unidades (${data.units?.length || 0})` },
    { key: 'members', label: 'Equipo' }, { key: 'engineering', label: 'Ingeniería' },
    { key: 'bom', label: 'BOM' }, { key: 'releases', label: 'Liberaciones' }, { key: 'supply', label: 'Abastecimiento' }, { key: 'kits', label: 'Kits' }, { key: 'assembly', label: 'Ejecución ensamble' }, { key: 'fat', label: 'FAT' },
    { key: 'history', label: 'Historial' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href="/manufacturing" className="text-sm text-gray-600 hover:underline">← Manufactura</Link><h1 className="text-2xl font-semibold mt-1">{data.number} · {data.projectName}</h1><p className="text-sm text-gray-600">{[data.productCode, data.productName, data.model].filter(Boolean).join(' · ')}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-sm ${manufacturingStatusClass[data.status]}`}>{manufacturingStatusLabel[data.status]}</span>
          {isAdmin && data.status !== 'CANCELED' ? data.status === 'ON_HOLD' ? <button disabled={busy} className="border rounded px-3 py-2 text-sm" onClick={() => orderAction('resume')}>Reanudar</button> : <button disabled={busy} className="border rounded px-3 py-2 text-sm" onClick={() => orderAction('hold')}>Pausar</button> : null}
          {isAdmin && data.status !== 'CANCELED' ? <button disabled={busy} className="border border-red-200 text-red-700 rounded px-3 py-2 text-sm" onClick={() => orderAction('cancel')}>Cancelar</button> : null}
        </div>
      </div>

      {message ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm whitespace-pre-wrap">{message}</div> : null}
      {data.status === 'ON_HOLD' ? <div className="border border-amber-200 bg-amber-50 text-amber-900 rounded p-3 text-sm"><strong>Orden en pausa:</strong> {data.holdReason}</div> : null}
      {data.status === 'CANCELED' ? <div className="border border-red-200 bg-red-50 text-red-800 rounded p-3 text-sm"><strong>Orden cancelada:</strong> {data.canceledReason}</div> : null}

      <div className="border-b overflow-x-auto"><div className="flex min-w-max">{tabs.map((item) => <button key={item.key} className={`px-4 py-2 text-sm border-b-2 ${tab === item.key ? 'border-black font-medium' : 'border-transparent text-gray-600'}`} onClick={() => setTab(item.key)}>{item.label}</button>)}</div></div>

      {tab === 'summary' ? <Summary order={data} isAdmin={isAdmin} users={users || []} auth={auth} onSaved={(next) => mutate(next, { revalidate: false })} /> : null}
      {tab === 'units' ? <Units order={data} isAdmin={isAdmin} auth={auth} onSaved={(next) => mutate(next, { revalidate: false })} /> : null}
      {tab === 'members' ? <Members order={data} users={users || []} isAdmin={isAdmin} auth={auth} onSaved={(next) => mutate(next, { revalidate: false })} /> : null}
      {tab === 'engineering' ? <EngineeringDocumentsTab order={data} role={role} currentUserId={currentUserId} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'bom' ? <ManufacturingBomTab order={data} role={role} currentUserId={currentUserId} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'releases' ? <EngineeringReleasesTab order={data} role={role} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'supply' ? <ManufacturingSupplyTab order={data} role={role} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'kits' ? <ManufacturingKitsTab order={data} role={role} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'assembly' ? <ManufacturingAssemblyTab order={data} role={role} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'fat' ? <ManufacturingFatTab order={data} role={role} auth={auth} onChanged={() => mutate()} /> : null}
      {tab === 'history' ? <History items={history?.items || []} /> : null}
    </div>
  );
}

function Summary({ order, isAdmin, users, auth, onSaved }: { order: ManufacturingOrder; isAdmin: boolean; users: ManufacturingUser[]; auth: { token?: string; tenantSlug?: string }; onSaved: (order: ManufacturingOrder) => Promise<any> | any }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => summaryForm(order));
  useEffect(() => setForm(summaryForm(order)), [order]);
  const field = (name: keyof ReturnType<typeof summaryForm>, value: string) => setForm((current) => ({ ...current, [name]: value }));

  async function save() {
    if (!auth.token || !auth.tenantSlug) return;
    setBusy(true); setError('');
    try {
      const next = await apiFetch<ManufacturingOrder>(`/manufacturing/orders/${order.id}`, {
        method: 'PATCH', token: auth.token, tenantSlug: auth.tenantSlug,
        body: { ...form, version: order.version, quantity: Number(form.quantity), priority: form.priority || null },
      });
      await onSaved(next); setEditing(false);
    } catch (err: any) { setError(err?.message || 'No se pudieron guardar los cambios'); }
    finally { setBusy(false); }
  }

  if (editing) return <div className="border rounded-lg p-4 space-y-4"><div className="flex justify-between"><h2 className="font-semibold">Editar datos generales</h2><button className="text-sm underline" onClick={() => setEditing(false)}>Cerrar</button></div>{error ? <div className="text-sm text-red-700">{error}</div> : null}<div className="grid md:grid-cols-2 gap-3">
    <EditField label="Proyecto"><input className="border rounded px-3 py-2 w-full" value={form.projectName} onChange={(e) => field('projectName', e.target.value)} /></EditField>
    <EditField label="Producto"><input className="border rounded px-3 py-2 w-full" value={form.productName} onChange={(e) => field('productName', e.target.value)} /></EditField>
    <EditField label="Código"><input className="border rounded px-3 py-2 w-full" value={form.productCode} onChange={(e) => field('productCode', e.target.value)} /></EditField>
    <EditField label="Modelo"><input className="border rounded px-3 py-2 w-full" value={form.model} onChange={(e) => field('model', e.target.value)} /></EditField>
    <EditField label="Cantidad"><input type="number" min={1} max={1000} className="border rounded px-3 py-2 w-full" value={form.quantity} onChange={(e) => field('quantity', e.target.value)} /></EditField>
    <EditField label="Prioridad"><select className="border rounded px-3 py-2 w-full" value={form.priority} onChange={(e) => field('priority', e.target.value)}><option value="">Sin definir</option><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></EditField>
    <EditField label="Cliente"><input className="border rounded px-3 py-2 w-full" value={form.customerName} onChange={(e) => field('customerName', e.target.value)} /></EditField>
    <EditField label="Referencia cliente"><input className="border rounded px-3 py-2 w-full" value={form.customerReference} onChange={(e) => field('customerReference', e.target.value)} /></EditField>
    <EditField label="Referencia comercial"><input className="border rounded px-3 py-2 w-full" value={form.commercialReference} onChange={(e) => field('commercialReference', e.target.value)} /></EditField>
    <EditField label="Destino"><input className="border rounded px-3 py-2 w-full" value={form.destination} onChange={(e) => field('destination', e.target.value)} /></EditField>
    <EditField label="Inicio"><input type="date" className="border rounded px-3 py-2 w-full" value={form.plannedStartAt} onChange={(e) => field('plannedStartAt', e.target.value)} /></EditField>
    <EditField label="Fin"><input type="date" className="border rounded px-3 py-2 w-full" value={form.plannedEndAt} onChange={(e) => field('plannedEndAt', e.target.value)} /></EditField>
    <EditField label="Entrega"><input type="date" className="border rounded px-3 py-2 w-full" value={form.requestedDeliveryAt} onChange={(e) => field('requestedDeliveryAt', e.target.value)} /></EditField>
    <EditField label="Responsable"><select className="border rounded px-3 py-2 w-full" value={form.responsibleUserId} onChange={(e) => field('responsibleUserId', e.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></EditField>
  </div><EditField label="Descripción"><textarea className="border rounded px-3 py-2 w-full min-h-20" value={form.description} onChange={(e) => field('description', e.target.value)} /></EditField><div className="flex justify-end"><button disabled={busy} className="bg-black text-white rounded px-4 py-2" onClick={save}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></div></div>;

  return <div className="space-y-4"><div className="flex justify-between"><h2 className="text-lg font-semibold">Resumen de la orden</h2>{isAdmin && order.status !== 'CANCELED' ? <button className="border rounded px-3 py-2 text-sm" onClick={() => setEditing(true)}>Editar</button> : null}</div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
    <Info label="Cliente" value={order.customerName} sub={order.customerReference} /><Info label="Responsable" value={order.responsibleUser?.name} sub={order.responsibleUser?.email} /><Info label="Cantidad" value={String(order.quantity)} sub="unidades planificadas" /><Info label="Entrega solicitada" value={dateLabel(order.requestedDeliveryAt)} />
    <Info label="Inicio planificado" value={dateLabel(order.plannedStartAt)} /><Info label="Fin planificado" value={dateLabel(order.plannedEndAt)} /><Info label="Destino" value={order.destination} /><Info label="Referencia comercial" value={order.commercialReference} />
  </div>{order.description ? <div className="border rounded-lg p-4"><div className="text-xs text-gray-500 mb-1">Descripción y alcance</div><p className="text-sm whitespace-pre-wrap">{order.description}</p></div> : null}</div>;
}

function Units({ order, isAdmin, auth, onSaved }: { order: ManufacturingOrder; isAdmin: boolean; auth: { token?: string; tenantSlug?: string }; onSaved: (order: ManufacturingOrder) => Promise<any> | any }) {
  return <div className="space-y-3"><div><h2 className="text-lg font-semibold">Unidades físicas</h2><p className="text-sm text-gray-600">Los números de serie pueden asignarse durante la fabricación.</p></div><div className="grid md:grid-cols-2 gap-3">{(order.units || []).map((unit) => <UnitCard key={unit.id} unit={unit} orderId={order.id} editable={isAdmin && order.status !== 'CANCELED'} auth={auth} onSaved={onSaved} />)}</div></div>;
}

function UnitCard({ unit, orderId, editable, auth, onSaved }: { unit: ManufacturedUnit; orderId: string; editable: boolean; auth: { token?: string; tenantSlug?: string }; onSaved: (order: ManufacturingOrder) => Promise<any> | any }) {
  const [serialNumber, setSerialNumber] = useState(unit.serialNumber || '');
  const [internalCode, setInternalCode] = useState(unit.internalCode || '');
  const [status, setStatus] = useState(unit.status);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { setSerialNumber(unit.serialNumber || ''); setInternalCode(unit.internalCode || ''); setStatus(unit.status); }, [unit]);
  async function save() { if (!auth.token || !auth.tenantSlug) return; setBusy(true); setError(''); try { const next = await apiFetch<ManufacturingOrder>(`/manufacturing/orders/${orderId}/units/${unit.id}`, { method: 'PATCH', token: auth.token, tenantSlug: auth.tenantSlug, body: { serialNumber, internalCode, status } }); await onSaved(next); } catch (err: any) { setError(err?.message || 'No se pudo actualizar'); } finally { setBusy(false); } }
  return <div className="border rounded-lg p-4 space-y-3"><div className="flex justify-between"><strong>Unidad {unit.unitNumber}</strong><span className={`text-xs px-2 py-1 rounded-full ${status === 'PLANNED' ? 'bg-sky-100 text-sky-800' : 'bg-red-100 text-red-800'}`}>{status === 'PLANNED' ? 'Planificada' : 'Cancelada'}</span></div>{error ? <div className="text-xs text-red-700">{error}</div> : null}<div className="grid grid-cols-2 gap-2"><EditField label="Código interno"><input disabled={!editable} className="border rounded px-3 py-2 w-full disabled:bg-gray-50" value={internalCode} onChange={(e) => setInternalCode(e.target.value)} /></EditField><EditField label="Número de serie"><input disabled={!editable} className="border rounded px-3 py-2 w-full disabled:bg-gray-50" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></EditField></div>{editable ? <div className="flex justify-between"><select className="border rounded px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as ManufacturedUnit['status'])}><option value="PLANNED">Planificada</option><option value="CANCELED">Cancelada</option></select><button disabled={busy} className="border rounded px-3 py-1.5 text-sm" onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button></div> : null}</div>;
}

function Members({ order, users, isAdmin, auth, onSaved }: { order: ManufacturingOrder; users: ManufacturingUser[]; isAdmin: boolean; auth: { token?: string; tenantSlug?: string }; onSaved: (order: ManufacturingOrder) => Promise<any> | any }) {
  const [draft, setDraft] = useState<Array<{ userId: string; function: ManufacturingMemberFunction }>>([]);
  const [userId, setUserId] = useState(''); const [fn, setFn] = useState<ManufacturingMemberFunction>('ENGINEERING'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => setDraft((order.members || []).map((member) => ({ userId: member.userId, function: member.function }))), [order]);
  const add = () => { if (!userId || draft.some((item) => item.userId === userId && item.function === fn)) return; setDraft((current) => [...current, { userId, function: fn }]); setUserId(''); };
  async function save() { if (!auth.token || !auth.tenantSlug) return; setBusy(true); setError(''); try { const next = await apiFetch<ManufacturingOrder>(`/manufacturing/orders/${order.id}/members`, { method: 'PUT', token: auth.token, tenantSlug: auth.tenantSlug, body: { members: draft.filter((member) => member.function !== 'RESPONSIBLE') } }); await onSaved(next); } catch (err: any) { setError(err?.message || 'No se pudo guardar el equipo'); } finally { setBusy(false); } }
  return <div className="space-y-4"><div><h2 className="text-lg font-semibold">Equipo de la orden</h2><p className="text-sm text-gray-600">El responsable general se mantiene automáticamente.</p></div>{error ? <div className="text-sm text-red-700">{error}</div> : null}<div className="space-y-2">{draft.map((member, index) => { const user = users.find((item) => item.id === member.userId) || order.members?.find((item) => item.userId === member.userId)?.user; return <div key={`${member.userId}:${member.function}`} className="border rounded p-3 flex justify-between items-center"><div><div className="font-medium text-sm">{user?.name || member.userId}</div><div className="text-xs text-gray-500">{memberFunctionLabel[member.function]}</div></div>{isAdmin && member.function !== 'RESPONSIBLE' ? <button className="text-sm text-red-700" onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar</button> : null}</div>; })}</div>{isAdmin && order.status !== 'CANCELED' ? <div className="border rounded-lg p-3 space-y-3"><div className="grid md:grid-cols-[1fr_180px_auto] gap-2"><select className="border rounded px-3 py-2 w-full" value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">Seleccionar usuario…</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><select className="border rounded px-3 py-2 w-full" value={fn} onChange={(e) => setFn(e.target.value as ManufacturingMemberFunction)}><option value="ENGINEERING">Ingeniería</option><option value="REVIEWER">Revisor</option><option value="OBSERVER">Observador</option></select><button type="button" className="border rounded px-3 py-2" onClick={add}>Agregar</button></div><div className="flex justify-end"><button disabled={busy} className="bg-black text-white rounded px-4 py-2 text-sm" onClick={save}>{busy ? 'Guardando…' : 'Guardar equipo'}</button></div></div> : null}</div>;
}

function History({ items }: { items: ManufacturingAuditEvent[] }) { return <div className="space-y-3"><div><h2 className="text-lg font-semibold">Historial auditable</h2><p className="text-sm text-gray-600">Acciones relevantes realizadas sobre la orden.</p></div>{!items.length ? <div className="border rounded p-8 text-center text-gray-500">No hay eventos.</div> : <div className="border rounded-lg divide-y">{items.map((item) => <div key={item.id} className="p-4 flex gap-4"><div className="w-2 h-2 mt-2 rounded-full bg-gray-400 shrink-0" /><div className="flex-1"><div className="font-medium text-sm">{item.summary}</div><div className="text-xs text-gray-500">{item.actorName} · {dateLabel(item.createdAt, true)} · {item.action}</div>{item.metadata?.reason ? <div className="text-sm mt-1">Motivo: {String(item.metadata.reason)}</div> : null}</div></div>)}</div>}</div>; }

function ComingSoon({ title, text }: { title: string; text: string }) { return <div className="border border-dashed rounded-lg p-10 text-center"><h2 className="font-semibold">{title}</h2><p className="text-sm text-gray-600 mt-1">{text}</p></div>; }
function Info({ label, value, sub }: { label: string; value?: string | null; sub?: string | null }) { return <div className="border rounded-lg p-3"><div className="text-xs text-gray-500">{label}</div><div className="font-medium mt-1">{value || '—'}</div>{sub ? <div className="text-xs text-gray-500">{sub}</div> : null}</div>; }
function EditField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm space-y-1"><span className="text-gray-600">{label}</span>{children}</label>; }
function summaryForm(order: ManufacturingOrder) { return { projectName: order.projectName, productName: order.productName, productCode: order.productCode || '', model: order.model || '', quantity: String(order.quantity), priority: order.priority || '', customerName: order.customerName || '', customerReference: order.customerReference || '', commercialReference: order.commercialReference || '', destination: order.destination || '', description: order.description || '', requestedDeliveryAt: localDateInput(order.requestedDeliveryAt), plannedStartAt: localDateInput(order.plannedStartAt), plannedEndAt: localDateInput(order.plannedEndAt), responsibleUserId: order.responsibleUserId }; }
