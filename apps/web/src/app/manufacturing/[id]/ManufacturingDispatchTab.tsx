'use client';

import { useRef, useState } from 'react';
import { ApprovalException } from '../ApprovalException';
import { apiBase, apiFetch } from '@/lib/api';
import { fatMediaResponse } from './ManufacturingFatMedia';
import { DispatchImageAuth } from './ManufacturingDispatchImagePreview';
import { DispatchGalleryButton, DispatchGalleryProvider, DispatchGalleryThumbnail } from './ManufacturingDispatchImageGallery';
import { useApiSWR } from '@/lib/swr';
import { dateLabel, type ManufacturingDispatch, type ManufacturingDispatchChecklistEvidence, type ManufacturingDispatchChecklistItem, type ManufacturingDispatchDocument, type ManufacturingDispatchDocumentType, type ManufacturingDispatchPackageType, type ManufacturingOrder, type ManufacturingUser } from '@/lib/manufacturing';

type Auth = { token?: string; tenantSlug?: string };
type DispatchCall = (path: string, body: any, method?: string, action?: string) => Promise<boolean>;

export function ManufacturingDispatchTab({ order, role, auth, onChanged }: { order: ManufacturingOrder; role: string; auth: Auth; onChanged: () => void | Promise<unknown> }) {
  const { data, error, isLoading, mutate } = useApiSWR<ManufacturingDispatch[]>(`/manufacturing/orders/${order.id}/dispatches`, auth.token, auth.tenantSlug);
  const { data: users } = useApiSWR<ManufacturingUser[]>(role === 'ADMIN' ? '/users' : null, auth.token, auth.tenantSlug);
  const [message, setMessage] = useState(''); const dispatches = data || [];
  const eligibleUnits = (order.units || []).filter((unit) => unit.status !== 'CANCELED' && !['ON_HOLD', 'CANCELED', 'COMPLETED'].includes(order.status) && !dispatches.some((dispatch) => dispatch.manufacturedUnitId === unit.id));
  async function accept(next: ManufacturingDispatch[]) { setMessage(''); await mutate(next, { revalidate: false }); await onChanged(); }
  return <DispatchImageAuth.Provider value={auth}><div className="space-y-4"><div><h2 className="text-lg font-semibold">Despacho y logística de salida</h2><p className="text-sm text-gray-600">Embalaje, bultos, documentos, autorización FAT, transporte y confirmación de entrega por unidad.</p></div>{message ? <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}{error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">No se pudieron cargar los despachos.</div> : null}{role === 'ADMIN' && eligibleUnits.length ? <CreateDispatch units={eligibleUnits} order={order} auth={auth} onChanged={accept} onError={setMessage} /> : null}{isLoading ? <div className="py-8 text-center text-sm text-gray-500">Cargando despachos…</div> : null}{!isLoading && !dispatches.length ? <div className="rounded-lg border border-dashed p-10 text-center"><div className="font-medium">No hay unidades habilitadas para despacho</div><p className="mt-1 text-sm text-gray-600">Puedes preparar la logística antes del FAT. La orden debe estar activa y la unidad no debe tener otro expediente.</p></div> : null}<div className="space-y-4">{dispatches.map((dispatch) => <DispatchCard key={dispatch.id} dispatch={dispatch} users={users || []} role={role} auth={auth} onChanged={accept} onError={setMessage} />)}</div></div></DispatchImageAuth.Provider>;
}

function CreateDispatch({ units, order, auth, onChanged, onError }: { units: NonNullable<ManufacturingOrder['units']>; order: ManufacturingOrder; auth: Auth; onChanged: (items: ManufacturingDispatch[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [destination, setDestination] = useState(order.destination || ''); const [address, setAddress] = useState(''); const [busy, setBusy] = useState('');
  async function create(unitId: string) { if (!auth.token || !auth.tenantSlug) return; setBusy(unitId); onError(''); try { const next = await apiFetch<ManufacturingDispatch[]>(`/manufacturing/units/${unitId}/dispatches`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: { destination, deliveryAddress: address } }); await onChanged(next); } catch (error: any) { onError(apiError(error, 'No se pudo crear el despacho')); } finally { setBusy(''); } }
  return <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4"><strong>Unidades disponibles para preparar despacho</strong><div className="mt-3 grid gap-2 md:grid-cols-2"><input className="rounded border bg-white px-3 py-2 text-sm" placeholder="Destino" value={destination} onChange={(event) => setDestination(event.target.value)} /><input className="rounded border bg-white px-3 py-2 text-sm" placeholder="Dirección de entrega" value={address} onChange={(event) => setAddress(event.target.value)} /></div><div className="mt-3 flex flex-wrap gap-2">{units.map((unit) => <button key={unit.id} disabled={!!busy} className="rounded bg-cyan-800 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => create(unit.id)}>{busy === unit.id ? 'Creando…' : `Preparar despacho · Unidad ${unit.unitNumber}`}</button>)}</div></div>;
}

