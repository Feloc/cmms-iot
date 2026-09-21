'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Check, Download, Link2, Loader2, Paperclip, RefreshCw, Save, Send, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiBase, apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';
import { getAuthFromSession } from '@/lib/auth';
import { EngineeringRequest, EngineeringUser, EngineeringOrder, Proposal, RequestFields as Fields, engineeringInput as input, engineeringError, engineeringDate, engineeringStatuses, priorities, requestTypes, disciplines, actionLabels, emptyProposal } from '@/lib/engineering';
import RequestFields from '@/components/engineering/RequestFields';

const actionStates: Record<string, string[]> = {
  DRAFT: ['submit'], SUBMITTED: ['authorize-study','request-info','reject'], NEEDS_INFO: ['submit'],
  STUDY: ['submit-review'], REVIEW: ['approve','revise','reject'], APPROVED: ['start'],
  EXECUTION: ['validate'], VALIDATION: ['close','rework'], ON_HOLD: ['resume'],
};
const actionRole: Record<string, string> = { submit: 'requestedByUserId', 'authorize-study': 'admin', 'request-info': 'admin', reject: 'admin', hold: 'admin', resume: 'admin', cancel: 'admin', 'submit-review': 'responsibleUserId', start: 'responsibleUserId', validate: 'responsibleUserId', approve: 'reviewerUserId', revise: 'reviewerUserId', close: 'validatorUserId', rework: 'validatorUserId' };
const terminal = ['CLOSED','REJECTED','CANCELED'];
type Mutation = (path: string, body: Record<string, unknown>, method?: string) => Promise<boolean>;

