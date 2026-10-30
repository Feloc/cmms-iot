'use client';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Auth, emptyLine, errorMessage, input, Line, Metadata, Quotation, save } from '@/lib/quotations';
import { Field, linePayload, LinesEditor } from './Fields';
export default function CaseForm({ auth, metadata, onSaved, onCancel }: { auth: Auth; metadata: Metadata; onSaved: (row: Quotation) => void; onCancel: () => void }) {
  const [lines, setLines] = useState<Line[]>([emptyLine()]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError('');
    try { const fields = Object.fromEntries(f.entries()); if (!fields.dueAt) delete fields.dueAt; else fields.dueAt = new Date(String(fields.dueAt)).toISOString();
      onSaved(await save<Quotation>('/quotations', auth, { ...fields, lines: linePayload(lines) }));
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-4"><h2 className="text-lg font-semibold">Nueva solicitud de cotización</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {[['title', 'Asunto', true], ['customerName', 'Cliente', true], ['customerTaxId', 'NIT / identificación', false], ['contactName', 'Contacto', true], ['contactEmail', 'Correo', false], ['contactPhone', 'Teléfono', false]].map(([name, label, req]) => <Field key={String(name)} label={String(label)}><input className={input} name={String(name)} type={name === 'contactEmail' ? 'email' : 'text'} required={Boolean(req)} maxLength={name === 'customerTaxId' ? 50 : name === 'contactPhone' ? 80 : 200} /></Field>)}
    <Field label="Moneda"><select name="currency" className={input}><option>COP</option><option>USD</option><option>EUR</option></select></Field><Field label="Coordinador"><select name="coordinatorId" required className={input} defaultValue={metadata.userId}>{metadata.users.filter(u => u.role !== 'VIEWER' && (metadata.permissions.admin || u.id === metadata.userId)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Fecha de próxima gestión"><input type="datetime-local" name="dueAt" className={input} /></Field>
  </div><Field label="Solicitud del cliente"><textarea name="description" required maxLength={10000} className={input} rows={3} /></Field><LinesEditor lines={lines} onChange={setLines} auth={auth} />
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><Button disabled={busy}>{busy ? 'Creando…' : 'Crear expediente'}</Button><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button></div></form>;
}
