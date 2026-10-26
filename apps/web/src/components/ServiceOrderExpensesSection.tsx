'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Download, ExternalLink, Pencil, Plus, Receipt, RefreshCcw, Trash2 } from 'lucide-react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { PUBLIC_API_BASE } from '@/lib/api-url';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const categories = {
  TRANSPORT: 'Transporte', MEALS: 'Alimentación', LODGING: 'Hospedaje', TOLLS: 'Peajes',
  PARKING: 'Parqueadero', MATERIALS: 'Materiales', OTHER: 'Otros',
} as const;
type Category = keyof typeof categories;
type PaidBy = 'EMPLOYEE' | 'COMPANY';
type ExpenseFields = { expenseDate: string; category: Category; description: string; amount: string; paidBy: PaidBy };
type ExpenseEvent = { id: string; action: string; actorName: string; createdAt: string; details: Record<string, any> };
type Expense = ExpenseFields & {
  id: string; version: number; createdByName: string; voidedAt: string | null; canEdit: boolean;
  receipts: { id: string; filename: string; size: number; mimeType: string }[];
  events: ExpenseEvent[];
};
type ExpenseData = {
  items: Expense[]; canCreate: boolean; currency: string;
  summary: { total: string; employeePaid: string; companyPaid: string; count: number; withoutReceipts: number; byCategory: { category: Category; label: string; total: string }[] };
};
const money = (amount: string) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(Number(amount));
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-CO');
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-gray-50';
const input = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';
const fileAccept = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

function emptyForm(): ExpenseFields {
  const today = new Date();
  const expenseDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return { expenseDate, category: 'TRANSPORT', description: '', amount: '', paidBy: 'EMPLOYEE' };
}

function checkFiles(files: File[], current = 0) {
  if (files.length + current > 10) throw new Error('Cada gasto admite máximo 10 soportes.');
  for (const file of files) {
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) throw new Error('Selecciona soportes en PDF, JPG, PNG o WebP.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Cada soporte debe pesar entre 1 byte y 10 MB.');
  }
  if (files.reduce((total, file) => total + file.size, 0) > 30 * 1024 * 1024) throw new Error('La carga de soportes supera 30 MB.');
}

function historyText(event: ExpenseEvent) {
  if (event.action === 'CREATED') return 'Registró el gasto';
  if (event.action === 'VOIDED') return 'Anuló el gasto';
  if (event.action === 'RECEIPTS_ADDED') return `Adjuntó: ${(event.details.receipts || []).map((file: { filename: string }) => file.filename).join(', ')}`;
  if (event.action === 'RECEIPT_REMOVED') return `Retiró el soporte: ${event.details.receipt?.filename || ''}`;
  if (event.action === 'UPDATED') {
    const before = event.details.before || {};
    const after = event.details.after || {};
    const display = (key: string, value: string) => key === 'amount' ? money(value) : key === 'category' ? categories[value as Category] : key === 'paidBy' ? (value === 'EMPLOYEE' ? 'Colaborador' : 'Empresa') : key === 'expenseDate' ? date(value) : value;
    const labels: Record<string, string> = { amount: 'Valor', category: 'Categoría', paidBy: 'Pagado por', expenseDate: 'Fecha', description: 'Concepto' };
    const changes = Object.keys(labels).filter(key => before[key] !== after[key]).map(key => `${labels[key]}: ${display(key, before[key])} → ${display(key, after[key])}`);
    return changes.length ? changes.join(' · ') : 'Guardó el gasto sin cambios';
  }
  return event.action;
}

