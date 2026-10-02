'use client';
import { useEffect, useState } from 'react';
import { ApprovalException } from '../ApprovalException';
import { dateLabel, type ManufacturingFatCase, type ManufacturingFatDeviation, type ManufacturingFatExecution } from '@/lib/manufacturing';

export type FatFindingCall = (path: string, body: unknown, method?: string, action?: string) => Promise<boolean | void>;
type Person = { id: string; name: string };
const labels = { OPEN: 'Abierta', IN_REWORK: 'En corrección', PENDING_VERIFICATION: 'Pendiente de verificar', RESOLVED: 'Cerrada y verificada', ACCEPTED_AS_IS: 'Aceptada por concesión' };
const severityLabels = { MINOR: 'Menor', MAJOR: 'Mayor', CRITICAL: 'Crítica' };
const pending = (status: string) => ['OPEN', 'IN_REWORK', 'PENDING_VERIFICATION'].includes(status);
const inputClass = 'mt-1 block w-full rounded border bg-white px-2 py-1.5 text-sm disabled:bg-gray-100';
const buttonClass = 'rounded border bg-white px-3 py-1.5 text-xs disabled:opacity-50';

export function ManufacturingFatFindings({ fatCase, executionStatus, permissions, role, assignees, busy, call }: {
  fatCase: ManufacturingFatCase; executionStatus: ManufacturingFatExecution['status']; permissions: ManufacturingFatExecution['permissions']; role: string; assignees: Person[]; busy: string; call: FatFindingCall;
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ManufacturingFatDeviation['kind']>('NON_CONFORMITY');
  const [severity, setSeverity] = useState<ManufacturingFatDeviation['severity']>('MAJOR');
  const [title, setTitle] = useState(''); const [description, setDescription] = useState('');
  const [location, setLocation] = useState(''); const [responsible, setResponsible] = useState(''); const [dueAt, setDueAt] = useState('');
  const findings = fatCase.deviations;
  const openCount = findings.filter(d => pending(d.status)).length;
  const blockingCount = findings.filter(d => pending(d.status) && d.kind === 'NON_CONFORMITY').length;
  async function create() {
    if (await call(`fat-cases/${fatCase.id}/deviations`, { lockVersion: fatCase.lockVersion, title, description, kind, severity, location: location || null, responsibleUserId: responsible || null, dueAt: dueAt || null })) {
      setAdding(false); setTitle(''); setDescription(''); setLocation('');
    }
  }
  return <section className="space-y-3 border-t pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">Novedades de este punto</h4><p className="text-xs text-gray-600">{findings.length} registradas · {findings.length - openCount} cerradas · {openCount} pendientes · {blockingCount} bloqueantes</p></div>{permissions.canOperate && executionStatus === 'IN_PROGRESS' ? <button type="button" className={buttonClass} disabled={!!busy} onClick={() => setAdding(value => !value)}>{adding ? 'Cancelar registro' : 'Registrar novedad'}</button> : null}</div>
    {adding ? <form className="rounded border bg-gray-50 p-3" onSubmit={e => { e.preventDefault(); void create(); }}><fieldset disabled={!!busy} className="grid gap-3 md:grid-cols-2">
      <label className="text-xs">Clasificación<select className={inputClass} value={kind} onChange={e => { const value = e.target.value as typeof kind; setKind(value); if (value === 'OBSERVATION') setSeverity('MINOR'); }}><option value="NON_CONFORMITY">No conformidad (bloquea)</option><option value="OBSERVATION">Observación (no bloquea)</option></select></label>
      <label className="text-xs">Severidad<select className={inputClass} value={severity} disabled={kind === 'OBSERVATION'} onChange={e => setSeverity(e.target.value as typeof severity)}>{Object.entries(severityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <p className="text-xs text-gray-600 md:col-span-2">Usa observación solo para recomendaciones o aclaraciones que no incumplen el criterio de aceptación.</p>
      <label className="text-xs">Título<input className={inputClass} required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label className="text-xs">Ubicación / componente<input className={inputClass} maxLength={500} placeholder="Tablero principal / bornera X1" value={location} onChange={e => setLocation(e.target.value)} /></label>
      <label className="text-xs md:col-span-2">Descripción<textarea className={inputClass} required minLength={5} maxLength={10000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <label className="text-xs">Responsable<select className={inputClass} value={responsible} onChange={e => setResponsible(e.target.value)}><option value="">Sin asignar</option>{assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className="text-xs">Fecha compromiso<input type="date" className={inputClass} value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
      <button type="submit" disabled={!title.trim() || description.trim().length < 5} className={buttonClass}>Guardar novedad</button>
    </fieldset></form> : null}
    {!findings.length ? <p className="text-xs text-gray-500">No se han registrado novedades.</p> : findings.map(finding => <FindingCard key={finding.id} finding={finding} editable={permissions.canOperate && (executionStatus === 'IN_PROGRESS' || (executionStatus === 'APPROVED' && finding.kind === 'OBSERVATION'))} canVerify={permissions.canVerify} role={role} assignees={assignees} busy={busy} call={call} />)}
  </section>;
}

function FindingCard({ finding, editable, canVerify, role, assignees, busy, call }: { finding: ManufacturingFatDeviation; editable: boolean; canVerify: boolean; role: string; assignees: Person[]; busy: string; call: FatFindingCall }) {
  const [responsible, setResponsible] = useState(finding.responsibleUserId || ''); const [dueAt, setDueAt] = useState(finding.dueAt?.slice(0, 10) || '');
  const [action, setAction] = useState(finding.correctiveAction || ''); const [resolution, setResolution] = useState(finding.resolutionNotes || '');
  const [verification, setVerification] = useState(''); const [exception, setException] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState(''); const [reference, setReference] = useState(''); const [url, setUrl] = useState('');
  useEffect(() => { setResponsible(finding.responsibleUserId || ''); setDueAt(finding.dueAt?.slice(0, 10) || ''); setAction(finding.correctiveAction || ''); setResolution(finding.resolutionNotes || ''); setVerification(''); setException(''); }, [finding.lockVersion]);
  const isOpen = pending(finding.status);
  const waiting = finding.status === 'PENDING_VERIFICATION';
  async function update(status: ManufacturingFatDeviation['status']) {
    await call(`fat-deviations/${finding.id}`, { lockVersion: finding.lockVersion, status, responsibleUserId: responsible || null, dueAt: dueAt || null, correctiveAction: action || null, resolutionNotes: resolution || null, verificationNotes: verification || null, approvalExceptionReason: exception || undefined }, 'PATCH');
  }
  async function evidence() {
    if (await call(`fat-deviations/${finding.id}/evidence`, { title: evidenceTitle, reference: reference || null, url: url || null })) { setEvidenceTitle(''); setReference(''); setUrl(''); }
  }
  return <details className={`rounded border p-3 ${finding.kind === 'NON_CONFORMITY' && isOpen ? 'border-red-200' : ''}`}>
    <summary className="cursor-pointer text-sm"><strong>{finding.deviationCode}: {finding.title}</strong> · {labels[finding.status]}<span className="ml-2 text-xs">{finding.kind === 'OBSERVATION' ? 'Observación · No bloquea' : `No conformidad · ${severityLabels[finding.severity]}`}</span></summary>
    <div className="mt-3 space-y-3 text-sm"><p className="whitespace-pre-wrap">{finding.description}</p><p className="text-xs text-gray-600">Componente: {finding.location || 'Sin especificar'} · Responsable: {finding.responsibleName || 'Sin asignar'} · Compromiso: {dateLabel(finding.dueAt)}</p>
      <p className="text-xs text-gray-500">Registrada por {finding.openedByName} · {dateLabel(finding.openedAt, true)}{finding.correctedByName ? ` · Corrección: ${finding.correctedByName}` : ''}{finding.resolvedByName ? ` · Cierre: ${finding.resolvedByName}` : ''}</p>
      {editable && isOpen ? <fieldset disabled={!!busy} className="grid gap-3 rounded bg-gray-50 p-3 md:grid-cols-2">
        <label className="text-xs">Responsable<select className={inputClass} value={responsible} onChange={e => setResponsible(e.target.value)}><option value="">Sin asignar</option>{responsible && !assignees.some(p => p.id === responsible) ? <option value={responsible}>{finding.responsibleName} (sin acceso actual)</option> : null}{assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-xs">Fecha compromiso<input type="date" className={inputClass} value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
        <label className="text-xs md:col-span-2">Acción correctiva<textarea className={inputClass} readOnly={waiting} value={action} onChange={e => setAction(e.target.value)} /></label>
        <label className="text-xs md:col-span-2">Corrección realizada / justificación de concesión<textarea className={inputClass} readOnly={waiting} value={resolution} onChange={e => setResolution(e.target.value)} /></label>
        {waiting && canVerify ? <div className="space-y-2 md:col-span-2"><label className="text-xs">Resultado de la verificación<textarea className={inputClass} value={verification} onChange={e => setVerification(e.target.value)} /></label><ApprovalException value={exception} onChange={setException} /></div> : null}
        <div className="flex flex-wrap gap-2 md:col-span-2"><button type="button" className={buttonClass} onClick={() => update(finding.status)}>Guardar seguimiento</button>
          {finding.status === 'OPEN' ? <button type="button" className={buttonClass} disabled={action.trim().length < 5} onClick={() => update('IN_REWORK')}>Iniciar corrección</button> : null}
          {finding.status === 'IN_REWORK' ? <button type="button" className={buttonClass} disabled={resolution.trim().length < 5} onClick={() => update('PENDING_VERIFICATION')}>Enviar a verificación</button> : null}
          {waiting && canVerify ? <><button type="button" className={buttonClass} disabled={verification.trim().length < 5} onClick={() => update('RESOLVED')}>Verificar y cerrar</button><button type="button" className={buttonClass} disabled={verification.trim().length < 5} onClick={() => update('IN_REWORK')}>Devolver a corrección</button></> : null}
          {role === 'ADMIN' && finding.kind === 'NON_CONFORMITY' && finding.severity !== 'CRITICAL' && !waiting ? <button type="button" className={buttonClass} disabled={resolution.trim().length < 5} onClick={() => update('ACCEPTED_AS_IS')}>Aceptar por concesión</button> : null}
        </div>
      </fieldset> : <div className="space-y-1 text-xs"><p>Acción: {finding.correctiveAction || '—'}</p><p>Corrección / concesión: {finding.resolutionNotes || '—'}</p><p>Verificación: {finding.verificationNotes || '—'}</p>{editable ? <button type="button" disabled={!!busy} className={buttonClass} onClick={() => { if (window.confirm('¿Reabrir esta novedad? Una no conformidad volverá a bloquear el punto.')) void update('OPEN'); }}>Reabrir novedad</button> : null}</div>}
      <div><h5 className="font-medium">Evidencias de la novedad</h5>{finding.evidence.length ? finding.evidence.map(e => <div key={e.id} className="border-t py-1 text-xs"><strong>{e.title}</strong> · {e.reference}{e.url && /^https?:\/\//i.test(e.url) ? <a className="ml-2 underline" href={e.url} target="_blank" rel="noopener noreferrer">Abrir evidencia</a> : null}<p>{e.notes}</p><span className="text-gray-500">{e.createdByName} · {dateLabel(e.createdAt, true)}</span></div>) : <p className="text-xs text-gray-500">Sin evidencias registradas.</p>}</div>
      {editable ? <form onSubmit={e => { e.preventDefault(); void evidence(); }}><fieldset disabled={!!busy} className="grid gap-2 md:grid-cols-3"><label className="text-xs">Título de evidencia<input required className={inputClass} value={evidenceTitle} onChange={e => setEvidenceTitle(e.target.value)} /></label><label className="text-xs">Referencia<input className={inputClass} value={reference} onChange={e => setReference(e.target.value)} /></label><label className="text-xs">Enlace HTTP/HTTPS<input type="url" className={inputClass} value={url} onChange={e => setUrl(e.target.value)} /></label><button className={buttonClass} disabled={!evidenceTitle.trim() || (!reference.trim() && !url.trim())}>Agregar evidencia</button></fieldset></form> : null}
      <details><summary className="cursor-pointer text-xs">Historial ({finding.history.length})</summary>{finding.history.map(event => <div key={event.id} className="border-t py-2 text-xs"><p>{dateLabel(event.createdAt, true)} · {event.actorName} · {event.summary}</p>{['correctiveAction', 'resolutionNotes', 'verificationNotes', 'approvalExceptionReason', 'reference'].map(key => typeof event.afterData?.[key] === 'string' && event.afterData[key] ? <p key={key} className="whitespace-pre-wrap text-gray-600">{String(event.afterData[key])}</p> : null)}</div>)}</details>
    </div>
  </details>;
}