export default function EngineeringDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const auth = getAuthFromSession(session);
  const actor = (session as any)?.user;
  const userId = actor?.id;
  const admin = actor?.role === 'ADMIN';
  const writable = admin || actor?.role === 'TECH';
  const path = '/engineering-requests/' + id;
  const { data: row, error: loadError, isLoading, mutate } = useApiSWR<EngineeringRequest>(path, auth.token, auth.tenantSlug, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const { data: users } = useApiSWR<EngineeringUser[]>('/users', auth.token, auth.tenantSlug);
  const { data: eligible, mutate: reloadOrders } = useApiSWR<EngineeringOrder[]>(row && ['APPROVED','EXECUTION'].includes(row.status) ? path + '/eligible-orders' : null, auth.token, auth.tenantSlug);
  const [tab, setTab] = useState('Resumen');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState('');
  const [comment, setComment] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const [unlink, setUnlink] = useState('');
  const [unlinkReason, setUnlinkReason] = useState('');
  const [dirty, setDirty] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function change(suffix: string, body: Record<string, unknown>, method = 'POST') {
    if (lock.current || !row) return false;
    lock.current = true; setBusy(true); setError('');
    try {
      const updated = await apiFetch<EngineeringRequest>(path + suffix, { ...auth, method, body: { ...body, version: row.version } });
      await mutate(updated, { revalidate: false });
      setDirty(false);
      return true;
    } catch (e) { setError(engineeringError(e)); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file || !row || lock.current) return;
    if (file.size > 30 * 1024 * 1024) { setError('El archivo supera los 30 MB.'); return; }
    lock.current = true; setBusy(true); setError('');
    const body = new FormData(); body.append('file', file); body.append('version', String(row.version));
    try {
      const response = await fetch(apiBase + path + '/attachments', { method: 'POST', headers: { Authorization: 'Bearer ' + auth.token, 'x-tenant': auth.tenantSlug! }, body });
      if (!response.ok) throw new Error(await response.text());
      await mutate(await response.json(), { revalidate: false });
    } catch (e) { setError(engineeringError(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function download(file: { id: string; filename: string }) {
    setError('');
    try {
      const response = await fetch(apiBase + '/attachments/' + file.id + '/download', { headers: { Authorization: 'Bearer ' + auth.token, 'x-tenant': auth.tenantSlug! } });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(engineeringError(e)); }
  }
  if (status === 'loading' || isLoading) return <p role="status" className="p-6">Cargando solicitud...</p>;
  if (!auth.token) return <p className="p-6">Inicia sesión.</p>;
  if (!row) return <div className="p-6 space-y-3"><p role="alert">{loadError ? engineeringError(loadError) : 'Solicitud no encontrada.'}</p><Button variant="outline" onClick={() => mutate()}>Reintentar</Button></div>;
  const can = (permission: string) => writable && (admin || (row as any)[permission] === userId);
  const participant = writable && (admin || [row.requestedByUserId,row.responsibleUserId,row.reviewerUserId,row.validatorUserId].includes(userId));
  const open = !terminal.includes(row.status);
  const actions = [...(actionStates[row.status] || []), ...(open && row.status !== 'ON_HOLD' && !['DRAFT','NEEDS_INFO'].includes(row.status) ? ['hold'] : []), ...(open ? ['cancel'] : [])]
    .filter((name) => can(actionRole[name]) && !(name === 'approve' && row.proposalAuthorId === userId));
  const name = (id?: string) => users?.find((u) => u.id === id)?.name || (id ? 'Usuario asignado' : 'Sin asignar');
  const selectedRevision = row.revisions.find((r) => r.revision === revision);
  return <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" onClickCapture={(event) => {
    const link = (event.target as HTMLElement).closest('a');
    if (dirty && link && link.target !== '_blank' && !window.confirm('¿Salir sin guardar los cambios?')) event.preventDefault();
  }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><Link href="/engineering-requests" className="inline-flex items-center gap-1 text-sm underline"><ArrowLeft className="h-4 w-4" />Solicitudes</Link>
        <p className="mt-3 text-sm text-gray-500">{row.number} · {engineeringStatuses[row.status]}</p><h1 className="break-words text-2xl font-semibold">{row.title}</h1>
        <Link className="text-sm text-emerald-700 underline" href={'/assets/' + row.assetId}>{row.asset.code} · {row.asset.name}</Link>
      </div>
      <Button variant="outline" size="icon" title="Recargar solicitud" aria-label="Recargar solicitud" disabled={busy} onClick={async () => { if (!dirty || window.confirm('¿Recargar y descartar los cambios del formulario?')) { await mutate(); setDirty(false); setFormEpoch((v) => v + 1); } }}><RefreshCw /></Button>
    </div>
    <div className="flex flex-wrap gap-2">{actions.map((a) => <Button disabled={busy || dirty} key={a} variant={['reject','cancel'].includes(a) ? 'outline' : 'default'} onClick={() => { setError(''); setAction(a); }}><Check />{actionLabels[a]}</Button>)}{dirty && <span role="status" className="self-center text-sm text-amber-700">Cambios sin guardar</span>}</div>
    {error && <p role="alert" className="break-words text-sm text-red-700">{error}</p>}
    <div className="flex overflow-x-auto border-b" role="tablist">{['Resumen','Propuesta','Ejecución','Archivos','Historial'].map((t) => <button type="button" role="tab" disabled={busy} aria-selected={tab === t} key={t} onClick={() => { if (t !== tab && (!dirty || window.confirm('¿Descartar los cambios sin guardar?'))) { setDirty(false); setTab(t); } }} className={'shrink-0 border-b-2 px-4 py-3 text-sm ' + (tab === t ? 'border-emerald-600 font-medium' : 'border-transparent text-gray-500')}>{t}</button>)}</div>
    {tab === 'Resumen' && <section className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[['Solicitante',name(row.requestedByUserId)],['Responsable',name(row.responsibleUserId)],['Revisor',name(row.reviewerUserId)],['Validador',name(row.validatorUserId)],['Cliente',row.asset.customer || '-'],['Serie al solicitar',row.assetSnapshot.serialNumber || '-'],['Prioridad',priorities[row.priority]],['Tipo / disciplina',requestTypes[row.requestType] + ' / ' + disciplines[row.discipline]]].map(([label,value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="break-words">{value}</dd></div>)}
      </dl>
      {row.originWorkOrderId && <Link className="text-sm underline" href={'/service-orders/' + row.originWorkOrderId}>Orden de origen</Link>}
      {row.originNoticeId && <Link className="ml-3 text-sm underline" href={'/notices/' + row.originNoticeId}>Aviso de origen</Link>}
      {['DRAFT','NEEDS_INFO'].includes(row.status) && can('requestedByUserId')
        ? <EditRequest key={row.version + '-' + formEpoch} row={row} busy={busy} change={change} onDirty={() => setDirty(true)} />
        : <div className="grid gap-5 sm:grid-cols-2">{[['Problema actual',row.problem],['Mejora esperada',row.expectedBenefit],['Fecha deseada',row.desiredDate?.slice(0,10) || '-']].map(([label,value]) => <div key={label}><h2 className="font-medium">{label}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{value}</p></div>)}</div>}
    </section>}
    {tab === 'Propuesta' && <section className="space-y-4">
      {row.approvedRevision && <p className="text-sm text-emerald-700">Ejecución aprobada con la revisión {row.approvedRevision}.</p>}
      <label className="grid max-w-sm gap-1 text-sm">Revisión<select disabled={busy} className={input} value={revision ?? ''} onChange={(e) => { if (!dirty || window.confirm('¿Descartar los cambios sin guardar?')) { setDirty(false); setRevision(e.target.value ? Number(e.target.value) : null); } }}>
        <option value="">Propuesta actual</option>{row.revisions.map((r) => <option key={r.id} value={r.revision}>Revisión {r.revision} · {engineeringDate(r.createdAt)}</option>)}
      </select></label>
      <ProposalForm key={row.version + '-' + revision + '-' + formEpoch} initial={selectedRevision?.snapshot.proposal || row.proposal || emptyProposal} editable={revision === null && row.status === 'STUDY' && can('responsibleUserId')} busy={busy} change={change} onDirty={() => setDirty(true)} />
      {selectedRevision && <div className="border-t pt-3 text-sm"><h3 className="font-medium">Archivos de esta revisión</h3>{selectedRevision.snapshot.attachments.map((f) => <Button key={f.id} variant="link" onClick={() => download(f)}><Download />{f.filename}</Button>)}{!selectedRevision.snapshot.attachments.length && <p className="text-gray-500">Sin archivos.</p>}</div>}
    </section>}
    {tab === 'Ejecución' && <section className="space-y-4">
      <h2 className="font-medium">Órdenes vinculadas</h2>
      {row.orders.length === 0 && <p className="text-sm text-gray-500">Sin órdenes vinculadas.</p>}
      {row.orders.map((link) => <div className="flex flex-wrap items-center justify-between gap-2 border-b py-3" key={link.id}><Link className="min-w-0 flex-1 break-words text-sm underline" href={(link.workOrder.kind === 'SERVICE_ORDER' ? '/service-orders/' : '/work-orders/') + link.workOrder.id}>{link.workOrder.title}</Link><span className="text-sm">{link.workOrder.status}</span>
        {['APPROVED','EXECUTION'].includes(row.status) && can('responsibleUserId') && <Button variant="ghost" size="icon" disabled={busy} title="Desvincular orden" aria-label="Desvincular orden" onClick={() => { setUnlink(link.id); setUnlinkReason(''); }}><Unlink /></Button>}
      </div>)}
      {['APPROVED','EXECUTION'].includes(row.status) && can('responsibleUserId') && <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (selectedOrder && await change('/orders', { workOrderId: selectedOrder })) setSelectedOrder(''); }}>
        <label className="grid min-w-0 flex-1 gap-1 text-sm">OT/OS del equipo<select required className={input} value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)}><option value="">Seleccionar orden</option>{eligible?.filter((o) => !row.orders.some((link) => link.workOrder.id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.title} · {o.status}</option>)}</select></label>
        <Button disabled={busy || !selectedOrder} type="submit"><Link2 />Vincular</Button><Button type="button" variant="outline" size="icon" title="Actualizar órdenes" aria-label="Actualizar órdenes" onClick={() => reloadOrders()}><RefreshCw /></Button>
        <Link className="text-sm underline" href="/service-orders/new" target="_blank">Crear OS</Link>
      </form>}
    </section>}
    {tab === 'Archivos' && <section className="space-y-4">
      {open && participant && <label className="grid gap-2 text-sm"><span className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4" />Adjuntar evidencia o documento</span><input type="file" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>}
      {busy && <p role="status" className="text-sm">Procesando...</p>}
      {!row.attachments.length && <p className="text-sm text-gray-500">Sin archivos adjuntos.</p>}
      {row.attachments.map((f) => <div key={f.id} className="flex items-center gap-3 border-b py-3 text-sm"><div className="min-w-0 flex-1"><p className="break-words">{f.filename}</p><p className="text-gray-500">{Math.ceil(f.size / 1024)} KB · {engineeringDate(f.createdAt)}</p></div><Button variant="outline" size="icon" title="Descargar archivo" aria-label={'Descargar ' + f.filename} onClick={() => download(f)}><Download /></Button></div>)}
    </section>}
    {tab === 'Historial' && <section className="space-y-4">
      {open && participant && <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (comment.trim() && await change('/comments', { note: comment.trim() })) setComment(''); }}><label className="grid gap-1 text-sm">Comentario<textarea className={input} required maxLength={10000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></label><Button type="submit" disabled={busy || !comment.trim()}><Send />Agregar comentario</Button></form>}
      {[...row.events].reverse().map((event) => <article key={event.id} className="space-y-1 border-t py-3 text-sm">
        <p className="font-medium">{actionLabels[event.action] || event.action} · {event.actorName}</p><p className="text-gray-500">{engineeringDate(event.createdAt)} · {engineeringStatuses[event.toStatus]}</p>
        {event.note && <p className="whitespace-pre-wrap break-words">{event.note}</p>}
        {event.details?.validationResult && <p className="whitespace-pre-wrap break-words">Validación: {event.details.validationResult}</p>}
        {event.details?.documentUpdates && <p className="whitespace-pre-wrap break-words">Documentación: {event.details.documentUpdates}</p>}
        {event.details?.approvedRevision && <p>Revisión aprobada: {event.details.approvedRevision}</p>}
      </article>)}
    </section>}
    {action && <ActionDialog action={action} requiresInfo={action === 'submit' && row.status === 'NEEDS_INFO'} users={users || []} busy={busy} error={error} onClose={() => { if (!lock.current) setAction(''); }} onSubmit={async (body) => { if (await change('/actions', { ...body, action })) setAction(''); }} />}
    {unlink && <Dialog open onOpenChange={(open) => { if (!open && !busy) setUnlink(''); }}><DialogContent className="bg-white text-gray-900"><DialogHeader><DialogTitle>Desvincular orden</DialogTitle><DialogDescription>{row.number}</DialogDescription></DialogHeader><form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await change('/orders/' + unlink + '/unlink', { note: unlinkReason })) setUnlink(''); }}><label className="grid gap-1 text-sm">Motivo *<textarea className={input} required value={unlinkReason} onChange={(e) => setUnlinkReason(e.target.value)} /></label>{error && <p role="alert" className="text-red-700 text-sm">{error}</p>}<Button disabled={busy} type="submit"><Unlink />Desvincular</Button></form></DialogContent></Dialog>}
  </main>;
}

