'use client';
import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { actionLabels, areas, Auth, documentKinds, errorMessage, input, Line, Metadata, Quotation, save, terminal } from '@/lib/quotations';
import { EvidenceSelect, Field, ReferenceSelect } from './Fields';

type Props = { row: Quotation; auth: Auth; metadata: Metadata; onSaved: (row: Quotation) => void };
const quantities = (f: FormData, lines: Line[]) => lines.map(l => ({ lineId: l.id!, quantity: String(f.get('qty:' + l.id) || '0') })).filter(l => Number(l.quantity) > 0);
function QuantityInputs({ lines, defaultQty }: { lines: Line[]; defaultQty: (line: Line) => number }) {
  return <div className="space-y-2"><p className="text-xs text-gray-500">Indica la cantidad de cada línea incluida en el documento. Deja 0 para las demás.</p>{lines.map(l => <Field key={l.id} label={`${l.description} · ${l.uom}`}><input name={'qty:' + l.id} type="number" min="0" max={Number(l.approvedQty) || Number(l.quantity)} step="0.000001" defaultValue={Math.max(0, defaultQty(l))} className={input} /></Field>)}</div>;
}
function useOperation({ row, auth, onSaved }: Props) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function run(path: string, body: Record<string, unknown>) { setBusy(true); setError(''); setSuccess(''); try { const result = await save<Quotation>(`/quotations/${row.id}/${path}`, auth, { ...body, version: row.version }); onSaved(result); setSuccess('Registro guardado.'); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); } }
  return { busy, run, message: <>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{success && <p role="status" className="text-sm text-emerald-700">{success}</p>}</> };
}
export function ActionForm(props: Props) {
  const { row, metadata } = props, { run, busy, message } = useOperation(props);
  const caps = row.permissions.capabilities, draft = ['REQUESTED', 'SOURCING', 'QUOTING'].includes(row.status);
  const allowed = ['COMMENT'];
  if (!terminal(row.status)) {
    if (row.status === 'ON_HOLD') { if (row.permissions.manage) allowed.push('RESUME'); }
    else {
      if (caps.includes('QUOTE') && draft) allowed.push('SOURCE');
      if (caps.some(c => ['QUOTE', 'SOURCE'].includes(c)) && draft) allowed.push('PREPARE');
      if (caps.includes('QUOTE') && row.status === 'QUOTING') allowed.push('SEND');
      if (caps.includes('QUOTE') && row.status === 'AWAITING_APPROVAL') allowed.push('APPROVE', 'REVISE');
      if (caps.includes('QUOTE') && !row.approvedRevision) allowed.push('REJECT');
      if (row.permissions.manage) { allowed.push('HANDOFF', 'HOLD', 'CANCEL'); if (row.progress.complete) allowed.push('CLOSE'); }
    }
  }
  const [selected, setSelected] = useState('COMMENT'), action = allowed.includes(selected) ? selected : 'COMMENT';
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget), body: Record<string, unknown> = { action };
    for (const [k, v] of f.entries()) if (v && !k.startsWith('qty:')) body[k] = v;
    for (const k of ['dueAt', 'validUntil']) if (body[k]) body[k] = new Date(String(body[k])).toISOString();
    if (action === 'APPROVE') body.items = quantities(f, row.lines);
    await run('actions', body);
  }
  if (!row.permissions.capabilities.length && !row.permissions.manage) return <p className="text-sm text-gray-500">Acceso de consulta.</p>;
  return <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Siguiente gestión</h2><Field label="Acción"><select value={action} onChange={e => setSelected(e.target.value)} className={input}>{allowed.map(a => <option key={a} value={a}>{actionLabels[a]}</option>)}</select></Field>
    <form key={action + ':' + row.currentRevision} onSubmit={submit} className="space-y-3">
      {action === 'SEND' && <><p className="text-sm text-gray-600">Se conservará una copia inmutable de la propuesta como versión {row.currentRevision + 1}.</p><EvidenceSelect files={row.attachments.filter(a => a.revision === row.currentRevision + 1)} purpose="CUSTOMER_QUOTE" /><Field label="Vigencia"><input required type="datetime-local" name="validUntil" className={input} /></Field><Field label="Condiciones comerciales, alcance y plazo"><textarea required name="terms" maxLength={5000} rows={3} className={input} /></Field><Field label="Destinatario y constancia del envío realizado"><input required name="sentTo" maxLength={200} defaultValue={row.contactEmail || row.contactName} className={input} /></Field></>}
      {action === 'APPROVE' && <><p className="text-sm text-gray-600">Comprueba que cliente, alcance, cantidades y valores de la OC coincidan con la versión {row.currentRevision}.</p><EvidenceSelect files={row.attachments.filter(a => a.revision === row.currentRevision)} purpose="CUSTOMER_PO" /><Field label="Número de OC del cliente"><input required name="reference" maxLength={200} className={input} /></Field><QuantityInputs lines={row.lines} defaultQty={l => Number(l.quantity)} /><Field label={`Valor total aprobado con impuestos (${row.currency})`}><input required name="amount" type="number" min="0" step="0.01" defaultValue={row.total} className={input} /></Field></>}
      <Field label={['COMMENT', 'REVISE', 'REJECT', 'HOLD', 'RESUME', 'CANCEL', 'HANDOFF', 'APPROVE'].includes(action) ? 'Detalle / motivo (obligatorio)' : 'Detalle de la gestión'}><textarea name="note" required={['COMMENT', 'REVISE', 'REJECT', 'HOLD', 'RESUME', 'CANCEL', 'HANDOFF', 'APPROVE'].includes(action)} maxLength={4000} rows={3} className={input} /></Field>
      {!['COMMENT', 'CLOSE', 'CANCEL', 'REJECT', 'HOLD'].includes(action) && <div className="grid gap-3 sm:grid-cols-3"><Field label="Área de la próxima gestión"><select name="area" defaultValue={row.area} className={input}>{Object.entries(areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Responsable de la próxima gestión"><select name="responsibleId" defaultValue={row.responsibleId} className={input}>{metadata.users.filter(u => u.role !== 'VIEWER').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Fecha de próxima gestión"><input name="dueAt" type="datetime-local" className={input} /></Field></div>}
      {message}<Button disabled={busy}>{busy ? 'Guardando…' : actionLabels[action]}</Button>
    </form></section>;
}
export function OfferForm(props: Props) {
  const { row } = props, { run, busy, message } = useOperation(props);
  if (!row.permissions.capabilities.includes('SOURCE') || !['REQUESTED', 'SOURCING', 'QUOTING', 'FULFILLMENT'].includes(row.status)) return null;
  return <form className="space-y-3 rounded-xl border p-4" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await run('offers', { ...Object.fromEntries(f.entries()), leadDays: Number(f.get('leadDays')), validUntil: new Date(String(f.get('validUntil'))).toISOString() }); }}><h2 className="font-semibold">Registrar oferta o renovar costo y plazo</h2><p className="text-sm text-gray-600">Cada oferta conserva su soporte. Puedes seleccionar una oferta nueva para el saldo pendiente, sin modificar las órdenes ya registradas.</p><div className="grid gap-3 sm:grid-cols-2">
    <Field label="Línea"><select required name="lineId" className={input}>{row.lines.filter(l => ['BUY', 'MAKE'].includes(l.route)).map(l => <option key={l.id} value={l.id}>{l.description}</option>)}</select></Field>
    {[['supplier', 'Proveedor / manufactura'], ['reference', 'Referencia de la oferta']].map(([key, label]) => <Field key={key} label={label}><input required name={key} maxLength={200} className={input} /></Field>)}
    <Field label="Costo unitario"><input required name="unitCost" type="number" min="0" step="0.01" className={input} /></Field><Field label="Moneda del costo"><select name="currency" defaultValue={row.currency} className={input}><option>COP</option><option>USD</option><option>EUR</option></select></Field><Field label="Plazo en días"><input required name="leadDays" type="number" min="0" max="3650" defaultValue="0" className={input} /></Field><Field label="Vigencia de la oferta"><input required name="validUntil" type="datetime-local" className={input} /></Field><EvidenceSelect files={row.attachments} purpose="SUPPLIER_QUOTE" />
  </div>{message}<Button disabled={busy}>Guardar oferta</Button></form>;
}
const docCap: Record<string, string> = { PURCHASE: 'PURCHASE', PRODUCTION: 'SOURCE', RECEIPT: 'RECEIVE', SERVICE: 'SERVICE', INVOICE: 'INVOICE', DISPATCH: 'DISPATCH', DELIVERY: 'DISPATCH' };
const docPurpose: Record<string, string> = { PURCHASE: 'SUPPLIER_PO', PRODUCTION: 'SUPPLIER_PO', RECEIPT: 'RECEIPT', SERVICE: 'SERVICE', INVOICE: 'INVOICE', DISPATCH: 'DELIVERY', DELIVERY: 'DELIVERY' };
export function DocumentForm(props: Props) {
  const { row, metadata } = props, { run, busy, message } = useOperation(props), available = Object.keys(docCap).filter(k => row.permissions.capabilities.includes(docCap[k]));
  const [selected, setSelected] = useState(''), kind = available.includes(selected) ? selected : available[0], [source, setSource] = useState('');
  if (row.status !== 'FULFILLMENT' || !kind) return null;
  let lines = row.lines.filter(l => Number(l.approvedQty) > 0);
  if (kind === 'PURCHASE') lines = lines.filter(l => l.route === 'BUY');
  if (kind === 'PRODUCTION') lines = lines.filter(l => l.route === 'MAKE');
  if (['RECEIPT', 'DISPATCH', 'DELIVERY'].includes(kind)) lines = lines.filter(l => l.kind === 'PART');
  if (kind === 'SERVICE') lines = lines.filter(l => l.kind === 'SERVICE');
  if (kind === 'RECEIPT' && source) lines = lines.filter(l => row.documents.find(d => d.id === source)?.items.some(i => i.lineId === l.id));
  function defaultQty(l: Line) {
    if (['PURCHASE', 'PRODUCTION'].includes(kind)) return Number(l.approvedQty) - Number(l.orderedQty);
    if (kind === 'RECEIPT') return (l.route === 'STOCK' ? Number(l.approvedQty) : Number(l.orderedQty)) - Number(l.receivedQty);
    if (kind === 'SERVICE') return Number(l.approvedQty) - Number(l.executedQty);
    if (kind === 'INVOICE') return Number(l.kind === 'PART' ? l.receivedQty : l.executedQty) - Number(l.invoicedQty);
    if (kind === 'DISPATCH') return Number(l.invoicedQty) - Number(l.dispatchedQty);
    return Number(l.dispatchedQty) - Number(l.deliveredQty);
  }
  return <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Registrar avance del cumplimiento</h2><Field label="Tipo de documento"><select className={input} value={kind} onChange={e => { setSelected(e.target.value); setSource(''); }}>{available.map(k => <option key={k} value={k}>{documentKinds[k]}</option>)}</select></Field><form key={kind + ':' + source + ':' + row.version} className="space-y-3" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget), body: Record<string, unknown> = { kind, items: quantities(f, lines), date: new Date(String(f.get('date'))).toISOString() }; for (const [k, v] of f.entries()) if (v && !k.startsWith('qty:') && k !== 'date') body[k] = v; if (source) body.sourceDocumentId = source; if (body.dueAt) body.dueAt = new Date(String(body.dueAt)).toISOString(); await run('documents', body); }}>
    {kind === 'RECEIPT' && <Field label="Orden de origen (compra o fabricación)"><select className={input} value={source} onChange={e => setSource(e.target.value)}><option value="">Sin orden: solo existencias</option>{row.documents.filter(d => ['PURCHASE', 'PRODUCTION'].includes(d.kind)).map(d => <option key={d.id} value={d.id}>{documentKinds[d.kind]} · {d.reference}</option>)}</select></Field>}
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Número / referencia"><input required name="reference" maxLength={200} className={input} /></Field><Field label="Fecha del documento"><input required name="date" type="datetime-local" className={input} /></Field><EvidenceSelect files={row.attachments} purpose={docPurpose[kind]} />{kind === 'INVOICE' && <Field label={`Valor total de estas cantidades con impuestos (${row.currency})`}><input name="amount" type="number" required min="0" step="0.01" className={input} /></Field>}</div>
    <QuantityInputs lines={lines} defaultQty={defaultQty} /><Field label="Observaciones"><textarea name="note" maxLength={4000} rows={2} className={input} /></Field>{kind === 'RECEIPT' && <p className="text-xs text-gray-500">Registra cantidades verificadas y aceptadas. Las compras con artículo generan entrada al inventario. Manufactura utiliza su recepción de producto terminado existente.</p>}{kind === 'DISPATCH' && <p className="text-xs text-gray-500">El despacho exige factura y disponibilidad; los artículos vinculados generan su salida de inventario.</p>}{(row.permissions.manage || row.responsibleId === metadata.userId) && <div className="grid gap-3 sm:grid-cols-3"><Field label="Próximo responsable (opcional)"><select name="responsibleId" className={input}><option value="">Conservar responsable</option>{metadata.users.filter(u => u.role !== 'VIEWER').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field><Field label="Próxima área (opcional)"><select name="area" className={input}><option value="">Conservar área</option>{Object.entries(areas).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="Próxima gestión"><input type="datetime-local" name="dueAt" className={input} /></Field></div>}{message}<Button disabled={busy || !lines.length}>Registrar {documentKinds[kind].toLowerCase()}</Button>
  </form></section>;
}
export function LinkForm(props: Props) {
  const { row, auth } = props, { run, busy, message } = useOperation(props);
  const lines = row.lines.filter(l => Number(l.approvedQty) > 0 && (l.kind === 'SERVICE' && !l.serviceOrderId && row.permissions.capabilities.includes('SERVICE') || l.route === 'MAKE' && !l.manufacturingOrderId && row.permissions.capabilities.includes('SOURCE')));
  const [selected, setSelected] = useState(''), line = lines.find(l => l.id === selected) || lines[0];
  if (row.status !== 'FULFILLMENT' || !line) return null;
  const kind = line.kind === 'SERVICE' ? 'service' : 'manufacturing';
  return <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">Vincular ejecución</h2><p className="text-sm text-gray-600">Crea la orden en su módulo y vincúlala aquí. El avance se verifica contra esa orden.</p><Field label="Línea"><select className={input} value={line.id} onChange={e => setSelected(e.target.value)}>{lines.map(l => <option key={l.id} value={l.id}>{l.description}</option>)}</select></Field><form key={line.id} className="space-y-3" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await run('links', { lineId: line.id, [kind === 'service' ? 'serviceOrderId' : 'manufacturingOrderId']: f.get('orderId') }); }}><ReferenceSelect auth={auth} caseId={row.id} kind={kind} name="orderId" />{message}<Button disabled={busy}>Vincular {kind === 'service' ? 'OS' : 'OF'}</Button></form></section>;
}
