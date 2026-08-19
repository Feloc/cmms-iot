'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiBase, apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';
import {
  bomRevisionStatusClass,
  bomRevisionStatusLabel,
  criticalityLabel,
  supplyTypeLabel,
  type EngineeringDocument,
  type ManufacturingBom,
  type ManufacturingBomLine,
  type ManufacturingBomRevision,
  type ManufacturingOrder,
  type PartCriticality,
  type SupplyType,
} from '@/lib/manufacturing';

type Auth = { token?: string; tenantSlug?: string };
type InventoryItem = { id: string; sku: string; name: string; description?: string | null; uom: string; qty: number; preferredSupplier?: string | null; leadTimeDays?: number | null; criticality?: PartCriticality; status: string };
type DraftLine = Omit<ManufacturingBomLine, 'id' | 'level' | 'parentLineId' | 'parentLine'> & { key: string; parentPosition: number | null };
type ImportPreview = { uploadToken: string | null; sha256: string; expiresAt: string; totalRows: number; errors: number; warnings: number; sample: Array<Record<string, any>> };

export function ManufacturingBomTab({ order, role, currentUserId, auth, onChanged }: { order: ManufacturingOrder; role: string; currentUserId: string; auth: Auth; onChanged: () => Promise<unknown> | unknown }) {
  const { data, error, isLoading, mutate } = useApiSWR<ManufacturingBom[]>(`/manufacturing/orders/${order.id}/boms`, auth.token, auth.tenantSlug);
  const { data: inventory } = useApiSWR<InventoryItem[]>('/inventory', auth.token, auth.tenantSlug);
  const { data: documents } = useApiSWR<EngineeringDocument[]>(`/manufacturing/orders/${order.id}/documents`, auth.token, auth.tenantSlug);
  const memberFunctions = new Set((order.members || []).filter((item) => item.userId === currentUserId).map((item) => item.function));
  const canEngineer = role === 'ADMIN' || memberFunctions.has('ENGINEERING');
  const canReview = role === 'ADMIN' || memberFunctions.has('REVIEWER');
  const mutable = order.status !== 'ON_HOLD' && order.status !== 'CANCELED';
  const [selectedRevisionId, setSelectedRevisionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const boms = data || [];

  useEffect(() => {
    if (!selectedRevisionId && boms[0]?.latestRevision?.id) setSelectedRevisionId(boms[0].latestRevision.id);
    if (selectedRevisionId && !boms.some((bom) => bom.revisions.some((revision) => revision.id === selectedRevisionId))) setSelectedRevisionId(boms[0]?.latestRevision?.id || '');
  }, [boms, selectedRevisionId]);

  async function accept(next: ManufacturingBom[], selectId?: string) {
    setMessage(''); await mutate(next, { revalidate: false }); await onChanged();
    if (selectId) setSelectedRevisionId(selectId);
  }

  const selectedSummary = boms.flatMap((bom) => bom.revisions).find((revision) => revision.id === selectedRevisionId);
  const totalLines = boms.reduce((sum, bom) => sum + Number(bom.latestRevision?.lineCount || 0), 0);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Lista de materiales (BOM)</h2><p className="text-sm text-gray-600">Componentes por máquina, estrategia de suministro y referencias de Ingeniería.</p></div>
      {canEngineer && mutable ? <button className="rounded bg-black px-4 py-2 text-sm text-white" onClick={() => setCreating((value) => !value)}>{creating ? 'Cerrar' : 'Nueva BOM'}</button> : null}
    </div>
    {!mutable ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La BOM queda en consulta mientras la orden esté {order.status === 'ON_HOLD' ? 'en pausa' : 'cancelada'}.</div> : null}
    {message ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">{message}</div> : null}
    {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">No se pudieron cargar las listas de materiales.</div> : null}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Metric label="BOM registradas" value={boms.length} />
      <Metric label="Líneas vigentes" value={totalLines} />
      <Metric label="BOM aprobadas" value={boms.filter((bom) => bom.approvedRevision).length} tone="green" />
      <Metric label="Cantidad de máquinas" value={order.quantity} tone="sky" />
    </div>

    {creating ? <CreateBom orderId={order.id} auth={auth} onCreated={async (next) => { const id = next[0]?.latestRevision?.id; await accept(next, id); setCreating(false); }} onError={setMessage} /> : null}
    {isLoading ? <div className="py-8 text-center text-sm text-gray-500">Cargando BOM…</div> : null}
    {!isLoading && !boms.length ? <div className="rounded-lg border border-dashed p-10 text-center"><div className="font-medium">Aún no existe una lista de materiales</div><p className="mt-1 text-sm text-gray-600">Crea la BOM principal para comenzar a vincular componentes.</p></div> : null}

    {boms.length ? <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-3">
        {boms.map((bom) => <BomNavigator key={bom.id} bom={bom} selectedRevisionId={selectedRevisionId} canEngineer={canEngineer && mutable} auth={auth} onSelect={setSelectedRevisionId} onChanged={accept} onError={setMessage} />)}
      </aside>
      <section className="min-w-0">
        {selectedSummary ? <BomRevisionEditor
          key={selectedSummary.id}
          summary={selectedSummary}
          order={order}
          auth={auth}
          inventory={inventory || []}
          documents={documents || []}
          canEngineer={canEngineer && mutable}
          canReview={canReview && mutable}
          isAdmin={role === 'ADMIN'}
          currentUserId={currentUserId}
          onStatusChanged={accept}
          refreshSummary={async () => { await mutate(); await onChanged(); }}
          onError={setMessage}
        /> : <div className="rounded border p-10 text-center text-sm text-gray-500">Selecciona una revisión.</div>}
      </section>
    </div> : null}
  </div>;
}

function CreateBom({ orderId, auth, onCreated, onError }: { orderId: string; auth: Auth; onCreated: (items: ManufacturingBom[]) => void | Promise<void>; onError: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: 'BOM-PRINCIPAL', name: 'BOM principal', description: '', revisionCode: '00', changeSummary: 'Emisión inicial' });
  async function submit(event: React.FormEvent) { event.preventDefault(); if (!auth.token || !auth.tenantSlug) return; setBusy(true); onError(''); try { await onCreated(await apiFetch(`/manufacturing/orders/${orderId}/boms`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: form })); } catch (error: any) { onError(apiError(error, 'No se pudo crear la BOM')); } finally { setBusy(false); } }
  return <form onSubmit={submit} className="space-y-3 rounded-lg border bg-gray-50 p-4"><div className="font-medium">Crear BOM y revisión inicial</div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
    <Field label="Código *"><input required className="w-full rounded border px-3 py-2" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
    <Field label="Nombre *"><input required className="w-full rounded border px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
    <Field label="Revisión *"><input required className="w-full rounded border px-3 py-2" value={form.revisionCode} onChange={(e) => setForm({ ...form, revisionCode: e.target.value })} /></Field>
    <Field label="Motivo *"><input required className="w-full rounded border px-3 py-2" value={form.changeSummary} onChange={(e) => setForm({ ...form, changeSummary: e.target.value })} /></Field>
    <Field label="Descripción"><input className="w-full rounded border px-3 py-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
  </div><div className="flex justify-end"><button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white">{busy ? 'Creando…' : 'Crear BOM'}</button></div></form>;
}

function BomNavigator({ bom, selectedRevisionId, canEngineer, auth, onSelect, onChanged, onError }: { bom: ManufacturingBom; selectedRevisionId: string; canEngineer: boolean; auth: Auth; onSelect: (id: string) => void; onChanged: (items: ManufacturingBom[], selectId?: string) => void | Promise<void>; onError: (value: string) => void }) {
  const [newRevision, setNewRevision] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ revisionCode: '', changeSummary: '', copyFromRevisionId: bom.latestRevision?.id || '' });
  async function create(event: React.FormEvent) { event.preventDefault(); if (!auth.token || !auth.tenantSlug) return; setBusy(true); onError(''); try { const next = await apiFetch<ManufacturingBom[]>(`/manufacturing/boms/${bom.id}/revisions`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: form }); const created = next.find((item) => item.id === bom.id)?.latestRevision?.id; await onChanged(next, created); setNewRevision(false); } catch (error: any) { onError(apiError(error, 'No se pudo crear la revisión')); } finally { setBusy(false); } }
  return <div className="rounded-lg border p-3 space-y-2"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{bom.code}</div><div className="text-xs text-gray-500">{bom.name}</div></div>{canEngineer ? <button className="text-xs underline" onClick={() => setNewRevision((value) => !value)}>Nueva revisión</button> : null}</div>
    <div className="space-y-1">{bom.revisions.map((revision) => <button key={revision.id} className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${selectedRevisionId === revision.id ? 'bg-gray-900 text-white' : 'bg-gray-50 hover:bg-gray-100'}`} onClick={() => onSelect(revision.id)}><span>Rev. {revision.revisionCode}</span><span className="text-xs opacity-75">{revision.lineCount} líneas</span></button>)}</div>
    {newRevision ? <form onSubmit={create} className="space-y-2 border-t pt-2"><input required className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Código revisión" value={form.revisionCode} onChange={(e) => setForm({ ...form, revisionCode: e.target.value })} /><input required className="w-full rounded border px-2 py-1.5 text-sm" placeholder="Motivo del cambio" value={form.changeSummary} onChange={(e) => setForm({ ...form, changeSummary: e.target.value })} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!form.copyFromRevisionId} onChange={(e) => setForm({ ...form, copyFromRevisionId: e.target.checked ? bom.latestRevision?.id || '' : '' })} /> Copiar última revisión</label><button disabled={busy} className="w-full rounded bg-black px-3 py-1.5 text-sm text-white">{busy ? 'Creando…' : 'Crear'}</button></form> : null}
  </div>;
}

function BomRevisionEditor({ summary, order, auth, inventory, documents, canEngineer, canReview, isAdmin, currentUserId, onStatusChanged, refreshSummary, onError }: { summary: ManufacturingBomRevision; order: ManufacturingOrder; auth: Auth; inventory: InventoryItem[]; documents: EngineeringDocument[]; canEngineer: boolean; canReview: boolean; isAdmin: boolean; currentUserId: string; onStatusChanged: (items: ManufacturingBom[]) => void | Promise<void>; refreshSummary: () => void | Promise<void>; onError: (value: string) => void }) {
  const { data, error, isLoading, mutate } = useApiSWR<ManufacturingBomRevision>(`/manufacturing/bom-revisions/${summary.id}`, auth.token, auth.tenantSlug);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => { if (data) { setLines((data.lines || []).map(toDraft)); setDirty(false); } }, [data]);
  const editable = canEngineer && data?.status === 'DRAFT';
  const totals = useMemo(() => ({ perUnit: lines.reduce((sum, line) => sum + Number(line.quantityPerUnit || 0), 0), project: lines.reduce((sum, line) => sum + Number(line.quantityPerUnit || 0) * order.quantity, 0), linked: lines.filter((line) => line.inventoryItemId).length }), [lines, order.quantity]);

  function update(key: string, patch: Partial<DraftLine>) { setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line)); setDirty(true); }
  function chooseInventory(key: string, id: string) { const item = inventory.find((entry) => entry.id === id); update(key, { inventoryItemId: id || null, ...(item ? { itemCode: item.sku, description: item.name, uom: item.uom, preferredSupplier: item.preferredSupplier || null, leadTimeDays: item.leadTimeDays ?? null, criticality: item.criticality || 'MEDIUM' } : {}) }); }
  function addLine() { const position = Math.max(0, ...lines.map((line) => line.position)) + 1; setLines((current) => [...current, blankLine(position)]); setDirty(true); }
  function removeLine(key: string) { const removed = lines.find((line) => line.key === key); setLines((current) => current.filter((line) => line.key !== key).map((line) => line.parentPosition === removed?.position ? { ...line, parentPosition: null } : line)); setDirty(true); }

  async function save() { if (!auth.token || !auth.tenantSlug || !data) return; setBusy(true); onError(''); try { const next = await apiFetch<ManufacturingBomRevision>(`/manufacturing/bom-revisions/${data.id}/lines`, { method: 'PUT', token: auth.token, tenantSlug: auth.tenantSlug, body: { lines: lines.map(({ key, inventoryItem, ...line }) => line) } }); await mutate(next, { revalidate: false }); await refreshSummary(); setDirty(false); } catch (error: any) { onError(apiError(error, 'No se pudo guardar la BOM')); } finally { setBusy(false); } }
  async function action(name: 'submit' | 'approve' | 'reject') { if (!auth.token || !auth.tenantSlug || !data) return; let comment: string | null = null; if (name === 'reject') { comment = window.prompt('Motivo del rechazo:'); if (!comment?.trim()) return; } if (name === 'approve') comment = window.prompt('Comentario de aprobación (opcional):', '') || ''; setBusy(true); onError(''); try { await onStatusChanged(await apiFetch(`/manufacturing/bom-revisions/${data.id}/${name}`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: name === 'submit' ? undefined : { comment } })); await mutate(); } catch (error: any) { onError(apiError(error, 'No se pudo actualizar la revisión')); } finally { setBusy(false); } }

  if (isLoading || !data) return <div className="rounded border p-8 text-center text-sm text-gray-500">{error ? 'No se pudo cargar la revisión.' : 'Cargando revisión…'}</div>;
  const canDecide = canReview && data.status === 'IN_REVIEW' && (isAdmin || data.createdByUserId !== currentUserId);
  return <div className="rounded-lg border bg-white">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4"><div><div className="flex items-center gap-2"><h3 className="font-semibold">{data.bom?.code} · Rev. {data.revisionCode}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${bomRevisionStatusClass[data.status]}`}>{bomRevisionStatusLabel[data.status]}</span></div><p className="mt-1 text-sm text-gray-600">{data.changeSummary}</p></div><div className="flex flex-wrap gap-2">{editable ? <><button className="rounded border px-3 py-1.5 text-sm" onClick={() => setImporting((value) => !value)}>Importar</button><button className="rounded border px-3 py-1.5 text-sm" onClick={addLine}>Agregar línea</button><button disabled={busy || !dirty} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-40" onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button><button disabled={busy || dirty || !lines.length} className="rounded border border-sky-200 px-3 py-1.5 text-sm text-sky-800 disabled:opacity-40" onClick={() => action('submit')}>Enviar a revisión</button></> : null}{canDecide ? <><button disabled={busy} className="rounded border border-emerald-200 px-3 py-1.5 text-sm text-emerald-800" onClick={() => action('approve')}>Aprobar</button><button disabled={busy} className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-700" onClick={() => action('reject')}>Rechazar</button></> : null}</div></div>
    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 md:grid-cols-4"><SmallMetric label="Líneas" value={lines.length} /><SmallMetric label="Vinculadas a inventario" value={`${totals.linked}/${lines.length}`} /><SmallMetric label="Cantidad acumulada/máquina" value={formatNumber(totals.perUnit)} /><SmallMetric label={`Cantidad para ${order.quantity} máquinas`} value={formatNumber(totals.project)} /></div>
    {data.reviewComment ? <div className="border-t bg-amber-50 px-4 py-3 text-sm"><span className="font-medium">Comentario de revisión:</span> {data.reviewComment}</div> : null}
    {importing && editable ? <BomImport revisionId={data.id} auth={auth} onCommitted={async (next) => { await mutate(next, { revalidate: false }); await refreshSummary(); setImporting(false); }} onError={onError} /> : null}
    {!lines.length ? <div className="p-10 text-center text-sm text-gray-500">Esta revisión no contiene líneas.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1180px] text-sm"><thead className="bg-gray-50 text-left"><tr><th className="px-2 py-2">Pos.</th><th className="px-2 py-2">Padre</th><th className="px-2 py-2">Artículo / descripción</th><th className="px-2 py-2">Inventario</th><th className="px-2 py-2">Cant./máquina</th><th className="px-2 py-2">Total OF</th><th className="px-2 py-2">Unidad</th><th className="px-2 py-2">Suministro</th><th className="px-2 py-2">Criticidad</th><th className="px-2 py-2"></th></tr></thead><tbody>{lines.map((line) => <BomLineRows key={line.key} line={line} allLines={lines} orderQuantity={order.quantity} editable={editable} inventory={inventory} documents={documents} update={update} chooseInventory={chooseInventory} remove={() => removeLine(line.key)} />)}</tbody></table></div>}
  </div>;
}

