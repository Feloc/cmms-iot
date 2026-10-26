'use client';
import { FormEvent, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { Tool, ToolAuth, ToolDetail, ToolUser, toolConditions, toolError, toolInput } from '@/lib/tools';

export default function ToolForm({ tool, users, auth, onClose, onSaved }: { tool?: Tool; users: ToolUser[]; auth: ToolAuth; onClose: () => void; onSaved: (tool: ToolDetail) => void }) {
  const [version] = useState(tool?.version);
  const [form, setForm] = useState({ code: tool?.code || '', name: tool?.name || '', category: tool?.category || '', tracking: tool?.tracking || 'UNIT', quantity: tool?.quantity || 1,
    initialCondition: 'GOOD', brand: tool?.brand || '', model: tool?.model || '', serialNumber: tool?.serialNumber || '', location: tool?.location || '',
    responsibleUserId: tool?.responsibleUserId || '', acquiredOn: tool?.acquiredOn?.slice(0, 10) || '', notes: tool?.notes || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const change = (key: string, value: string | number) => setForm(f => ({ ...f, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { tracking, quantity, initialCondition, ...fields } = form;
      const body = { ...fields, serialNumber: tracking === 'UNIT' ? fields.serialNumber : '', acquiredOn: fields.acquiredOn || undefined,
        ...(tool ? { version } : { tracking, quantity: tracking === 'UNIT' ? 1 : quantity, initialCondition }) };
      const result = await apiFetch<ToolDetail>(tool ? `/tools/${tool.id}` : '/tools', { ...auth, method: tool ? 'PATCH' : 'POST', body });
      onSaved(result);
    } catch (e) { setError(toolError(e)); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{tool ? 'Editar herramienta' : 'Registrar herramienta'}</DialogTitle><DialogDescription>Identificación, ubicación de almacenamiento y responsable habitual. Las entregas se registran desde la ficha.</DialogDescription></DialogHeader>
    <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Código interno *<input autoFocus required maxLength={80} className={toolInput} value={form.code} onChange={e => change('code', e.target.value)} placeholder="HER-00045" /></label>
      <label className="grid gap-1 text-sm">Nombre *<input required maxLength={200} className={toolInput} value={form.name} onChange={e => change('name', e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Categoría<input maxLength={100} className={toolInput} value={form.category} onChange={e => change('category', e.target.value)} placeholder="Eléctrica, manual, medición…" /></label>
      <label className="grid gap-1 text-sm">Control<select disabled={!!tool} className={toolInput} value={form.tracking} onChange={e => setForm(f => ({ ...f, tracking: e.target.value as 'UNIT' | 'QUANTITY', quantity: 1, serialNumber: '' }))}><option value="UNIT">Individual (con código propio)</option><option value="QUANTITY">Por cantidad (grupo de iguales)</option></select></label>
      {!tool && <><label className="grid gap-1 text-sm">Cantidad inicial *<input required type="number" min={1} max={1000000} step={1} disabled={form.tracking === 'UNIT'} className={toolInput} value={form.quantity} onChange={e => change('quantity', Number(e.target.value))} /></label><label className="grid gap-1 text-sm">Condición inicial<select className={toolInput} value={form.initialCondition} onChange={e => change('initialCondition', e.target.value)}>{Object.entries(toolConditions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></>}
      <label className="grid gap-1 text-sm">Marca<input maxLength={100} className={toolInput} value={form.brand} onChange={e => change('brand', e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Modelo<input maxLength={100} className={toolInput} value={form.model} onChange={e => change('model', e.target.value)} /></label>
      {form.tracking === 'UNIT' && <label className="grid gap-1 text-sm">Serial<input maxLength={100} className={toolInput} value={form.serialNumber} onChange={e => change('serialNumber', e.target.value)} /></label>}
      <label className="grid gap-1 text-sm">Ubicación de almacenamiento *<input required maxLength={200} className={toolInput} value={form.location} onChange={e => change('location', e.target.value)} placeholder="Bodega principal / estante A" /></label>
      <label className="grid gap-1 text-sm">Responsable habitual<select className={toolInput} value={form.responsibleUserId} onChange={e => change('responsibleUserId', e.target.value)}><option value="">Sin asignar</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}</select></label>
      <label className="grid gap-1 text-sm">Fecha de compra<input type="date" className={toolInput} value={form.acquiredOn} onChange={e => change('acquiredOn', e.target.value)} /></label>
      <label className="grid gap-1 text-sm sm:col-span-2">Observaciones<textarea rows={3} maxLength={5000} className={toolInput} value={form.notes} onChange={e => change('notes', e.target.value)} /></label>
    </fieldset>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy}>{busy ? 'Guardando…' : 'Guardar herramienta'}</Button></div></form>
  </DialogContent></Dialog>;
}
