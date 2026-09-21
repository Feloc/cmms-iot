'use client';
import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';
import type { ManufacturingOrder } from '@/lib/manufacturing';

export function EnableQuickFlow({ order, auth, onChanged }: { order: ManufacturingOrder; auth: { token?: string; tenantSlug?: string }; onChanged: () => any }) {
  const itemId = order.outputInventoryItem?.id;
  const { data: profiles, error } = useApiSWR<any[]>(itemId ? `/manufacturing/quick-profiles/items/${itemId}` : null, auth.token, auth.tenantSlug);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const profile = profiles?.find(p => p.status === 'APPROVED' && (!p.validUntil || new Date(p.validUntil) > new Date()));
  async function enable() {
    if (!profile || !window.confirm('¿Activar la receta aprobada y reservar materiales para esta OF? Solo se admite si aún no tiene ingeniería ni ejecución.')) return;
    setBusy(true); setMessage('');
    try { await apiFetch(`/manufacturing/orders/${order.id}/quick-enable`, { method: 'POST', token: auth.token!, tenantSlug: auth.tenantSlug!, body: { profileId: profile.id, version: order.version } }); await onChanged(); }
    catch (e: any) { setMessage(e.message || 'No se pudo activar'); } finally { setBusy(false); }
  }
  if (!itemId) return null;
  return <div className="border border-violet-200 rounded p-4 space-y-2"><p className="font-medium">¿Pieza sencilla y repetitiva?</p><p className="text-sm">Puedes activar una receta aprobada si la OF aún no tiene ingeniería ni ejecución registrada.</p>{profile ? <button disabled={busy} onClick={enable} className="bg-violet-700 text-white rounded px-3 py-2">Activar flujo abreviado · receta rev. {profile.revision}</button> : <Link className="underline text-violet-700" href={`/inventory/${itemId}/manufacturing`}>Configurar y aprobar perfil de fabricación</Link>}{error || message ? <p role="alert" className="text-red-700">{message || 'No se pudo consultar el perfil.'}</p> : null}</div>;
}
