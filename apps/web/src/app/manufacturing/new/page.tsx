'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import type { ManufacturingOrder, ManufacturingUser } from '@/lib/manufacturing';

const initialForm = {
  projectName: '', productCode: '', productName: '', model: '', quantity: '1', priority: '',
  customerName: '', customerReference: '', commercialReference: '', destination: '', description: '',
  requestedDeliveryAt: '', plannedStartAt: '', plannedEndAt: '', responsibleUserId: '',
};

export default function NewManufacturingOrderPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = String((session as any)?.user?.role || '');
  const { data: users } = useApiSWR<ManufacturingUser[]>('/users', auth.token, auth.tenantSlug);
  const [form, setForm] = useState(initialForm);
  const [engineeringUserIds, setEngineeringUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function field(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.token || !auth.tenantSlug) return;
    setBusy(true);
    setError('');
    try {
      const order = await apiFetch<ManufacturingOrder>('/manufacturing/orders', {
        method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug,
        body: {
          ...form,
          quantity: Number(form.quantity),
          priority: form.priority || null,
          requestedDeliveryAt: form.requestedDeliveryAt || null,
          plannedStartAt: form.plannedStartAt || null,
          plannedEndAt: form.plannedEndAt || null,
          members: engineeringUserIds.map((userId) => ({ userId, function: 'ENGINEERING' })),
        },
      });
      router.push(`/manufacturing/${order.id}`);
    } catch (err: any) {
      setError(err?.message || 'No se pudo crear la orden');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (role !== 'ADMIN') return <div className="p-6">Solo un administrador puede crear órdenes de manufactura.</div>;

  return (
    <form onSubmit={submit} className="p-4 md:p-6 max-w-5xl space-y-5">
      <div><h1 className="text-2xl font-semibold">Nueva orden de manufactura</h1><p className="text-sm text-gray-600">El número OF se asignará automáticamente al guardar.</p></div>
      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3 text-sm">{error}</div> : null}

      <Section title="Identificación">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nombre del proyecto *"><input required className="border rounded px-3 py-2 w-full" value={form.projectName} onChange={(e) => field('projectName', e.target.value)} placeholder="Ej. Paletizador línea 3" /></Field>
          <Field label="Producto o máquina *"><input required className="border rounded px-3 py-2 w-full" value={form.productName} onChange={(e) => field('productName', e.target.value)} placeholder="Ej. Paletizador automático" /></Field>
          <Field label="Código de producto"><input className="border rounded px-3 py-2 w-full" value={form.productCode} onChange={(e) => field('productCode', e.target.value)} /></Field>
          <Field label="Modelo o variante"><input className="border rounded px-3 py-2 w-full" value={form.model} onChange={(e) => field('model', e.target.value)} /></Field>
          <Field label="Cantidad *"><input required min={1} max={1000} type="number" className="border rounded px-3 py-2 w-full" value={form.quantity} onChange={(e) => field('quantity', e.target.value)} /></Field>
          <Field label="Prioridad"><select className="border rounded px-3 py-2 w-full" value={form.priority} onChange={(e) => field('priority', e.target.value)}><option value="">Sin definir</option><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></select></Field>
        </div>
      </Section>

      <Section title="Cliente y referencias">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Cliente"><input className="border rounded px-3 py-2 w-full" value={form.customerName} onChange={(e) => field('customerName', e.target.value)} /></Field>
          <Field label="Pedido o referencia del cliente"><input className="border rounded px-3 py-2 w-full" value={form.customerReference} onChange={(e) => field('customerReference', e.target.value)} /></Field>
          <Field label="Referencia comercial interna"><input className="border rounded px-3 py-2 w-full" value={form.commercialReference} onChange={(e) => field('commercialReference', e.target.value)} /></Field>
          <Field label="Destino"><input className="border rounded px-3 py-2 w-full" value={form.destination} onChange={(e) => field('destination', e.target.value)} /></Field>
        </div>
        <Field label="Descripción y alcance"><textarea className="border rounded px-3 py-2 w-full min-h-24" value={form.description} onChange={(e) => field('description', e.target.value)} /></Field>
      </Section>

      <Section title="Planeación">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Inicio planificado"><input type="date" className="border rounded px-3 py-2 w-full" value={form.plannedStartAt} onChange={(e) => field('plannedStartAt', e.target.value)} /></Field>
          <Field label="Fin planificado"><input type="date" className="border rounded px-3 py-2 w-full" value={form.plannedEndAt} onChange={(e) => field('plannedEndAt', e.target.value)} /></Field>
          <Field label="Entrega solicitada"><input type="date" className="border rounded px-3 py-2 w-full" value={form.requestedDeliveryAt} onChange={(e) => field('requestedDeliveryAt', e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="Responsables">
        <Field label="Responsable general *"><select required className="border rounded px-3 py-2 w-full" value={form.responsibleUserId} onChange={(e) => field('responsibleUserId', e.target.value)}><option value="">Seleccionar…</option>{(users || []).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></Field>
        <div><div className="text-sm font-medium mb-2">Integrantes de Ingeniería</div><div className="grid md:grid-cols-2 gap-2">{(users || []).map((user) => <label key={user.id} className="border rounded p-3 text-sm flex items-center gap-2"><input type="checkbox" checked={engineeringUserIds.includes(user.id)} onChange={(e) => setEngineeringUserIds((current) => e.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} /><span>{user.name}<span className="block text-xs text-gray-500">{user.email}</span></span></label>)}</div></div>
      </Section>

      <div className="flex justify-end gap-2"><button type="button" className="border rounded px-4 py-2" onClick={() => router.back()}>Cancelar</button><button className="rounded px-4 py-2 bg-black text-white disabled:opacity-50" disabled={busy}>{busy ? 'Creando…' : 'Crear orden'}</button></div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset className="border rounded-lg p-4 space-y-3"><legend className="px-1 font-semibold">{title}</legend>{children}</fieldset>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm space-y-1"><span className="font-medium">{label}</span>{children}</label>;
}