function DispatchCard({ dispatch, users, role, auth, onChanged, onError }: { dispatch: ManufacturingDispatch; users: ManufacturingUser[]; role: string; auth: Auth; onChanged: (items: ManufacturingDispatch[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [approvalExceptionReason, setApprovalExceptionReason] = useState('');
  const [open, setOpen] = useState(!['DELIVERED', 'CANCELED'].includes(dispatch.status)); const [busy, setBusy] = useState('');
  async function call(path: string, body: any, method = 'POST', action = path): Promise<boolean> {
    if (!auth.token || !auth.tenantSlug || busy) return false;
    setBusy(action); onError('');
    try {
      let next: ManufacturingDispatch[];
      if (body instanceof FormData) {
        const response = await fetch(`${apiBase}/manufacturing/${path}`, { method, headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug }, body });
        await fatMediaResponse(response); next = await response.json();
      } else next = await apiFetch<ManufacturingDispatch[]>(`/manufacturing/${path}`, { method, token: auth.token, tenantSlug: auth.tenantSlug, body });
      await onChanged(next); return true;
    } catch (error: any) { onError(apiError(error, 'No se pudo actualizar el despacho')); return false; } finally { setBusy(''); }
  }
  async function downloadAttachment(item: { id: string; filename?: string | null; title: string }, resource: 'dispatch-documents' | 'dispatch-checklist-evidence') {
    if (!auth.token || !auth.tenantSlug || busy) return;
    setBusy(`download-${item.id}`); onError('');
    try {
      const response = await fetch(`${apiBase}/manufacturing/${resource}/${item.id}/file`, { headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug } });
      await fatMediaResponse(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = item.filename || item.title || 'documento'; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) { onError(apiError(error, 'No se pudo descargar el documento')); } finally { setBusy(''); }
  }
  async function execute() { const trackingNumber = window.prompt('Guía o número de seguimiento:'); if (!trackingNumber) return; const driverName = window.prompt('Conductor (opcional):'); const vehiclePlate = window.prompt('Placa del vehículo (opcional):'); await call(`dispatches/${dispatch.id}/dispatch`, { lockVersion: dispatch.lockVersion, trackingNumber, driverName, vehiclePlate }, 'POST', 'dispatch'); }
  async function deliver() { const receivedByName = window.prompt('Nombre de quien recibe:'); if (!receivedByName) return; const proofReference = window.prompt('Referencia del soporte de entrega:'); if (!proofReference) return; await call(`dispatches/${dispatch.id}/deliver`, { lockVersion: dispatch.lockVersion, receivedByName, proofReference }, 'POST', 'deliver'); }
  async function cancel() { const reason = window.prompt('Motivo de cancelación:'); if (!reason) return; await call(`dispatches/${dispatch.id}/cancel`, { lockVersion: dispatch.lockVersion, reason }, 'POST', 'cancel'); }
  return <DispatchGalleryProvider dispatch={dispatch}><div className={`rounded-lg border ${dispatch.status === 'DELIVERED' ? 'border-emerald-300' : dispatch.status === 'CANCELED' ? 'border-red-200' : ''}`}><button className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen((value) => !value)}><div><div className="flex items-center gap-2"><strong>{dispatch.dispatchCode}</strong><span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(dispatch.status)}`}>{statusLabel(dispatch.status)}</span>{dispatch.summary.fatGateOpen ? <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">FAT aprobado</span> : null}</div><div className="text-xs text-gray-500">Unidad {dispatch.manufacturedUnit.unitNumber} · Serial {dispatch.serialNumberSnapshot || dispatch.manufacturedUnit.serialNumber || 'pendiente'} · Responsable {dispatch.responsibleName}</div></div><div className="text-right"><strong>{dispatch.summary.progressPercent}% embalaje</strong><div className="text-xs text-gray-500">{dispatch.summary.packageCount} bulto(s) · {formatNumber(dispatch.summary.grossWeightKg)} kg · {dispatch.summary.documentCount} documento(s)</div></div></button>{open ? <div className="space-y-4 border-t p-4"><div className="flex justify-end"><DispatchGalleryButton /></div>{!dispatch.summary.fatGateOpen ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Preparación permitida en órdenes activas. Salida bloqueada hasta aprobar el FAT más reciente de la unidad.</div> : null}{['DRAFT', 'PREPARING'].includes(dispatch.status) && role === 'ADMIN' ? <LogisticsForm dispatch={dispatch} users={users} busy={busy} call={call} /> : <LogisticsSummary dispatch={dispatch} />}
    {dispatch.status === 'READY' && role === 'ADMIN' ? <ApprovalException value={approvalExceptionReason} onChange={setApprovalExceptionReason} /> : null}
    <div className="flex flex-wrap gap-2">{dispatch.status === 'DRAFT' ? <button disabled={!!busy} className="rounded bg-black px-3 py-2 text-sm text-white" onClick={() => call(`dispatches/${dispatch.id}/start`, { lockVersion: dispatch.lockVersion }, 'POST', 'start')}>Iniciar preparación</button> : null}{dispatch.status === 'PREPARING' ? <button disabled={!!busy} className="rounded bg-cyan-800 px-3 py-2 text-sm text-white" onClick={() => call(`dispatches/${dispatch.id}/ready`, { lockVersion: dispatch.lockVersion }, 'POST', 'ready')}>Cerrar embalaje</button> : null}{dispatch.status === 'READY' && role === 'ADMIN' ? <button disabled={!!busy} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={() => call(`dispatches/${dispatch.id}/authorize`, { lockVersion: dispatch.lockVersion, approvalExceptionReason: approvalExceptionReason || undefined }, 'POST', 'authorize')}>Autorizar salida</button> : null}{dispatch.status === 'AUTHORIZED' ? <button disabled={!!busy} className="rounded bg-indigo-800 px-3 py-2 text-sm text-white" onClick={execute}>Confirmar salida</button> : null}{dispatch.status === 'DISPATCHED' ? <button disabled={!!busy} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white" onClick={deliver}>Confirmar entrega</button> : null}{role === 'ADMIN' && ['DRAFT', 'PREPARING', 'READY', 'AUTHORIZED'].includes(dispatch.status) ? <button disabled={!!busy} className="rounded border border-red-300 px-3 py-2 text-sm text-red-700" onClick={cancel}>Cancelar</button> : null}{role === 'ADMIN' && dispatch.status === 'CANCELED' ? <button disabled={!!busy} className="rounded border px-3 py-2 text-sm" onClick={() => call(`dispatches/${dispatch.id}/reopen`, { lockVersion: dispatch.lockVersion }, 'POST', 'reopen')}>Reabrir expediente</button> : null}</div>
    <Checklist dispatch={dispatch} canOperate={dispatch.permissions?.canOperate ?? role === 'ADMIN'} busy={busy} call={call} download={item => downloadAttachment(item, 'dispatch-checklist-evidence')} />
    {dispatch.status === 'PREPARING' ? <PackageForm dispatch={dispatch} busy={busy} call={call} /> : null}<PackageList dispatch={dispatch} busy={busy} call={call} />
    {['PREPARING', 'READY', 'AUTHORIZED'].includes(dispatch.status) ? <DocumentForm dispatch={dispatch} busy={busy} call={call} /> : null}<DocumentList dispatch={dispatch} busy={busy} call={call} download={item => downloadAttachment(item, 'dispatch-documents')} />
    {dispatch.authorizedAt ? <div className="rounded bg-emerald-50 p-3 text-xs">Salida autorizada por {dispatch.authorizedByName} ({dispatch.authorizedByRole}) · {dateLabel(dispatch.authorizedAt, true)}</div> : null}{dispatch.dispatchedAt ? <div className="rounded bg-indigo-50 p-3 text-xs">Despachado por {dispatch.dispatchedByName} · {dateLabel(dispatch.dispatchedAt, true)} · Guía {dispatch.trackingNumber}</div> : null}{dispatch.deliveredAt ? <div className="rounded bg-emerald-50 p-3 text-xs">Entregado a {dispatch.receivedByName} · {dateLabel(dispatch.deliveredAt, true)} · Soporte {dispatch.deliveryProofReference}</div> : null}{dispatch.canceledReason ? <div className="rounded bg-red-50 p-3 text-xs text-red-700">Cancelado: {dispatch.canceledReason}</div> : null}
  </div> : null}</div></DispatchGalleryProvider>;
}

function LogisticsForm({ dispatch, users, busy, call }: { dispatch: ManufacturingDispatch; users: ManufacturingUser[]; busy: string; call: Function }) {
  const [destination, setDestination] = useState(dispatch.destination || ''); const [address, setAddress] = useState(dispatch.deliveryAddress || ''); const [contactName, setContactName] = useState(dispatch.contactName || ''); const [contactPhone, setContactPhone] = useState(dispatch.contactPhone || ''); const [carrierName, setCarrierName] = useState(dispatch.carrierName || ''); const [responsibleUserId, setResponsibleUserId] = useState(dispatch.responsibleUserId); const [plannedDispatchAt, setPlannedDispatchAt] = useState(dispatch.plannedDispatchAt?.slice(0, 16) || '');
  return <div className="rounded bg-gray-50 p-3"><div className="mb-2 text-sm font-medium">Datos logísticos</div><div className="grid gap-2 md:grid-cols-3"><input className="rounded border px-2 py-1.5 text-sm" placeholder="Destino" value={destination} onChange={(event) => setDestination(event.target.value)} /><input className="rounded border px-2 py-1.5 text-sm md:col-span-2" placeholder="Dirección de entrega" value={address} onChange={(event) => setAddress(event.target.value)} /><input className="rounded border px-2 py-1.5 text-sm" placeholder="Contacto" value={contactName} onChange={(event) => setContactName(event.target.value)} /><input className="rounded border px-2 py-1.5 text-sm" placeholder="Teléfono" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} /><input className="rounded border px-2 py-1.5 text-sm" placeholder="Transportista" value={carrierName} onChange={(event) => setCarrierName(event.target.value)} /><select className="rounded border px-2 py-1.5 text-sm" value={responsibleUserId} onChange={(event) => setResponsibleUserId(event.target.value)}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select><input className="rounded border px-2 py-1.5 text-sm" type="datetime-local" value={plannedDispatchAt} onChange={(event) => setPlannedDispatchAt(event.target.value)} /><button disabled={!!busy} className="rounded border bg-white px-3 py-1.5 text-sm" onClick={() => call(`dispatches/${dispatch.id}`, { lockVersion: dispatch.lockVersion, destination, deliveryAddress: address, contactName, contactPhone, carrierName, responsibleUserId, plannedDispatchAt: plannedDispatchAt || null }, 'PATCH', 'logistics')}>Guardar logística</button></div></div>;
}

function LogisticsSummary({ dispatch }: { dispatch: ManufacturingDispatch }) { return <div className="grid gap-2 rounded bg-gray-50 p-3 text-xs md:grid-cols-3"><div><span className="text-gray-500">Destino</span><br />{dispatch.destination || '—'}<br />{dispatch.deliveryAddress || '—'}</div><div><span className="text-gray-500">Transportista</span><br />{dispatch.carrierName || '—'}{dispatch.vehiclePlate ? ` · ${dispatch.vehiclePlate}` : ''}</div><div><span className="text-gray-500">Fecha planeada</span><br />{dateLabel(dispatch.plannedDispatchAt, true)}</div></div>; }

function Checklist({ dispatch, canOperate, busy, call, download }: { dispatch: ManufacturingDispatch; canOperate: boolean; busy: string; call: DispatchCall; download: (item: ManufacturingDispatchChecklistEvidence) => Promise<void> }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const anyExpanded = dispatch.checklistItems.some(item => expandedIds.has(item.id));
  const allExpanded = !!dispatch.checklistItems.length && dispatch.checklistItems.every(item => expandedIds.has(item.id));
  function toggle(id: string) {
    setExpandedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-sm font-medium">Checklist de embalaje ({dispatch.summary.checklistCompletedCount}/{dispatch.summary.checklistCount})</div>
      <div className="flex gap-2">
        <button type="button" disabled={!dispatch.checklistItems.length || allExpanded} className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-50" onClick={() => setExpandedIds(new Set(dispatch.checklistItems.map(item => item.id)))}>Expandir todos</button>
        <button type="button" disabled={!anyExpanded} className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-50" onClick={() => setExpandedIds(new Set())}>Contraer todos</button>
      </div>
    </div>
    <div className="space-y-2">{dispatch.checklistItems.map(item => <ChecklistPoint key={item.id} item={item} expanded={expandedIds.has(item.id)} onToggle={() => toggle(item.id)} editable={dispatch.status === 'PREPARING' && canOperate} busy={busy} call={call} download={download} />)}</div>
  </div>;
}

function ChecklistPoint({ item, expanded, onToggle, editable, busy, call, download }: { item: ManufacturingDispatchChecklistItem; expanded: boolean; onToggle: () => void; editable: boolean; busy: string; call: DispatchCall; download: (item: ManufacturingDispatchChecklistEvidence) => Promise<void> }) {
  const [reference, setReference] = useState(item.evidenceReference || ''); const [notes, setNotes] = useState(item.notes || ''); const [addingEvidence, setAddingEvidence] = useState(false);
  const evidence = item.evidence || [];
  const canComplete = !item.evidenceRequired || !!reference.trim() || evidence.length > 0;
  const changed = reference.trim() !== (item.evidenceReference || '') || notes.trim() !== (item.notes || '');
  async function save(status = item.status) { await call(`dispatch-checklist/${item.id}`, { lockVersion: item.lockVersion, status, evidenceReference: reference.trim() || null, notes: notes.trim() || null }, 'PATCH', `check-${item.id}`); }
  return <div className="rounded border text-sm">
    <h3>
      <button type="button" id={`checklist-toggle-${item.id}`} aria-expanded={expanded} aria-controls={`checklist-panel-${item.id}`} onClick={onToggle} className="flex w-full items-start gap-2 rounded p-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700">
        <span aria-hidden="true" className="shrink-0 text-gray-500">{expanded ? '▾' : '▸'}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words font-semibold">{item.position}. {item.name}</span>
          <span className="block text-xs font-normal text-gray-500">{item.required ? 'Obligatorio' : 'Opcional'}{item.evidenceRequired ? ' · Evidencia obligatoria' : ''} · {evidence.length} {evidence.length === 1 ? 'archivo' : 'archivos'}</span>
        </span>
        <span className={`shrink-0 text-xs font-normal ${item.status === 'COMPLETED' ? 'text-emerald-700' : 'text-gray-500'}`}>{item.status === 'COMPLETED' ? '✓ Completado' : item.status === 'NOT_APPLICABLE' ? 'No aplica' : 'Pendiente'}</span>
      </button>
    </h3>
    <div id={`checklist-panel-${item.id}`} role="region" aria-labelledby={`checklist-toggle-${item.id}`} hidden={!expanded} className="space-y-3 border-t p-3">
    {item.description ? <p className="text-xs text-gray-600">{item.description}</p> : null}
    {item.completedAt ? <p className="text-xs text-gray-600">Completado por {item.completedByName || '—'} · {dateLabel(item.completedAt, true)}</p> : null}
    {editable ? <form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={!!busy} className="space-y-2"><label className="block text-xs font-medium">Referencia de evidencia<input aria-label={`Referencia de ${item.name}`} maxLength={1000} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" placeholder="Referencia o ubicación del soporte (opcional si adjuntas un archivo)" value={reference} onChange={event => setReference(event.target.value)} /></label><label className="block text-xs font-medium">Notas<textarea aria-label={`Notas de ${item.name}`} maxLength={5000} rows={2} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" value={notes} onChange={event => setNotes(event.target.value)} /></label><div className="flex flex-wrap gap-2"><button disabled={!!busy || !changed} className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-50">Guardar información</button>{item.status === 'PENDING' ? <button type="button" disabled={!!busy || !canComplete} className="rounded bg-emerald-700 px-2 py-1 text-xs text-white disabled:opacity-50" onClick={() => save('COMPLETED')}>{busy === `check-${item.id}` ? 'Guardando…' : 'Completar punto'}</button> : <button type="button" disabled={!!busy} className="rounded border px-2 py-1 text-xs disabled:opacity-50" onClick={() => save('PENDING')}>Reabrir punto</button>}</div>{!canComplete ? <p className="text-xs text-amber-800">Adjunta al menos un archivo o registra una referencia para completar este punto.</p> : null}</fieldset></form> : <div className="space-y-1 text-xs text-gray-600">{item.evidenceReference ? <p className="break-words whitespace-pre-wrap"><span className="font-medium">Referencia:</span> {item.evidenceReference}</p> : null}{item.notes ? <p className="whitespace-pre-wrap"><span className="font-medium">Notas:</span> {item.notes}</p> : null}</div>}
    <div className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium">Documentos e imágenes ({evidence.length})</span><DispatchGalleryButton checklistItemId={item.id} />{editable ? <button type="button" disabled={!!busy} aria-expanded={addingEvidence} className="rounded border bg-white px-2 py-1 text-xs disabled:opacity-50" onClick={() => setAddingEvidence(value => !value)}>{addingEvidence ? 'Ocultar formulario' : 'Agregar evidencia'}</button> : null}</div>{evidence.length ? <div className="space-y-2">{evidence.map(attachment => <div key={attachment.id} className="space-y-1 rounded bg-gray-50 p-2 text-xs"><DispatchGalleryThumbnail file={attachment} resource="dispatch-checklist-evidence" /><p className="break-words"><span className="text-gray-500">{attachment.mimeType.startsWith('image/') ? 'Imagen' : 'Documento'} · </span><strong>{attachment.title}</strong></p>{attachment.notes ? <p className="whitespace-pre-wrap text-gray-600">{attachment.notes}</p> : null}<p className="text-gray-500">{attachment.createdByName} · {dateLabel(attachment.createdAt, true)}</p><div className="flex flex-wrap items-center gap-2"><span className="break-all text-gray-600">{attachment.filename} · {fileSizeLabel(attachment.size)}</span><button type="button" disabled={!!busy} className="rounded border bg-white px-2 py-1 disabled:opacity-50" onClick={() => download(attachment)}>{busy === `download-${attachment.id}` ? 'Descargando…' : 'Descargar archivo'}</button>{editable ? <button type="button" disabled={!!busy} className="text-red-700 underline disabled:opacity-50" onClick={() => call(`dispatch-checklist-evidence/${attachment.id}`, {}, 'DELETE', `evidence-${attachment.id}`)}>Retirar</button> : null}</div></div>)}</div> : <p className="text-xs text-gray-500">Sin archivos adjuntos en este punto.</p>}{editable && addingEvidence ? <ChecklistEvidenceForm itemId={item.id} busy={busy} call={call} /> : null}</div>
    </div>
  </div>;
}

function ChecklistEvidenceForm({ itemId, busy, call }: { itemId: string; busy: string; call: DispatchCall }) {
  const [title, setTitle] = useState(''); const [notes, setNotes] = useState(''); const [files, setFiles] = useState<File[]>([]); const input = useRef<HTMLInputElement>(null);
  const totalSize = files.reduce((total, file) => total + file.size, 0);
  const fileErrors = files.flatMap(file => { const error = documentFileError(file); return error ? [`${file.name}: ${error}`] : []; });
  if (files.length > 10) fileErrors.push('Puedes adjuntar hasta 10 archivos por carga. Retira los archivos adicionales.');
  if (totalSize > 50 * 1024 * 1024) fileErrors.push('La carga completa no debe superar 50 MB. Retira algunos archivos.');
  function clearFiles() { setFiles([]); if (input.current) input.current.value = ''; }
  function selectFiles(selection: FileList | null) {
    const next = Array.from(selection || []); if (!next.length) return;
    setFiles(current => {
      const combined = [...current];
      for (const file of next) if (!combined.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified && existing.type === file.type)) combined.push(file);
      return combined;
    });
    if (!title.trim()) setTitle(next.length === 1 ? next[0].name.slice(0, 200) : 'Evidencias de embalaje');
    if (input.current) input.current.value = '';
  }
  async function add() {
    if (busy || !files.length || !title.trim() || fileErrors.length) return;
    const body = new FormData(); for (const file of files) body.append('files', file); body.append('title', title.trim()); if (notes.trim()) body.append('notes', notes.trim());
    if (await call(`dispatch-checklist/${itemId}/evidence/files`, body, 'POST', `evidence-upload-${itemId}`)) { setTitle(''); setNotes(''); clearFiles(); }
  }
  return <form className="space-y-2 rounded bg-sky-50 p-3" onSubmit={event => { event.preventDefault(); void add(); }}><fieldset disabled={!!busy} className="space-y-2">
    <label className="block text-xs font-medium">Título de las evidencias<input required maxLength={200} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" placeholder="Ej. Anclajes y protecciones del motor" value={title} onChange={event => setTitle(event.target.value)} /></label>
    <label className="block text-xs font-medium">Descripción (opcional)<textarea rows={2} maxLength={5000} className="mt-1 block w-full rounded border px-2 py-1.5 text-sm" value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <p className="text-xs text-gray-600">El título y la descripción se guardarán en cada archivo.</p>
    <label className="block text-xs font-medium">Seleccionar documentos o imágenes<input ref={input} multiple type="file" accept={documentFileAccept} className="mt-1 block w-full text-xs" onChange={event => selectFiles(event.target.files)} /></label>
    <p className="text-xs text-gray-600">Puedes seleccionar varias fotos a la vez y añadir más antes de subir. PDF, Word, Excel, CSV, TXT, JPG, PNG o WebP. Hasta 10 archivos por carga, 20 MB por archivo y 50 MB en total.</p>
    {files.length ? <div className="space-y-2"><p className="text-xs font-medium">{files.length} archivo(s) seleccionado(s) · {fileSizeLabel(totalSize)} en total</p><ul className="space-y-1">{files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1 text-xs"><span className="min-w-0 break-all">{file.name} · {fileSizeLabel(file.size)}</span><button type="button" aria-label={`Quitar ${file.name}`} className="shrink-0 underline" onClick={() => setFiles(current => current.filter((_, position) => position !== index))}>Quitar</button></li>)}</ul></div> : null}
    {fileErrors.length ? <ul role="alert" className="space-y-1 text-xs text-red-700">{fileErrors.map((error, index) => <li key={index}>{error}</li>)}</ul> : null}
    <div className="flex flex-wrap gap-3">{files.length ? <button type="button" className="text-xs underline" onClick={clearFiles}>Quitar todos</button> : null}<button disabled={!!busy || !files.length || !title.trim() || !!fileErrors.length} className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50">{busy === `evidence-upload-${itemId}` ? `Subiendo ${files.length} archivo${files.length === 1 ? '' : 's'}…` : files.length ? `Adjuntar ${files.length} archivo${files.length === 1 ? '' : 's'}` : 'Adjuntar archivos'}</button></div>
  </fieldset></form>;
}

function PackageForm({ dispatch, busy, call }: { dispatch: ManufacturingDispatch; busy: string; call: Function }) { const [packageType, setPackageType] = useState<ManufacturingDispatchPackageType>('CRATE'); const [description, setDescription] = useState('Máquina embalada'); const [grossWeightKg, setGrossWeightKg] = useState(''); const [dimensions, setDimensions] = useState({ lengthCm: '', widthCm: '', heightCm: '' }); const [sealNumber, setSealNumber] = useState(''); async function add() { await call(`dispatches/${dispatch.id}/packages`, { packageType, description, grossWeightKg: Number(grossWeightKg), ...dimensions, sealNumber: sealNumber || null }, 'POST', 'package'); setGrossWeightKg(''); setSealNumber(''); } return <div className="rounded bg-amber-50 p-3"><div className="mb-2 text-sm font-medium">Agregar bulto</div><div className="flex flex-wrap items-end gap-2"><select className="rounded border px-2 py-1.5 text-sm" value={packageType} onChange={(event) => setPackageType(event.target.value as ManufacturingDispatchPackageType)}><option value="CRATE">Guacal</option><option value="PALLET">Estiba</option><option value="BOX">Caja</option><option value="LOOSE">Carga suelta</option><option value="OTHER">Otro</option></select><input className="rounded border px-2 py-1.5 text-sm" placeholder="Descripción" value={description} onChange={(event) => setDescription(event.target.value)} /><input className="w-24 rounded border px-2 py-1.5 text-sm" type="number" placeholder="Peso kg" value={grossWeightKg} onChange={(event) => setGrossWeightKg(event.target.value)} />{(['lengthCm', 'widthCm', 'heightCm'] as const).map((key) => <input key={key} className="w-20 rounded border px-2 py-1.5 text-sm" type="number" placeholder={key === 'lengthCm' ? 'L cm' : key === 'widthCm' ? 'A cm' : 'H cm'} value={dimensions[key]} onChange={(event) => setDimensions((value) => ({ ...value, [key]: event.target.value }))} />)}<input className="w-28 rounded border px-2 py-1.5 text-sm" placeholder="Sello" value={sealNumber} onChange={(event) => setSealNumber(event.target.value)} /><button disabled={!!busy || Number(grossWeightKg) <= 0} className="rounded border bg-white px-3 py-1.5 text-sm" onClick={add}>Registrar bulto</button></div></div>; }
function PackageList({ dispatch, busy, call }: { dispatch: ManufacturingDispatch; busy: string; call: Function }) { return <div><div className="mb-2 text-sm font-medium">Bultos</div>{dispatch.packages.length ? <div className="grid gap-2 md:grid-cols-2">{dispatch.packages.map((item) => <div key={item.id} className="rounded border p-2 text-xs"><strong>{item.packageCode}</strong> · {packageTypeLabel(item.packageType)} · {item.description}<br />{formatNumber(item.grossWeightKg)} kg{item.lengthCm ? ` · ${item.lengthCm}×${item.widthCm}×${item.heightCm} cm` : ''}{item.sealNumber ? ` · Sello ${item.sealNumber}` : ''}{dispatch.status === 'PREPARING' ? <button disabled={!!busy} className="ml-2 text-red-700 underline" onClick={() => call(`dispatch-packages/${item.id}`, {}, 'DELETE', `package-${item.id}`)}>Retirar</button> : null}</div>)}</div> : <div className="text-xs text-gray-400">Sin bultos registrados</div>}</div>; }

const documentFileAccept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp';

function DocumentForm({ dispatch, busy, call }: { dispatch: ManufacturingDispatch; busy: string; call: DispatchCall }) {
  const [documentType, setDocumentType] = useState<ManufacturingDispatchDocumentType>('PACKING_LIST'); const [title, setTitle] = useState('Lista de empaque'); const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null); const [fileError, setFileError] = useState(''); const input = useRef<HTMLInputElement>(null);
  function clearFile() { setFile(null); setFileError(''); if (input.current) input.current.value = ''; }
  function selectFile(next?: File) {
    setFile(null); setFileError(''); if (!next) return;
    const error = documentFileError(next); if (error) { setFileError(error); return; }
    setFile(next);
  }
  async function add() {
    if (busy || !title.trim() || (!file && !reference.trim()) || fileError) return;
    let body: FormData | { documentType: ManufacturingDispatchDocumentType; title: string; reference: string };
    if (file) { body = new FormData(); body.append('file', file); body.append('documentType', documentType); body.append('title', title.trim()); if (reference.trim()) body.append('reference', reference.trim()); }
    else body = { documentType, title: title.trim(), reference: reference.trim() };
    if (await call(`dispatches/${dispatch.id}/documents${file ? '/file' : ''}`, body, 'POST', 'document')) { setReference(''); clearFile(); }
  }
  return <form className="space-y-2 rounded bg-sky-50 p-3" onSubmit={event => { event.preventDefault(); void add(); }}>
    <div className="text-sm font-medium">Agregar documento</div>
    <fieldset disabled={!!busy} className="space-y-2">
      <div className="flex flex-wrap gap-2"><select aria-label="Tipo de documento" className="rounded border px-2 py-1.5 text-sm" value={documentType} onChange={(event) => setDocumentType(event.target.value as ManufacturingDispatchDocumentType)}>{Object.entries(documentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input required maxLength={200} aria-label="Título del documento" className="rounded border px-2 py-1.5 text-sm" placeholder="Título" value={title} onChange={(event) => setTitle(event.target.value)} /><input aria-label="Referencia del documento" className="min-w-64 flex-1 rounded border px-2 py-1.5 text-sm" placeholder={file ? 'Referencia (opcional)' : 'Referencia (si no adjuntas archivo)'} value={reference} onChange={(event) => setReference(event.target.value)} /></div>
      <label className="block text-xs font-medium">Adjuntar documento<input ref={input} type="file" accept={documentFileAccept} className="mt-1 block w-full text-xs" onChange={event => selectFile(event.target.files?.[0])} /></label>
      <p className="text-xs text-gray-600">PDF, Word, Excel, CSV, TXT, JPG, PNG o WebP. Máximo 20 MB por archivo. Puedes adjuntar un archivo o registrar una referencia.</p>
      {file ? <p className="break-all text-xs">{file.name} · {fileSizeLabel(file.size)}</p> : null}
      {fileError ? <p role="alert" className="text-xs text-red-700">{fileError}</p> : null}
      <div className="flex gap-3">{file || fileError ? <button type="button" className="text-xs underline" onClick={clearFile}>Quitar archivo</button> : null}<button disabled={!!busy || !title.trim() || (!file && !reference.trim()) || !!fileError} className="rounded border bg-white px-3 py-1.5 text-sm disabled:opacity-50">{busy === 'document' ? (file ? 'Subiendo documento…' : 'Registrando…') : 'Registrar documento'}</button></div>
    </fieldset>
  </form>;
}

function DocumentList({ dispatch, busy, call, download }: { dispatch: ManufacturingDispatch; busy: string; call: DispatchCall; download: (item: ManufacturingDispatchDocument) => Promise<void> }) {
  return <div><div className="mb-2 text-sm font-medium">Documentos</div>{dispatch.documents.length ? dispatch.documents.map((item) => <div key={item.id} className="space-y-1 border-t py-2 text-xs text-gray-600"><DispatchGalleryThumbnail file={item} resource="dispatch-documents" /><p>{documentTypeLabels[item.documentType]} · <strong>{item.title}</strong>{item.reference ? ` · ${item.reference}` : ''} · {item.createdByName}</p>{item.url && /^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block underline">Abrir enlace</a> : null}{item.notes ? <p className="whitespace-pre-wrap">{item.notes}</p> : null}{item.filename ? <div className="flex flex-wrap items-center gap-2"><span className="break-all">{item.filename}{item.size != null ? ` · ${fileSizeLabel(item.size)}` : ''}</span><button type="button" disabled={!!busy} className="rounded border bg-white px-2 py-1 disabled:opacity-50" onClick={() => download(item)}>{busy === `download-${item.id}` ? 'Descargando…' : 'Descargar archivo'}</button></div> : null}{['PREPARING', 'READY', 'AUTHORIZED'].includes(dispatch.status) ? <button type="button" disabled={!!busy} className="text-red-700 underline disabled:opacity-50" onClick={() => call(`dispatch-documents/${item.id}`, {}, 'DELETE', `document-${item.id}`)}>Retirar</button> : null}</div>) : <div className="text-xs text-gray-400">Sin documentos</div>}</div>;
}

function documentFileError(file: File) { const extension = `.${file.name.split('.').pop()?.toLowerCase()}`; if (!documentFileAccept.split(',').includes(extension)) return 'Usa PDF, Word, Excel, CSV, TXT, JPG, PNG o WebP.'; if (!file.size || file.size > 20 * 1024 * 1024) return 'El archivo debe contener datos y no superar 20 MB.'; return ''; }
function fileSizeLabel(size: number) { return size < 1024 * 1024 ? `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(size / 1024)} KB` : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(size / 1024 / 1024)} MB`; }

