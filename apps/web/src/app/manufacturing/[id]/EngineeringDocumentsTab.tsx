'use client';

import { useMemo, useState } from 'react';
import { apiBase, apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';
import {
  dateLabel,
  engineeringDisciplineLabel,
  engineeringDocumentTypeLabel,
  engineeringRevisionStatusClass,
  engineeringRevisionStatusLabel,
  type EngineeringDiscipline,
  type EngineeringDocument,
  type EngineeringDocumentType,
  type EngineeringDocumentRevision,
  type ManufacturingOrder,
} from '@/lib/manufacturing';

const DISCIPLINES = Object.entries(engineeringDisciplineLabel) as Array<[EngineeringDiscipline, string]>;
const DOCUMENT_TYPES = Object.entries(engineeringDocumentTypeLabel) as Array<[EngineeringDocumentType, string]>;

type Auth = { token?: string; tenantSlug?: string };

export function EngineeringDocumentsTab({
  order,
  role,
  currentUserId,
  auth,
  onChanged,
}: {
  order: ManufacturingOrder;
  role: string;
  currentUserId: string;
  auth: Auth;
  onChanged: () => Promise<unknown> | unknown;
}) {
  const path = `/manufacturing/orders/${order.id}/documents`;
  const { data, error, isLoading, mutate } = useApiSWR<EngineeringDocument[]>(path, auth.token, auth.tenantSlug);
  const memberFunctions = new Set((order.members || []).filter((item) => item.userId === currentUserId).map((item) => item.function));
  const canEngineer = role === 'ADMIN' || memberFunctions.has('ENGINEERING');
  const canReview = role === 'ADMIN' || memberFunctions.has('REVIEWER');
  const mutable = order.status !== 'ON_HOLD' && order.status !== 'CANCELED';
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  const documents = data || [];
  const totals = useMemo(() => ({
    documents: documents.filter((item) => item.active).length,
    revisions: documents.reduce((sum, item) => sum + item.revisions.length, 0),
    review: documents.reduce((sum, item) => sum + item.revisions.filter((revision) => revision.status === 'IN_REVIEW').length, 0),
    approved: documents.filter((item) => item.approvedRevision || item.releasedRevision).length,
  }), [documents]);

  async function accept(next: EngineeringDocument[]) {
    setMessage('');
    await mutate(next, { revalidate: false });
    await onChanged();
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Control documental de Ingeniería</h2>
        <p className="text-sm text-gray-600">Planos, esquemas, programas y especificaciones con trazabilidad por revisión.</p>
      </div>
      {canEngineer && mutable ? <button className="rounded bg-black px-4 py-2 text-sm text-white" onClick={() => setCreating((value) => !value)}>{creating ? 'Cerrar' : 'Nuevo documento'}</button> : null}
    </div>

    {!mutable ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La documentación queda en consulta mientras la orden esté {order.status === 'ON_HOLD' ? 'en pausa' : 'cancelada'}.</div> : null}
    {message ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">{message}</div> : null}
    {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">No se pudo cargar el expediente documental.</div> : null}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="Documentos activos" value={totals.documents} />
      <Metric label="Revisiones" value={totals.revisions} />
      <Metric label="En revisión" value={totals.review} tone="sky" />
      <Metric label="Con aprobación" value={totals.approved} tone="green" />
    </div>

    {creating ? <CreateDocument orderId={order.id} auth={auth} onCreated={async (next) => { await accept(next); setCreating(false); }} onError={setMessage} /> : null}
    {isLoading ? <div className="py-8 text-center text-sm text-gray-500">Cargando documentos…</div> : null}
    {!isLoading && !documents.length ? <div className="rounded-lg border border-dashed p-10 text-center"><div className="font-medium">Aún no hay documentos recibidos</div><p className="mt-1 text-sm text-gray-600">Crea el registro maestro y carga su primera revisión.</p></div> : null}

    <div className="space-y-3">
      {documents.map((document) => <DocumentCard
        key={document.id}
        document={document}
        auth={auth}
        currentUserId={currentUserId}
        isAdmin={role === 'ADMIN'}
        canEngineer={canEngineer && mutable}
        canReview={canReview && mutable}
        onChanged={accept}
        onError={setMessage}
      />)}
    </div>
  </div>;
}

function CreateDocument({ orderId, auth, onCreated, onError }: { orderId: string; auth: Auth; onCreated: (items: EngineeringDocument[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', discipline: 'MECHANICAL' as EngineeringDiscipline, documentType: 'DRAWING' as EngineeringDocumentType, systemName: '', description: '' });
  const field = (name: keyof typeof form, value: string) => setForm((current) => ({ ...current, [name]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.token || !auth.tenantSlug) return;
    setBusy(true); onError('');
    try {
      const next = await apiFetch<EngineeringDocument[]>(`/manufacturing/orders/${orderId}/documents`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: form });
      await onCreated(next);
    } catch (error: any) { onError(apiError(error, 'No se pudo crear el documento')); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="rounded-lg border bg-gray-50 p-4 space-y-3">
    <div className="font-medium">Registrar documento maestro</div>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Código *"><input required className="w-full rounded border px-3 py-2" placeholder="MEC-001" value={form.code} onChange={(e) => field('code', e.target.value)} /></Field>
      <Field label="Nombre *"><input required className="w-full rounded border px-3 py-2" placeholder="Plano de conjunto" value={form.name} onChange={(e) => field('name', e.target.value)} /></Field>
      <Field label="Disciplina"><select className="w-full rounded border px-3 py-2" value={form.discipline} onChange={(e) => field('discipline', e.target.value)}>{DISCIPLINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Tipo"><select className="w-full rounded border px-3 py-2" value={form.documentType} onChange={(e) => field('documentType', e.target.value)}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Sistema / conjunto"><input className="w-full rounded border px-3 py-2" placeholder="Transportador principal" value={form.systemName} onChange={(e) => field('systemName', e.target.value)} /></Field>
      <label className="block text-sm space-y-1 md:col-span-1 lg:col-span-3"><span className="text-gray-600">Descripción</span><input className="w-full rounded border px-3 py-2" value={form.description} onChange={(e) => field('description', e.target.value)} /></label>
    </div>
    <div className="flex justify-end"><button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Creando…' : 'Crear documento'}</button></div>
  </form>;
}

function DocumentCard({ document, auth, currentUserId, isAdmin, canEngineer, canReview, onChanged, onError }: { document: EngineeringDocument; auth: Auth; currentUserId: string; isAdmin: boolean; canEngineer: boolean; canReview: boolean; onChanged: (items: EngineeringDocument[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const latest = document.latestRevision;

  async function update(body: Record<string, unknown>) {
    if (!auth.token || !auth.tenantSlug) return;
    onError('');
    try {
      await onChanged(await apiFetch<EngineeringDocument[]>(`/manufacturing/documents/${document.id}`, { method: 'PATCH', token: auth.token, tenantSlug: auth.tenantSlug, body }));
    } catch (error: any) { onError(apiError(error, 'No se pudo actualizar el documento')); }
  }

  return <article className={`rounded-lg border ${document.active ? 'bg-white' : 'bg-gray-50 opacity-75'}`}>
    <div className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><strong>{document.code}</strong><span className="text-sm text-gray-700">{document.name}</span>{!document.active ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs">Inactivo</span> : null}</div>
          <div className="mt-1 text-xs text-gray-500">{engineeringDisciplineLabel[document.discipline]} · {engineeringDocumentTypeLabel[document.documentType]}{document.systemName ? ` · ${document.systemName}` : ''}</div>
          {document.description ? <p className="mt-2 text-sm text-gray-600">{document.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEngineer && document.active ? <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setUploading((value) => !value)}>{uploading ? 'Cerrar carga' : 'Nueva revisión'}</button> : null}
          {canEngineer ? <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setEditing((value) => !value)}>Editar</button> : null}
          <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Ocultar historial' : `Historial (${document.revisions.length})`}</button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RevisionSummary label="Última revisión" revision={latest} auth={auth} onError={onError} />
        <RevisionSummary label="Última aprobada" revision={document.releasedRevision || document.approvedRevision} auth={auth} onError={onError} />
      </div>
    </div>

    {editing ? <EditDocument document={document} onSave={async (body) => { await update(body); setEditing(false); }} /> : null}
    {uploading ? <UploadRevision documentId={document.id} auth={auth} onUploaded={async (items) => { await onChanged(items); setUploading(false); }} onError={onError} /> : null}
    {expanded ? <div className="border-t">
      {!document.revisions.length ? <div className="p-4 text-sm text-gray-500">No hay revisiones cargadas.</div> : document.revisions.map((revision) => <RevisionRow key={revision.id} revision={revision} auth={auth} currentUserId={currentUserId} isAdmin={isAdmin} canEngineer={canEngineer} canReview={canReview} onChanged={onChanged} onError={onError} />)}
    </div> : null}
  </article>;
}

function EditDocument({ document, onSave }: { document: EngineeringDocument; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: document.name, discipline: document.discipline, documentType: document.documentType, systemName: document.systemName || '', description: document.description || '', active: document.active });
  async function save(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { await onSave(form); } finally { setBusy(false); } }
  return <form onSubmit={save} className="border-t bg-gray-50 p-4 space-y-3">
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Nombre"><input required className="w-full rounded border px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Disciplina"><select className="w-full rounded border px-3 py-2" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as EngineeringDiscipline })}>{DISCIPLINES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Tipo"><select className="w-full rounded border px-3 py-2" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value as EngineeringDocumentType })}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Sistema / conjunto"><input className="w-full rounded border px-3 py-2" value={form.systemName} onChange={(e) => setForm({ ...form, systemName: e.target.value })} /></Field>
      <label className="block text-sm space-y-1 md:col-span-2 lg:col-span-3"><span className="text-gray-600">Descripción</span><input className="w-full rounded border px-3 py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label className="flex items-center gap-2 self-end py-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Documento activo</label>
    </div>
    <div className="flex justify-end"><button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white">{busy ? 'Guardando…' : 'Guardar documento'}</button></div>
  </form>;
}

function UploadRevision({ documentId, auth, onUploaded, onError }: { documentId: string; auth: Auth; onUploaded: (items: EngineeringDocument[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [revisionCode, setRevisionCode] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [file, setFile] = useState<File | null>(null);
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!auth.token || !auth.tenantSlug || !file) return;
    setBusy(true); onError('');
    const form = new FormData(); form.append('revisionCode', revisionCode); form.append('changeSummary', changeSummary); form.append('file', file);
    try {
      const response = await fetch(`${apiBase}/manufacturing/documents/${documentId}/revisions`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug }, body: form });
      if (!response.ok) throw new Error(await response.text());
      await onUploaded(await response.json());
    } catch (error: any) { onError(apiError(error, 'No se pudo cargar la revisión')); }
    finally { setBusy(false); }
  }
  return <form onSubmit={upload} className="border-t bg-sky-50/50 p-4 space-y-3">
    <div className="font-medium">Cargar nueva revisión</div>
    <div className="grid gap-3 md:grid-cols-[140px_1fr_1fr]">
      <Field label="Revisión *"><input required className="w-full rounded border px-3 py-2" placeholder="A, B, 01…" value={revisionCode} onChange={(e) => setRevisionCode(e.target.value)} /></Field>
      <Field label="Resumen del cambio *"><input required className="w-full rounded border px-3 py-2" value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} /></Field>
      <Field label="Archivo *"><input required type="file" className="block w-full rounded border bg-white px-3 py-1.5 text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
    </div>
    <div className="flex items-center justify-between gap-3"><span className="text-xs text-gray-500">PDF, Office, imágenes, DWG/DXF/STEP y archivos de automatización. Máximo configurado por el servidor.</span><button disabled={busy || !file} className="shrink-0 rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Cargando…' : 'Crear revisión'}</button></div>
  </form>;
}

function RevisionRow({ revision, auth, currentUserId, isAdmin, canEngineer, canReview, onChanged, onError }: { revision: EngineeringDocumentRevision; auth: Auth; currentUserId: string; isAdmin: boolean; canEngineer: boolean; canReview: boolean; onChanged: (items: EngineeringDocument[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function action(name: 'submit' | 'approve' | 'reject') {
    if (!auth.token || !auth.tenantSlug) return;
    let comment: string | null = null;
    if (name === 'reject') { comment = window.prompt('Indica el motivo del rechazo:'); if (!comment?.trim()) return; }
    if (name === 'approve') comment = window.prompt('Comentario de aprobación (opcional):', '') || '';
    setBusy(true); onError('');
    try {
      const next = await apiFetch<EngineeringDocument[]>(`/manufacturing/document-revisions/${revision.id}/${name}`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: name === 'submit' ? undefined : { comment: comment?.trim() || null } });
      await onChanged(next);
    } catch (error: any) { onError(apiError(error, 'No se pudo actualizar la revisión')); }
    finally { setBusy(false); }
  }
  const cannotSelfReview = !isAdmin && revision.createdByUserId === currentUserId;
  return <div className="border-b p-4 last:border-b-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><strong>Rev. {revision.revisionCode}</strong><span className={`rounded-full px-2 py-0.5 text-xs ${engineeringRevisionStatusClass[revision.status]}`}>{engineeringRevisionStatusLabel[revision.status]}</span><span className="text-xs text-gray-500">secuencia {revision.sequence}</span></div>
        <div className="mt-1 text-sm">{revision.changeSummary}</div>
        <div className="mt-1 text-xs text-gray-500">{revision.sourceFilename} · {formatBytes(revision.fileAttachment.size)} · {dateLabel(revision.createdAt, true)}</div>
        {revision.reviewComment ? <div className="mt-2 rounded bg-gray-50 px-3 py-2 text-sm"><span className="text-gray-500">Comentario:</span> {revision.reviewComment}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded border px-3 py-1.5 text-sm" onClick={() => openAttachment(revision.fileAttachment.id, auth, onError)}>Ver archivo</button>
        {canEngineer && revision.status === 'DRAFT' ? <button disabled={busy} className="rounded border border-sky-200 px-3 py-1.5 text-sm text-sky-800" onClick={() => action('submit')}>Enviar a revisión</button> : null}
        {canReview && revision.status === 'IN_REVIEW' && !cannotSelfReview ? <><button disabled={busy} className="rounded border border-emerald-200 px-3 py-1.5 text-sm text-emerald-800" onClick={() => action('approve')}>Aprobar</button><button disabled={busy} className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => action('reject')}>Rechazar</button></> : null}
      </div>
    </div>
  </div>;
}

function RevisionSummary({ label, revision, auth, onError }: { label: string; revision?: EngineeringDocumentRevision | null; auth: Auth; onError: (value: string) => void }) {
  if (!revision) return <div className="rounded border p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 text-sm text-gray-400">Sin revisión</div></div>;
  return <div className="rounded border p-3"><div className="text-xs text-gray-500">{label}</div><div className="mt-1 flex flex-wrap items-center gap-2"><button className="font-medium hover:underline" onClick={() => openAttachment(revision.fileAttachment.id, auth, onError)}>Rev. {revision.revisionCode}</button><span className={`rounded-full px-2 py-0.5 text-xs ${engineeringRevisionStatusClass[revision.status]}`}>{engineeringRevisionStatusLabel[revision.status]}</span></div><div className="mt-1 truncate text-xs text-gray-500">{revision.changeSummary}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm space-y-1"><span className="text-gray-600">{label}</span>{children}</label>; }
function Metric({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'sky' | 'green' }) { const color = { gray: 'text-gray-900', sky: 'text-sky-700', green: 'text-emerald-700' }[tone]; return <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{label}</div><div className={`text-2xl font-semibold ${color}`}>{value}</div></div>; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
function apiError(error: any, fallback: string) { const message = String(error?.message || ''); try { const jsonStart = message.indexOf('{'); if (jsonStart >= 0) { const parsed = JSON.parse(message.slice(jsonStart)); return Array.isArray(parsed.message) ? parsed.message.join('\n') : parsed.message || fallback; } } catch {} return message || fallback; }
async function openAttachment(id: string, auth: Auth, onError: (value: string) => void) {
  if (!auth.token || !auth.tenantSlug) return;
  const popup = window.open('', '_blank');
  try {
    const response = await fetch(`${apiBase}/attachments/${encodeURIComponent(id)}/view`, { headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug } });
    if (!response.ok) throw new Error(await response.text());
    const url = URL.createObjectURL(await response.blob());
    if (popup) popup.location.href = url; else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error: any) {
    popup?.close();
    onError(apiError(error, 'No se pudo abrir el archivo'));
  }
}
