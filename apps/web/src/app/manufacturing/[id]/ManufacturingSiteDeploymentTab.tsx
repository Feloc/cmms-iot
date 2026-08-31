'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';
import type { AssemblyTemplate } from '@/lib/assemblies';
import {
  dateLabel,
  type ManufacturingDispatch,
  type ManufacturingOrder,
  type ManufacturingSiteDeployment,
  type ManufacturingSiteReceiptDecision,
  type ManufacturingUser,
} from '@/lib/manufacturing';
import { ManufacturingSatPanel } from './ManufacturingSatPanel';

type Auth = { token?: string; tenantSlug?: string };
const errorMessage = (error: any, fallback: string) => error?.message || fallback;

export function ManufacturingSiteDeploymentTab({ order, role, auth, onChanged }: { order: ManufacturingOrder; role: string; auth: Auth; onChanged: () => void | Promise<unknown> }) {
  const { data, error, isLoading, mutate } = useApiSWR<ManufacturingSiteDeployment[]>(`/manufacturing/orders/${order.id}/site-deployments`, auth.token, auth.tenantSlug);
  const { data: dispatches } = useApiSWR<ManufacturingDispatch[]>(`/manufacturing/orders/${order.id}/dispatches`, auth.token, auth.tenantSlug);
  const { data: templates } = useApiSWR<AssemblyTemplate[]>('/assemblies/templates?active=true', auth.token, auth.tenantSlug);
  const { data: technicians } = useApiSWR<ManufacturingUser[]>(role === 'ADMIN' ? '/users?role=TECH' : null, auth.token, auth.tenantSlug);
  const [message, setMessage] = useState('');
  const deployments = data || [];
  const eligible = (dispatches || []).filter((item) => item.status === 'DELIVERED' && !deployments.some((deployment) => deployment.dispatchId === item.id));
  async function accept(next: ManufacturingSiteDeployment[]) { await mutate(next, { revalidate: false }); await onChanged(); }
  async function open(dispatchId: string) {
    if (!auth.token || !auth.tenantSlug) return; setMessage('');
    try { await accept(await apiFetch<ManufacturingSiteDeployment[]>(`/manufacturing/dispatches/${dispatchId}/site-deployment`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug })); }
    catch (err: any) { setMessage(errorMessage(err, 'No se pudo abrir la recepción técnica')); }
  }
  return <div className="space-y-4">
    <div><h2 className="text-lg font-semibold">Recepción e instalación en sitio</h2><p className="text-sm text-gray-600">Recibe técnicamente la unidad, crea el activo en puesta en servicio y programa su ejecución en Montajes.</p></div>
    {message ? <div className="whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div> : null}
    {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">No se pudieron cargar las instalaciones.</div> : null}
    {role === 'ADMIN' && eligible.length ? <div className="rounded-lg border p-4"><div className="mb-2 font-medium">Unidades entregadas pendientes de recepción técnica</div><div className="flex flex-wrap gap-2">{eligible.map((dispatch) => <button key={dispatch.id} className="rounded bg-black px-3 py-2 text-sm text-white" onClick={() => open(dispatch.id)}>Abrir {dispatch.dispatchCode}</button>)}</div></div> : null}
    {isLoading ? <div className="py-8 text-center text-sm text-gray-500">Cargando expedientes…</div> : null}
    {!isLoading && !deployments.length ? <div className="rounded-lg border border-dashed p-10 text-center"><div className="font-medium">Aún no hay recepciones técnicas</div><p className="mt-1 text-sm text-gray-600">Primero confirma la entrega de una unidad en Despacho.</p></div> : null}
    <div className="space-y-4">{deployments.map((deployment) => <DeploymentCard key={deployment.id} deployment={deployment} role={role} auth={auth} templates={templates || []} technicians={technicians || []} onChanged={accept} onError={setMessage} />)}</div>
    <ManufacturingSatPanel order={order} deployments={deployments} role={role} auth={auth} users={technicians || []} onSiteChanged={async () => { await mutate(); await onChanged(); }} onError={setMessage} />
  </div>;
}

function DeploymentCard({ deployment, role, auth, templates, technicians, onChanged, onError }: { deployment: ManufacturingSiteDeployment; role: string; auth: Auth; templates: AssemblyTemplate[]; technicians: ManufacturingUser[]; onChanged: (items: ManufacturingSiteDeployment[]) => void | Promise<void>; onError: (message: string) => void }) {
  const [busy, setBusy] = useState('');
  async function call(path: string, body: any, method = 'POST', action = path) {
    if (!auth.token || !auth.tenantSlug) return; setBusy(action); onError('');
    try { await onChanged(await apiFetch<ManufacturingSiteDeployment[]>(`/manufacturing/${path}`, { method, token: auth.token, tenantSlug: auth.tenantSlug, body })); }
    catch (error: any) { onError(errorMessage(error, 'No se pudo actualizar la recepción')); }
    finally { setBusy(''); }
  }
  async function check(item: ManufacturingSiteDeployment['receiptChecks'][number], status: 'PASSED' | 'FAILED') {
    const evidenceReference = item.evidenceRequired ? window.prompt('Referencia de la evidencia:') : window.prompt('Referencia de evidencia (opcional):');
    if (item.evidenceRequired && !evidenceReference) return;
    const notes = status === 'FAILED' ? window.prompt('Describe el hallazgo:') : window.prompt('Notas (opcional):');
    if (status === 'FAILED' && !notes?.trim()) return;
    await call(`site-receipt-checks/${item.id}`, { lockVersion: item.lockVersion, status, evidenceReference, notes }, 'PATCH', `check-${item.id}`);
  }
  async function receive(decision: ManufacturingSiteReceiptDecision) {
    const receivedByName = window.prompt('Nombre de quien recibe o inspecciona:'); if (!receivedByName) return;
    const evidenceReference = window.prompt('Referencia del acta o evidencia de recepción:'); if (!evidenceReference) return;
    const notes = decision === 'ACCEPTED' ? window.prompt('Notas (opcional):') : window.prompt('Observaciones o motivo del bloqueo:');
    if (decision !== 'ACCEPTED' && !notes?.trim()) return;
    await call(`site-deployments/${deployment.id}/receive`, { lockVersion: deployment.lockVersion, decision, receivedByName, evidenceReference, notes }, 'POST', 'receive');
  }
  const canInspect = role !== 'VIEWER' && ['PENDING_RECEPTION', 'RECEPTION_IN_PROGRESS', 'RECEPTION_BLOCKED'].includes(deployment.status);
  return <section className="rounded-lg border p-4 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{deployment.deploymentCode}</div><div className="text-sm text-gray-600">Unidad {deployment.manufacturedUnit.unitNumber} · {deployment.manufacturedUnit.serialNumber || 'Sin serial'} · {deployment.deliveryAddress || deployment.destination || 'Destino sin definir'}</div></div><span className={`rounded-full px-2.5 py-1 text-xs ${statusClass(deployment.status)}`}>{statusLabel(deployment.status)}</span></div>
    <div className="grid gap-2 rounded bg-gray-50 p-3 text-xs md:grid-cols-4"><div><span className="text-gray-500">Despacho</span><br />{deployment.dispatch.dispatchCode}</div><div><span className="text-gray-500">Recepción</span><br />{deployment.summary.receiptProgressPercent}% · {deployment.summary.failedCount} hallazgos</div><div><span className="text-gray-500">Recibido por</span><br />{deployment.receivedByName || '—'}<br />{dateLabel(deployment.receivedAt, true)}</div><div><span className="text-gray-500">Montaje</span><br />{deployment.assemblyExecution ? `${deployment.summary.installationProgressPercent}% · ${deployment.assemblyExecution.templateName}` : 'Sin programar'}</div></div>
    <div><div className="mb-2 text-sm font-medium">Checklist de recepción técnica</div><div className="space-y-1">{deployment.receiptChecks.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><div><strong>{item.name}</strong><div className="text-xs text-gray-500">{item.description}{item.evidenceRequired ? ' · Evidencia obligatoria' : ''}</div>{item.notes ? <div className="mt-1 text-xs text-red-700">{item.notes}</div> : null}</div><div className="flex items-center gap-2"><span className={`text-xs ${item.status === 'FAILED' ? 'text-red-700' : item.status === 'PASSED' ? 'text-emerald-700' : 'text-gray-500'}`}>{checkLabel(item.status)}</span>{canInspect ? <><button disabled={!!busy} className="rounded border px-2 py-1 text-xs" onClick={() => check(item, 'PASSED')}>Conforme</button><button disabled={!!busy} className="rounded border border-red-200 px-2 py-1 text-xs text-red-700" onClick={() => check(item, 'FAILED')}>Hallazgo</button></> : null}</div></div>)}</div></div>
    {canInspect && deployment.summary.pendingCount === 0 ? <div className="flex flex-wrap gap-2"><button disabled={!!busy || deployment.summary.failedCount > 0} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-40" onClick={() => receive('ACCEPTED')}>Aceptar recepción</button>{deployment.summary.failedCount > 0 ? <><button disabled={!!busy} className="rounded bg-amber-600 px-3 py-2 text-sm text-white" onClick={() => receive('ACCEPTED_WITH_OBSERVATIONS')}>Aceptar con observaciones</button><button disabled={!!busy} className="rounded bg-red-700 px-3 py-2 text-sm text-white" onClick={() => receive('BLOCKED')}>Bloquear recepción</button></> : null}</div> : null}
    {deployment.status === 'RECEIVED' && role === 'ADMIN' && !deployment.assemblyExecution ? <InstallationForm deployment={deployment} templates={templates} technicians={technicians} busy={busy} call={call} /> : null}
    {deployment.asset ? <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-cyan-200 bg-cyan-50 p-3 text-sm"><div><strong>Activo {deployment.asset.code}</strong> · {deployment.asset.name}<br /><span className="text-xs text-cyan-900">Estado: {deployment.asset.status}</span></div><Link href={`/assets/${deployment.asset.id}`} className="text-sm underline">Ver activo</Link></div> : null}
    {deployment.assemblyExecution ? <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-200 bg-indigo-50 p-3 text-sm"><div><strong>{deployment.assemblyExecution.workOrder.title}</strong><br /><span className="text-xs text-indigo-900">{deployment.summary.installationProgressPercent}% · {deployment.assemblyExecution.status}</span></div><Link href={`/assemblies/${deployment.assemblyExecution.id}`} className="rounded bg-indigo-800 px-3 py-2 text-white">Abrir Montajes</Link></div> : null}
    {deployment.status === 'READY_FOR_SAT' ? <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong>Instalación terminada.</strong> La unidad está habilitada para crear y ejecutar su protocolo SAT.</div> : null}
  </section>;
}

function InstallationForm({ deployment, templates, technicians, busy, call }: { deployment: ManufacturingSiteDeployment; templates: AssemblyTemplate[]; technicians: ManufacturingUser[]; busy: string; call: Function }) {
  const [assetCode, setAssetCode] = useState(deployment.manufacturedUnit.internalCode || deployment.manufacturedUnit.serialNumber || '');
  const [assetName, setAssetName] = useState(''); const [templateId, setTemplateId] = useState(''); const [scheduledStartAt, setScheduledStartAt] = useState(''); const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  function toggle(id: string) { setTechnicianIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function create() { if (!templateId || !scheduledStartAt) return; await call(`site-deployments/${deployment.id}/installation`, { lockVersion: deployment.lockVersion, assetCode, assetName: assetName || undefined, templateId, scheduledStartAt: new Date(scheduledStartAt).toISOString(), technicianIds }, 'POST', 'installation'); }
  return <div className="rounded border border-indigo-200 p-3 space-y-3"><div><div className="font-medium">Programar montaje en sitio</div><p className="text-xs text-gray-600">Se creará el activo en COMMISSIONING y una orden conectada con el módulo Montajes.</p></div><div className="grid gap-2 md:grid-cols-2"><input className="rounded border px-2 py-1.5 text-sm" placeholder="Código del activo" value={assetCode} onChange={(event) => setAssetCode(event.target.value)} /><input className="rounded border px-2 py-1.5 text-sm" placeholder="Nombre del activo (opcional)" value={assetName} onChange={(event) => setAssetName(event.target.value)} /><select className="rounded border px-2 py-1.5 text-sm" value={templateId} onChange={(event) => setTemplateId(event.target.value)}><option value="">Plantilla de montaje…</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select><input type="datetime-local" className="rounded border px-2 py-1.5 text-sm" value={scheduledStartAt} onChange={(event) => setScheduledStartAt(event.target.value)} /></div><div><div className="mb-1 text-xs font-medium">Técnicos</div><div className="flex flex-wrap gap-2">{technicians.map((user) => <label key={user.id} className="flex items-center gap-1 rounded border px-2 py-1 text-xs"><input type="checkbox" checked={technicianIds.includes(user.id)} onChange={() => toggle(user.id)} />{user.name}</label>)}</div></div><button disabled={!!busy || !templateId || !scheduledStartAt} className="rounded bg-indigo-800 px-3 py-2 text-sm text-white disabled:opacity-40" onClick={create}>{busy === 'installation' ? 'Creando…' : 'Crear activo y montaje'}</button></div>;
}

function statusLabel(status: ManufacturingSiteDeployment['status']) { return { PENDING_RECEPTION: 'Recepción pendiente', RECEPTION_IN_PROGRESS: 'Recepción en curso', RECEPTION_BLOCKED: 'Recepción bloqueada', RECEIVED: 'Recepción aceptada', INSTALLATION_PLANNED: 'Montaje programado', INSTALLING: 'En montaje', READY_FOR_SAT: 'Listo para SAT', SAT_IN_PROGRESS: 'SAT en ejecución', ACCEPTED: 'Puesta en servicio aceptada', ACCEPTED_WITH_PENDING_ITEMS: 'Aceptada con pendientes', CANCELED: 'Cancelado' }[status]; }
function statusClass(status: ManufacturingSiteDeployment['status']) { return status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' : status === 'ACCEPTED_WITH_PENDING_ITEMS' ? 'bg-amber-100 text-amber-900' : status === 'READY_FOR_SAT' ? 'bg-emerald-100 text-emerald-800' : status === 'RECEPTION_BLOCKED' ? 'bg-red-100 text-red-800' : status === 'INSTALLING' || status === 'SAT_IN_PROGRESS' ? 'bg-indigo-100 text-indigo-800' : status === 'RECEIVED' || status === 'INSTALLATION_PLANNED' ? 'bg-cyan-100 text-cyan-800' : 'bg-gray-100 text-gray-700'; }
function checkLabel(status: ManufacturingSiteDeployment['receiptChecks'][number]['status']) { return { PENDING: 'Pendiente', PASSED: 'Conforme', FAILED: 'Hallazgo', NOT_APPLICABLE: 'No aplica' }[status]; }