const documentTypeLabels: Record<ManufacturingDispatchDocumentType, string> = { PACKING_LIST: 'Lista de empaque', TRANSPORT_DOCUMENT: 'Documento de transporte', COMMERCIAL_INVOICE: 'Factura comercial', INSURANCE: 'Seguro', CERTIFICATE: 'Certificado', MANUAL: 'Manual', FAT_REPORT: 'Informe FAT', OTHER: 'Otro' };
function statusLabel(status: ManufacturingDispatch['status']) { return { DRAFT: 'Borrador', PREPARING: 'En preparación', READY: 'Embalaje listo', AUTHORIZED: 'Salida autorizada', DISPATCHED: 'En tránsito', DELIVERED: 'Entregado', CANCELED: 'Cancelado' }[status]; }
function statusClass(status: ManufacturingDispatch['status']) { return status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' : status === 'DISPATCHED' ? 'bg-indigo-100 text-indigo-800' : status === 'AUTHORIZED' ? 'bg-cyan-100 text-cyan-800' : status === 'READY' ? 'bg-amber-100 text-amber-800' : status === 'CANCELED' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'; }
function packageTypeLabel(type: ManufacturingDispatchPackageType) { return { CRATE: 'Guacal', PALLET: 'Estiba', BOX: 'Caja', LOOSE: 'Carga suelta', OTHER: 'Otro' }[type]; }
function formatNumber(value: number) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(Number(value || 0)); }
function apiError(error: any, fallback: string) { const message = String(error?.message || ''); try { const start = message.indexOf('{'); if (start >= 0) { const parsed = JSON.parse(message.slice(start)); return Array.isArray(parsed.message) ? parsed.message.join('\n') : parsed.message || fallback; } } catch {} return message || fallback; }
