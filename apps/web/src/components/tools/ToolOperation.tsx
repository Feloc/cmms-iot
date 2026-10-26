'use client';
import { FormEvent, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { ToolAuth, ToolDetail, ToolLoan, ToolUser, toolConditions, toolError, toolInput } from '@/lib/tools';
export type ToolOperationKind = 'lend' | 'return' | 'condition' | 'receive';
const titles = { lend: 'Entregar herramienta', return: 'Registrar devolución', condition: 'Cambiar condición', receive: 'Ingresar unidades' };
export default function ToolOperation({ kind, tool, loan, users, auth, onClose, onSaved }: { kind: ToolOperationKind; tool: ToolDetail; loan?: ToolLoan; users: ToolUser[]; auth: ToolAuth; onClose: () => void; onSaved: (tool: ToolDetail) => void }) {
  const [version] = useState(tool.version);
  const [form, setForm] = useState({ quantity: kind === 'return' && loan ? loan.quantity - loan.returnedQty : 1, recipientUserId: '', destination: '', expectedReturnOn: '', condition: 'GOOD', from: tool.availableQty ? 'GOOD' : tool.maintenanceQty ? 'MAINTENANCE' : 'DAMAGED', to: tool.availableQty ? 'MAINTENANCE' : 'GOOD', note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = (key: string, value: string | number) => setForm(f => ({ ...f, [key]: value }));
  const stocks: Record<string, number> = { GOOD: tool.availableQty, MAINTENANCE: tool.maintenanceQty, DAMAGED: tool.damagedQty };
  const max = kind === 'lend' ? tool.availableQty : kind === 'return' && loan ? loan.quantity - loan.returnedQty : kind === 'condition' ? stocks[form.from] : 1000000 - tool.quantity;
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const routes = { lend: 'loans', return: `loans/${loan?.id}/return`, condition: 'condition', receive: 'receipts' };
    const specific = kind === 'lend' ? { recipientUserId: form.recipientUserId, destination: form.destination, expectedReturnOn: form.expectedReturnOn || undefined }
      : kind === 'return' ? { condition: form.condition } : kind === 'condition' ? { from: form.from, to: form.to } : {};
    try { onSaved(await apiFetch<ToolDetail>(`/tools/${tool.id}/${routes[kind]}`, { ...auth, method: 'POST', body: { version, quantity: form.quantity, note: form.note, ...specific } })); }
    catch (e) { setError(toolError(e)); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{titles[kind]}</DialogTitle><DialogDescription>{tool.code} · {tool.name}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-3">
    {kind === 'lend' && <><label className="grid gap-1 text-sm">Persona que recibe *<select required className={toolInput} value={form.recipientUserId} onChange={e => change('recipientUserId', e.target.value)}><option value="">Selecciona una persona</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></label><label className="grid gap-1 text-sm">Destino *<input required maxLength={200} className={toolInput} placeholder="Sede, taller o proyecto" value={form.destination} onChange={e => change('destination', e.target.value)} /></label><label className="grid gap-1 text-sm">Devolución prevista<input type="date" className={toolInput} value={form.expectedReturnOn} onChange={e => change('expectedReturnOn', e.target.value)} /></label><p className="text-xs text-gray-500">Se entregan unidades en buena condición.</p></>}
    {kind === 'return' && <><p className="text-sm">Recibida por {loan?.recipientName}. Regresa a {tool.location}.</p><label className="grid gap-1 text-sm">Condición al devolver *<select className={toolInput} value={form.condition} onChange={e => change('condition', e.target.value)}>{Object.entries(toolConditions).filter(([k]) => k !== 'RETIRED').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></>}
    {kind === 'condition' && <><label className="grid gap-1 text-sm">Condición de origen<select className={toolInput} value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value, to: e.target.value === 'GOOD' ? 'MAINTENANCE' : 'GOOD', quantity: 1 }))}>{Object.entries(stocks).filter(([, qty]) => qty > 0).map(([k, qty]) => <option key={k} value={k}>{toolConditions[k]} ({qty})</option>)}</select></label><label className="grid gap-1 text-sm">Nueva condición<select className={toolInput} value={form.to} onChange={e => change('to', e.target.value)}>{Object.entries(toolConditions).filter(([k]) => k !== form.from).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{form.to === 'RETIRED' && <p className="text-sm text-amber-800">La baja conserva el historial y retira estas unidades del uso. Verifica la cantidad y el motivo antes de guardar.</p>}</>}
    <label className="grid gap-1 text-sm">Cantidad *<input required type="number" min={1} max={max} step={1} className={toolInput} value={form.quantity} onChange={e => change('quantity', Number(e.target.value))} /><span className="text-xs text-gray-500">Máximo: {max}</span></label>
    <label className="grid gap-1 text-sm">{['condition', 'receive'].includes(kind) ? 'Motivo *' : 'Observaciones'}<textarea required={['condition', 'receive'].includes(kind) || (kind === 'return' && form.condition !== 'GOOD')} maxLength={2000} rows={3} className={toolInput} value={form.note} onChange={e => change('note', e.target.value)} /></label>
  </fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy || max < 1}>{busy ? 'Guardando…' : titles[kind]}</Button></div></form></DialogContent></Dialog>;
}
