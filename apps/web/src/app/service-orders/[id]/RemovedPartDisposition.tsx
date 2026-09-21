'use client';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const options: Record<string, string> = { ANALYSIS: 'Devuelta para análisis', REPAIR: 'Reparación', REUSE: 'Reutilización', SUPPLIER_RETURN: 'Retorno al proveedor', SCRAP: 'Chatarra', CUSTOMER: 'Entregada al cliente', NOT_RECOVERED: 'No recuperada' };
export function RemovedPartDisposition({ serviceOrderId, demands, auth, onChanged }: { serviceOrderId: string; demands: any[]; auth: { token?: string; tenantSlug?: string }; onChanged: () => any }) {
  const [target, setTarget] = useState(''); const [disposition, setDisposition] = useState('ANALYSIS'); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const installed = demands.filter(d => Number(d.installedQuantity) > 0);
  if (!installed.length) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault(); const demand = installed.find(d => d.id === target); if (!demand) return;
    setBusy(true); setError('');
    try { await apiFetch(`/service-orders/${serviceOrderId}/part-demands/${target}`, { method: 'PATCH', token: auth.token!, tenantSlug: auth.tenantSlug!, body: { lockVersion: demand.lockVersion, removedPartDisposition: { disposition, notes } } }); await onChanged(); setTarget(''); setNotes(''); }
    catch (e: any) { setError(e.message || 'No se pudo registrar'); } finally { setBusy(false); }
  }
  return <section className="rounded border p-3 space-y-2"><h3 className="font-medium">Disposición de piezas retiradas</h3>{installed.map(d => <div key={d.id} className="text-sm"><span>{d.inventoryItem?.sku} · {d.installedQuantity} instaladas. </span>{d.removedPartDisposition ? <span>{options[d.removedPartDisposition.disposition]}: {d.removedPartDisposition.notes} · {d.removedPartDisposition.byName}</span> : <span className="text-amber-800">Disposición pendiente</span>} <button type="button" className="underline" onClick={() => { setTarget(d.id); setDisposition(d.removedPartDisposition?.disposition || 'ANALYSIS'); setNotes(d.removedPartDisposition?.notes || ''); }}>Registrar / actualizar</button></div>)}{target ? <form onSubmit={save} className="space-y-2"><select aria-label="Disposición" className="border rounded px-3 py-2 w-full" value={disposition} onChange={e => setDisposition(e.target.value)}>{Object.entries(options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><textarea required aria-label="Observaciones de disposición" placeholder="Observaciones, cantidad, destinatario o referencia del análisis" className="border rounded p-2 w-full" value={notes} onChange={e => setNotes(e.target.value)} /><button disabled={busy} className="border rounded px-3 py-2">Guardar disposición</button><button type="button" className="ml-3" onClick={() => setTarget('')}>Cancelar</button></form> : null}{error ? <p role="alert" className="text-red-700">{error}</p> : null}</section>;
}