export function ServiceOrderExpensesSection({ serviceOrderId }: { serviceOrderId: string }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const role = (session as any)?.user?.role;
  const [data, setData] = useState<ExpenseData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseFields>(emptyForm);
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState('');
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const path = `/service-orders/${encodeURIComponent(serviceOrderId)}/expenses`;

  const load = useCallback(async () => {
    if (!token || !tenantSlug || !['ADMIN', 'TECH'].includes(role)) return;
    setLoading(true);
    try {
      const result = await apiFetch<ExpenseData>(path, { token, tenantSlug });
      setData(result);
    } finally { setLoading(false); }
  }, [path, token, tenantSlug, role]);

  useEffect(() => {
    setData(null);
    setError('');
    load().catch(error => setError(error.message));
  }, [load]);

  async function fileRequest(endpoint: string, options?: RequestInit) {
    const response = await fetch(`${PUBLIC_API_BASE}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'x-tenant': tenantSlug!, ...options?.headers },
    });
    if (!response.ok) {
      const raw = await response.text();
      let message = raw;
      try { const parsed = JSON.parse(raw); message = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message || raw; } catch {}
      throw new Error(message || 'No se pudo procesar el archivo.');
    }
    return response;
  }

  function edit(expense: Expense | null) {
    setEditing(expense);
    setForm(expense ? { expenseDate: expense.expenseDate, category: expense.category, description: expense.description, amount: expense.amount, paidBy: expense.paidBy } : emptyForm());
    setFiles([]);
    setFormError('');
    setOpen(true);
  }

  async function upload(expenseId: string, selected: File[]) {
    const body = new FormData();
    selected.forEach(file => body.append('files', file));
    await fileRequest(`${path}/${expenseId}/receipts`, { method: 'POST', body });
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError('');
    setError('');
    setMessage('');
    let saved: Expense | null = null;
    try {
      checkFiles(files, editing?.receipts.length || 0);
      saved = await apiFetch<Expense>(editing ? `${path}/${editing.id}` : path, {
        method: editing ? 'PATCH' : 'POST', token, tenantSlug,
        body: { ...form, ...(editing ? { version: editing.version } : {}) },
      });
      // Preserve the saved ID if the separate upload fails, avoiding duplicate expenses on retry.
      setEditing(saved);
      if (files.length) await upload(saved.id, files);
      setFiles([]);
      setOpen(false);
      setMessage(editing ? 'Gasto actualizado.' : 'Gasto registrado.');
      await load().catch(error => setError(`El gasto quedó guardado. No se pudo actualizar la lista: ${error.message}`));
    } catch (error: any) {
      if (saved) {
        setFormError(`El gasto quedó guardado. ${error.message} Puedes volver a intentar adjuntar los soportes.`);
        load().catch(() => undefined);
      } else {
        setFormError(error.message || 'No se pudo guardar el gasto.');
        load().catch(() => undefined);
      }
    } finally { setBusy(false); }
  }

  async function attach(expense: Expense, selected: File[]) {
    setError(''); setMessage(''); setBusy(true);
    try {
      checkFiles(selected, expense.receipts.length);
      if (!selected.length) return;
      await upload(expense.id, selected);
      setMessage('Soportes adjuntados.');
      await load();
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function removeReceipt(expense: Expense, receiptId: string) {
    if (!window.confirm('¿Retirar este soporte? La acción quedará registrada en el historial.')) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      await apiFetch(`${path}/${expense.id}/receipts/${receiptId}`, { method: 'DELETE', token, tenantSlug });
      setMessage('Soporte retirado.');
      await load();
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function voidExpense() {
    if (!voiding) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      await apiFetch(`${path}/${voiding.id}/void`, { method: 'POST', token, tenantSlug, body: { version: voiding.version } });
      setVoiding(null);
      setMessage('Gasto anulado. Se conserva su historial y ya no suma al total.');
      await load();
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function download() {
    setError(''); setBusy(true);
    try {
      const response = await fileRequest(`${path}/export`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `gastos-servicio-${serviceOrderId.slice(-8)}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function viewReceipt(expense: Expense, receiptId: string) {
    const popup = window.open('', '_blank');
    setError('');
    try {
      const response = await fileRequest(`${path}/${expense.id}/receipts/${receiptId}`);
      const url = URL.createObjectURL(await response.blob());
      if (popup) popup.location.href = url;
      else { const link = document.createElement('a'); link.href = url; link.download = expense.receipts.find(receipt => receipt.id === receiptId)?.filename || 'soporte'; link.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error: any) { popup?.close(); setError(error.message); }
  }

  if (!['ADMIN', 'TECH'].includes(role)) return null;
  const visible = (data?.items || []).filter(expense => showVoided || !expense.voidedAt);
  const voidedCount = (data?.items || []).filter(expense => expense.voidedAt).length;

  return (
    <section className="space-y-4 rounded-lg border p-4" id="gastos-servicio" aria-labelledby="expense-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="expense-heading" className="flex items-center gap-2 font-semibold"><Receipt className="h-5 w-5" aria-hidden="true" />Gastos del servicio</h2><p className="mt-1 text-sm text-gray-600">Registra los gastos y adjunta las facturas. Valores en pesos colombianos (COP).</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy || loading} onClick={() => { setError(''); load().catch(error => setError(error.message)); }} aria-label="Actualizar gastos"><RefreshCcw className="h-4 w-4" /></button>
          <button type="button" className={button} disabled={!data || busy || loading} onClick={download}><Download className="h-4 w-4" aria-hidden="true" />Excel</button>
          {data?.canCreate && <button type="button" className={`${button} border-black bg-black text-white hover:bg-gray-800`} disabled={busy || loading} onClick={() => edit(null)}><Plus className="h-4 w-4" aria-hidden="true" />Agregar gasto</button>}
        </div>
      </div>
      {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {loading && <p role="status" className="text-sm text-gray-500">Cargando gastos…</p>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[['Total de gastos', data.summary.total], ['Pagado por colaboradores', data.summary.employeePaid], ['Pagado por la empresa', data.summary.companyPaid]].map(([label, amount]) => <div key={label} className="rounded-lg border bg-gray-50 p-3"><p className="text-xs text-gray-600">{label}</p><p className="mt-1 break-words text-lg font-semibold">{money(amount)}</p></div>)}
        </div>
        <p className="text-xs text-gray-600">{data.summary.count} gasto(s) vigente(s) · {data.summary.withoutReceipts} sin soporte. Los pagos de colaboradores permiten identificar posibles reembolsos.</p>
        <div className="flex flex-wrap gap-2" aria-label="Gastos por categoría">{data.summary.byCategory.filter(category => Number(category.total) > 0).map(category => <span key={category.category} className="rounded-full border px-3 py-1 text-xs">{category.label}: {money(category.total)}</span>)}</div>
        {voidedCount > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showVoided} onChange={event => setShowVoided(event.target.checked)} />Mostrar anulados ({voidedCount})</label>}
        <div className="space-y-3">
          {visible.map(expense => <article key={expense.id} className={`min-w-0 space-y-3 rounded-lg border p-3 ${expense.voidedAt ? 'bg-gray-50' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-gray-600">{date(expense.expenseDate)} · {categories[expense.category]}</span>{expense.voidedAt && <span className="rounded bg-gray-200 px-2 py-1 text-xs">Anulado</span>}{!expense.receipts.length && <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">Sin soporte</span>}</div><p className="mt-1 whitespace-pre-wrap break-words font-medium">{expense.description}</p><p className="mt-1 text-xs text-gray-600">Registrado por {expense.createdByName} · Pagado por {expense.paidBy === 'EMPLOYEE' ? 'colaborador' : 'empresa'}</p></div>
              <p className="font-semibold">{money(expense.amount)}</p>
            </div>
            <div className="space-y-2">{expense.receipts.map(receipt => <div key={receipt.id} className="flex min-w-0 items-center gap-2 text-sm"><button type="button" className="inline-flex min-w-0 items-center gap-2 text-left underline" onClick={() => viewReceipt(expense, receipt.id)}><ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="break-all">{receipt.filename}</span></button><span className="shrink-0 text-xs text-gray-500">{Math.ceil(receipt.size / 1024)} KB</span>{expense.canEdit && <button type="button" className="shrink-0 rounded p-2 text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={busy} aria-label={`Retirar soporte ${receipt.filename}`} onClick={() => removeReceipt(expense, receipt.id)}><Trash2 className="h-4 w-4" /></button>}</div>)}</div>
            {expense.canEdit && <div className="flex flex-wrap gap-2">
              <button type="button" className={button} disabled={busy || loading} onClick={() => edit(expense)}><Pencil className="h-4 w-4" aria-hidden="true" />Editar</button>
              {expense.receipts.length < 10 && <label className={`${button} cursor-pointer ${busy || loading ? 'pointer-events-none opacity-50' : ''}`}><Plus className="h-4 w-4" aria-hidden="true" />Adjuntar soporte<input type="file" className="sr-only" aria-label={`Adjuntar soporte a ${expense.description}`} accept={fileAccept} multiple disabled={busy || loading} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; attach(expense, selected); }} /></label>}
              <button type="button" className={`${button} text-red-700`} disabled={busy || loading} onClick={() => setVoiding(expense)}>Anular</button>
            </div>}
            <details className="text-xs text-gray-600"><summary className="cursor-pointer py-1">Historial ({expense.events.length})</summary><ol className="mt-2 space-y-2 border-l pl-3">{expense.events.map(event => <li className="break-words" key={event.id}><p>{historyText(event)}</p><p className="mt-0.5 text-gray-500">{event.actorName} · {new Date(event.createdAt).toLocaleString('es-CO')}</p></li>)}</ol></details>
          </article>)}
          {!visible.length && <p className="py-4 text-center text-sm text-gray-500">Aún no hay gastos registrados para este servicio.</p>}
        </div>
      </>}
      <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar gasto' : 'Agregar gasto'}</DialogTitle><DialogDescription>Registra el gasto en COP. Puedes adjuntar la factura ahora o después.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={save}>
            <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Fecha del gasto</span><input className={input} type="date" required value={form.expenseDate} onChange={event => setForm({ ...form, expenseDate: event.target.value })} /></label><label className="space-y-1 text-sm"><span>Categoría</span><select className={input} value={form.category} onChange={event => setForm({ ...form, category: event.target.value as Category })}>{Object.entries(categories).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label></div>
              <label className="block space-y-1 text-sm"><span>Concepto</span><textarea className={input} rows={3} required maxLength={1000} placeholder="Ej. Transporte al lugar del servicio" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
              <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Valor (COP)</span><input className={input} type="number" inputMode="decimal" min="0.01" max="999999999999.99" step="0.01" required placeholder="0" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label><label className="space-y-1 text-sm"><span>Pagado por</span><select className={input} value={form.paidBy} onChange={event => setForm({ ...form, paidBy: event.target.value as PaidBy })}><option value="EMPLOYEE">Colaborador</option><option value="COMPANY">Empresa</option></select></label></div>
              <div className="space-y-2"><label className="block space-y-1 text-sm"><span>Facturas o soportes (opcional)</span><input className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-gray-50 file:px-3 file:py-2" type="file" accept={fileAccept} multiple onChange={event => { const selected = [...files, ...Array.from(event.target.files || [])]; event.target.value = ''; try { checkFiles(selected, editing?.receipts.length || 0); setFiles(selected); setFormError(''); } catch (error: any) { setFormError(error.message); } }} /></label><p className="text-xs text-gray-500">PDF, JPG, PNG o WebP. Hasta 10 soportes por gasto; máximo 10 MB por archivo y 30 MB por carga.{editing?.receipts.length ? ` Ya hay ${editing.receipts.length} soporte(s) adjunto(s).` : ''}</p>{files.map((file, index) => <div className="flex min-w-0 items-center justify-between gap-2 text-xs" key={`${file.name}-${index}`}><span className="break-all">{file.name}</span><button type="button" className="shrink-0 p-2 text-red-700" aria-label={`Quitar ${file.name}`} onClick={() => setFiles(files.filter((_, position) => position !== index))}>Quitar</button></div>)}</div>
            </fieldset>
            {formError && <p role="alert" className="break-words text-sm text-red-700">{formError}</p>}
            <DialogFooter><button type="button" className={button} disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button type="submit" className={`${button} border-black bg-black text-white hover:bg-gray-800`} disabled={busy}>{busy ? 'Guardando…' : 'Guardar gasto'}</button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!voiding} onOpenChange={value => { if (!value && !busy) setVoiding(null); }}><DialogContent><DialogHeader><DialogTitle>Anular gasto</DialogTitle><DialogDescription>El gasto «{voiding?.description}» dejará de sumar al total. Se conservarán sus soportes y el historial.</DialogDescription></DialogHeader><DialogFooter><button type="button" className={button} disabled={busy} onClick={() => setVoiding(null)}>Cancelar</button><button type="button" className={`${button} border-red-700 bg-red-700 text-white hover:bg-red-800`} disabled={busy} onClick={voidExpense}>{busy ? 'Anulando…' : 'Anular gasto'}</button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}