function BomLineRows({ line, allLines, orderQuantity, editable, inventory, documents, update, chooseInventory, remove }: { line: DraftLine; allLines: DraftLine[]; orderQuantity: number; editable: boolean; inventory: InventoryItem[]; documents: EngineeringDocument[]; update: (key: string, patch: Partial<DraftLine>) => void; chooseInventory: (key: string, id: string) => void; remove: () => void }) {
  const input = 'w-full rounded border px-2 py-1.5 disabled:border-transparent disabled:bg-transparent';
  const document = documents.find((item) => item.id === line.drawingDocumentId);
  return <><tr className="border-t align-top"><td className="px-2 py-2"><input disabled={!editable} type="number" min={1} className={`${input} w-16`} value={line.position} onChange={(e) => update(line.key, { position: Number(e.target.value) })} /></td><td className="px-2 py-2"><select disabled={!editable} className={`${input} w-24`} value={line.parentPosition ?? ''} onChange={(e) => update(line.key, { parentPosition: e.target.value ? Number(e.target.value) : null })}><option value="">Raíz</option>{allLines.filter((item) => item.position < line.position).map((item) => <option key={item.key} value={item.position}>{item.position}</option>)}</select></td><td className="px-2 py-2"><input disabled={!editable} className={input} placeholder="Código" value={line.itemCode} onChange={(e) => update(line.key, { itemCode: e.target.value })} /><input disabled={!editable} className={`${input} mt-1`} placeholder="Descripción" value={line.description} onChange={(e) => update(line.key, { description: e.target.value })} /></td><td className="px-2 py-2"><select disabled={!editable} className={`${input} max-w-52`} value={line.inventoryItemId || ''} onChange={(e) => chooseInventory(line.key, e.target.value)}><option value="">Sin vínculo</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>{line.inventoryItem ? <div className="mt-1 text-xs text-gray-500">Stock: {line.inventoryItem.qty}</div> : null}</td><td className="px-2 py-2"><input disabled={!editable} type="number" min="0.000001" step="any" className={`${input} w-28`} value={line.quantityPerUnit} onChange={(e) => update(line.key, { quantityPerUnit: Number(e.target.value) })} /></td><td className="px-2 py-3 font-medium">{formatNumber(Number(line.quantityPerUnit || 0) * orderQuantity)}</td><td className="px-2 py-2"><input disabled={!editable} className={`${input} w-20`} value={line.uom} onChange={(e) => update(line.key, { uom: e.target.value })} /></td><td className="px-2 py-2"><select disabled={!editable} className={input} value={line.supplyType} onChange={(e) => update(line.key, { supplyType: e.target.value as SupplyType })}>{Object.entries(supplyTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="px-2 py-2"><select disabled={!editable} className={input} value={line.criticality} onChange={(e) => update(line.key, { criticality: e.target.value as PartCriticality })}>{Object.entries(criticalityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="px-2 py-2">{editable ? <button className="text-red-700" onClick={remove}>Quitar</button> : null}</td></tr>
    <tr className="bg-gray-50/60"><td></td><td colSpan={9} className="px-2 pb-3"><div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6"><Field label="Plano"><select disabled={!editable} className={input} value={line.drawingDocumentId || ''} onChange={(e) => update(line.key, { drawingDocumentId: e.target.value || null, drawingRevisionId: null })}><option value="">Sin plano</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}</select></Field><Field label="Revisión plano"><select disabled={!editable || !document} className={input} value={line.drawingRevisionId || ''} onChange={(e) => update(line.key, { drawingRevisionId: e.target.value || null })}><option value="">Sin revisión</option>{document?.revisions.map((revision) => <option key={revision.id} value={revision.id}>{revision.revisionCode} · {revision.status}</option>)}</select></Field><Field label="Material / acabado"><input disabled={!editable} className={input} value={line.materialSpecification || ''} onChange={(e) => update(line.key, { materialSpecification: e.target.value })} /></Field><Field label="Fabricante / referencia"><div className="flex gap-1"><input disabled={!editable} className={input} value={line.manufacturer || ''} onChange={(e) => update(line.key, { manufacturer: e.target.value })} /><input disabled={!editable} className={input} value={line.manufacturerPartNo || ''} onChange={(e) => update(line.key, { manufacturerPartNo: e.target.value })} /></div></Field><Field label="Proveedor / plazo"><div className="flex gap-1"><input disabled={!editable} className={input} value={line.preferredSupplier || ''} onChange={(e) => update(line.key, { preferredSupplier: e.target.value })} /><input disabled={!editable} type="number" min={0} className={`${input} w-20`} value={line.leadTimeDays ?? ''} onChange={(e) => update(line.key, { leadTimeDays: e.target.value ? Number(e.target.value) : null })} /></div></Field><Field label="Notas / opcional"><div className="flex gap-2"><input disabled={!editable} className={input} value={line.notes || ''} onChange={(e) => update(line.key, { notes: e.target.value })} /><label className="flex items-center gap-1 whitespace-nowrap text-xs"><input disabled={!editable} type="checkbox" checked={line.isOptional} onChange={(e) => update(line.key, { isOptional: e.target.checked })} /> Opc.</label></div></Field></div></td></tr></>;
}

function BomImport({ revisionId, auth, onCommitted, onError }: { revisionId: string; auth: Auth; onCommitted: (revision: ManufacturingBomRevision) => void | Promise<void>; onError: (value: string) => void }) {
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<ImportPreview | null>(null); const [busy, setBusy] = useState(false);
  async function previewFile() { if (!file || !auth.token || !auth.tenantSlug) return; setBusy(true); onError(''); const form = new FormData(); form.append('file', file); try { const response = await fetch(`${apiBase}/manufacturing/bom-revisions/${revisionId}/import/preview`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug }, body: form }); if (!response.ok) throw new Error(await response.text()); setPreview(await response.json()); } catch (error: any) { onError(apiError(error, 'No se pudo previsualizar el archivo')); } finally { setBusy(false); } }
  async function commit() { if (!preview?.uploadToken || !auth.token || !auth.tenantSlug) return; setBusy(true); onError(''); try { await onCommitted(await apiFetch(`/manufacturing/bom-revisions/${revisionId}/import/commit`, { method: 'POST', token: auth.token, tenantSlug: auth.tenantSlug, body: { uploadToken: preview.uploadToken } })); } catch (error: any) { onError(apiError(error, 'No se pudo confirmar la importación')); } finally { setBusy(false); } }
  return <div className="space-y-3 border-b bg-sky-50/50 p-4"><div className="flex flex-wrap items-end gap-3"><Field label="Archivo CSV/XLS/XLSX"><input type="file" accept=".csv,.xls,.xlsx" className="rounded border bg-white px-3 py-1.5 text-sm" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} /></Field><button disabled={!file || busy} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={previewFile}>{busy ? 'Procesando…' : 'Previsualizar'}</button>{preview?.uploadToken ? <button disabled={busy} className="rounded bg-black px-3 py-2 text-sm text-white" onClick={commit}>Confirmar {preview.totalRows} líneas</button> : null}</div><p className="text-xs text-gray-600">Columnas: position, parent_position, item_code, description, quantity_per_unit, uom, supply_type, inventory_sku, is_optional, criticality, drawing_code, drawing_revision y datos de proveedor.</p>{preview ? <div className={`rounded border p-3 text-sm ${preview.errors ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}><strong>{preview.totalRows} filas</strong> · {preview.errors} con errores · {preview.warnings} con advertencias · SHA-256 {preview.sha256.slice(0, 12)}…{preview.errors ? <div className="mt-2 max-h-32 overflow-auto text-xs text-red-700">{preview.sample.filter((row) => row._errors?.length).map((row) => <div key={row._row}>Fila {row._row}: {row._errors.join('; ')}</div>)}</div> : null}</div> : null}</div>;
}

function toDraft(line: ManufacturingBomLine): DraftLine { const { id, level, parentLineId, parentLine, ...rest } = line; return { ...rest, key: id, parentPosition: parentLine?.position ?? null }; }
function blankLine(position: number): DraftLine { return { key: `new-${Date.now()}-${position}`, position, parentPosition: null, inventoryItemId: null, itemCode: '', description: '', quantityPerUnit: 1, uom: 'UND', supplyType: 'BUY', isOptional: false, criticality: 'MEDIUM', drawingDocumentId: null, drawingRevisionId: null, materialSpecification: null, manufacturer: null, manufacturerPartNo: null, preferredSupplier: null, leadTimeDays: null, notes: null }; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1 text-sm"><span className="text-gray-600">{label}</span>{children}</label>; }
function Metric({ label, value, tone = 'gray' }: { label: string; value: number; tone?: 'gray' | 'sky' | 'green' }) { const color = { gray: 'text-gray-900', sky: 'text-sky-700', green: 'text-emerald-700' }[tone]; return <div className="rounded-lg border p-3"><div className="text-xs text-gray-500">{label}</div><div className={`text-2xl font-semibold ${color}`}>{value}</div></div>; }
function SmallMetric({ label, value }: { label: string; value: string | number }) { return <div><div className="text-xs text-gray-500">{label}</div><div className="font-semibold">{value}</div></div>; }
function formatNumber(value: number) { return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 }).format(value); }
function apiError(error: any, fallback: string) { const message = String(error?.message || ''); try { const start = message.indexOf('{'); if (start >= 0) { const parsed = JSON.parse(message.slice(start)); return Array.isArray(parsed.message) ? parsed.message.join('\n') : parsed.message || fallback; } } catch {} return message || fallback; }