function EditRequest({ row, busy, change, onDirty }: { row: EngineeringRequest; busy: boolean; change: Mutation; onDirty: () => void }) {
  const [form, setForm] = useState<Fields>({ title: row.title, problem: row.problem, expectedBenefit: row.expectedBenefit, requestType: row.requestType, discipline: row.discipline, priority: row.priority, desiredDate: row.desiredDate?.slice(0,10) || '' });
  return <form className="space-y-4" onChange={onDirty} onSubmit={(e) => { e.preventDefault(); change('', { ...form, desiredDate: form.desiredDate || undefined }, 'PATCH'); }}><fieldset disabled={busy}><RequestFields value={form} onChange={setForm} /></fieldset><Button type="submit" disabled={busy}><Save />Guardar solicitud</Button></form>;
}
function ProposalForm({ initial, editable, busy, change, onDirty }: { initial: Proposal; editable: boolean; busy: boolean; change: Mutation; onDirty: () => void }) {
  const [form, setForm] = useState(initial);
  const fields = [['solution','Solución propuesta'],['scope','Alcance'],['materials','Materiales y componentes'],['acceptanceCriteria','Criterios de aceptación'],['documentImpact','Documentos y mantenimiento afectados']] as const;
  return <form className="space-y-4" onChange={onDirty} onSubmit={(e) => { e.preventDefault(); change('/proposal', { proposal: form }, 'PATCH'); }}>
    <fieldset disabled={busy || !editable} className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map(([key,label]) => <label key={key} className="grid gap-1 text-sm sm:col-span-2">{label} *<textarea required maxLength={10000} rows={3} className={input} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
      <label className="grid gap-1 text-sm">Costo estimado *<input className={input} type="number" min="0" step="0.01" required value={form.estimatedCost} onChange={(e) => setForm({ ...form, estimatedCost: Number(e.target.value) })} /></label>
      <label className="grid gap-1 text-sm">Moneda<select className={input} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>{['COP','USD','EUR'].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Parada estimada (horas) *<input required type="number" min="0" step="0.1" className={input} value={form.downtimeHours} onChange={(e) => setForm({ ...form, downtimeHours: Number(e.target.value) })} /></label>
    </fieldset>
    {editable && <Button type="submit" disabled={busy}><Save />Guardar propuesta</Button>}
  </form>;
}
function ActionDialog({ action, requiresInfo, users, busy, error, onClose, onSubmit }: { action: string; requiresInfo: boolean; users: EngineeringUser[]; busy: boolean; error: string; onClose: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [responsibleUserId, setResponsible] = useState('');
  const [reviewerUserId, setReviewer] = useState('');
  const [validatorUserId, setValidator] = useState('');
  const [validationResult, setValidationResult] = useState('');
  const [documentUpdates, setDocumentUpdates] = useState('');
  const [criteriaMet, setCriteriaMet] = useState(false);
  const requiredNote = requiresInfo || ['request-info','revise','reject','hold','cancel','rework'].includes(action);
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg bg-white text-gray-900">
    <DialogHeader><DialogTitle>{actionLabels[action]}</DialogTitle><DialogDescription>Decisión sobre la solicitud</DialogDescription></DialogHeader>
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit({ note, ...(action === 'authorize-study' ? { responsibleUserId, reviewerUserId, validatorUserId } : {}), ...(action === 'close' ? { validationResult, documentUpdates, criteriaMet } : {}) }); }}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {action === 'authorize-study' && ([['Responsable de ingeniería',responsibleUserId,setResponsible],['Revisor técnico',reviewerUserId,setReviewer],['Responsable de validación',validatorUserId,setValidator]] as const).map(([label,value,set]) => <label className="grid gap-1 text-sm" key={label}>{label} *<select required className={input} value={value} onChange={(e) => set(e.target.value)}><option value="">Seleccionar</option>{users.filter((u) => ['ADMIN','TECH'].includes(u.role)).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>)}
        {action === 'close' && <>
          <label className="flex gap-2 text-sm"><input type="checkbox" required checked={criteriaMet} onChange={(e) => setCriteriaMet(e.target.checked)} />Criterios de aceptación cumplidos</label>
          <label className="grid gap-1 text-sm">Resultado y evidencias de validación *<textarea className={input} required maxLength={10000} rows={3} value={validationResult} onChange={(e) => setValidationResult(e.target.value)} /></label>
          <label className="grid gap-1 text-sm">Documentos y plan de mantenimiento actualizados *<textarea className={input} required maxLength={10000} rows={3} value={documentUpdates} onChange={(e) => setDocumentUpdates(e.target.value)} /></label>
        </>}
        <label className="grid gap-1 text-sm">Comentario {requiredNote ? '*' : ''}<textarea className={input} required={requiredNote} maxLength={10000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Volver</Button><Button className="bg-emerald-700 text-white hover:bg-emerald-800" type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Check />}Confirmar</Button></div>
    </form>
  </DialogContent></Dialog>;
}
