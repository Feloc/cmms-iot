'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ApprovalException } from '../../../manufacturing/ApprovalException';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

const blankRecipe = () => ({ name: '', specification: '', drawingRevision: '', critical: false, stableDesign: true, requiresSerial: false, inspectionMode: 'LOT', currency: 'COP', hourlyRate: 0,
  materials: [{ inventoryItemId: '', quantity: 1 }],
  operations: [{ name: '', instructions: '', estimatedMinutes: 0, evidenceRequired: false }],
  checks: [{ name: '', criteria: '', type: 'PASS_FAIL', min: null as number | null, max: null as number | null, evidenceRequired: false }],
});
const inputClass = 'border rounded px-3 py-2 w-full bg-white text-sm';

export default function QuickProfilePage() {
  const [approvalExceptionReason, setApprovalExceptionReason] = useState('');
  const id = String(useParams()?.id || '');
  const { data: session } = useSession(); const auth = getAuthFromSession(session);
  const isAdmin = (session as any)?.user?.role === 'ADMIN';
  const { data: inventory } = useApiSWR<any[]>('/inventory', auth.token, auth.tenantSlug);
  const { data: profiles, error, mutate } = useApiSWR<any[]>(id ? `/manufacturing/quick-profiles/items/${id}` : null, auth.token, auth.tenantSlug);
  const [recipe, setRecipe] = useState(blankRecipe); const [validUntil, setValidUntil] = useState('');
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const item = inventory?.find(i => i.id === id);
  function change(section: 'materials' | 'operations' | 'checks', index: number, key: string, value: any) {
    setRecipe(current => ({ ...current, [section]: current[section].map((row, i) => i === index ? { ...row, [key]: value } : row) }));
  }
  function remove(section: 'materials' | 'operations' | 'checks', index: number) { setRecipe(current => ({ ...current, [section]: current[section].filter((_, i) => i !== index) })); }
  async function command(path: string, body?: any) {
    setBusy(true); setMessage('');
    try { await apiFetch(path, { method: 'POST', token: auth.token!, tenantSlug: auth.tenantSlug!, body }); await mutate(); setEditing(false); setMessage('Perfil actualizado. Las OF existentes conservan su revisión original.'); }
    catch (e: any) { setMessage(e.message || 'No se pudo guardar'); } finally { setBusy(false); }
  }
  if (!auth.token) return <div className="p-6">Inicia sesión.</div>;
  return <main className="p-6 max-w-5xl mx-auto space-y-5">
    <Link href="/inventory" className="underline text-sm">← Inventario</Link>
    <h1 className="text-2xl font-semibold">Perfil de fabricación abreviada</h1>
    <p>{item ? `${item.sku} — ${item.name}` : 'Artículo de inventario'}</p>
    <p className="text-sm text-gray-600">Receta para piezas repetitivas, de diseño estable y criticidad baja o media. Cada revisión aprobada fija materiales, operaciones y controles de calidad.</p>
    {error ? <p role="alert" className="text-red-700">No se pudo cargar el perfil.</p> : null}
    {message ? <p role="status" className="border rounded p-3">{message}</p> : null}
    {isAdmin ? <ApprovalException value={approvalExceptionReason} onChange={setApprovalExceptionReason} /> : null}
    {isAdmin && !editing ? <button className="bg-violet-700 text-white rounded px-4 py-2" onClick={() => { setRecipe(profiles?.[0]?.recipe || blankRecipe()); setValidUntil(''); setEditing(true); }}>Nueva revisión del perfil</button> : null}
    {editing ? <form className="border rounded-lg p-4 space-y-5" onSubmit={e => { e.preventDefault(); command(`/manufacturing/quick-profiles/items/${id}`, { recipe, validUntil: validUntil ? `${validUntil}T23:59:59-05:00` : null }); }}>
      <div className="grid md:grid-cols-2 gap-3">
        <label>Nombre de receta<input required className={inputClass} value={recipe.name} onChange={e => setRecipe({ ...recipe, name: e.target.value })} /></label>
        <label>Plano o instrucción (referencia)<input required className={inputClass} value={recipe.specification} onChange={e => setRecipe({ ...recipe, specification: e.target.value })} /></label>
        <label>Revisión del plano<input required className={inputClass} value={recipe.drawingRevision} onChange={e => setRecipe({ ...recipe, drawingRevision: e.target.value })} /></label>
        <label>Vigente hasta (opcional)<input type="date" className={inputClass} value={validUntil} onChange={e => setValidUntil(e.target.value)} /></label>
        <label>Moneda<input required minLength={3} maxLength={3} className={inputClass} value={recipe.currency} onChange={e => setRecipe({ ...recipe, currency: e.target.value.toUpperCase() })} /></label>
        <label>Costo de mano de obra por hora<input type="number" min={0} step="any" required className={inputClass} value={recipe.hourlyRate} onChange={e => setRecipe({ ...recipe, hourlyRate: Number(e.target.value) })} /></label>
        <label>Inspección<select className={inputClass} value={recipe.inspectionMode} onChange={e => setRecipe({ ...recipe, inspectionMode: e.target.value })}><option value="LOT">Por lote</option><option value="UNIT">Por unidad</option></select></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={recipe.requiresSerial} onChange={e => setRecipe({ ...recipe, requiresSerial: e.target.checked, inspectionMode: e.target.checked ? 'UNIT' : recipe.inspectionMode })} />Requiere serial individual</label>
      </div>
      <fieldset className="space-y-3"><legend className="font-semibold">Materiales por pieza</legend>{recipe.materials.map((m, i) => <div key={i} className="grid md:grid-cols-[1fr_140px_auto] gap-2"><select aria-label={`Material ${i + 1}`} required className={inputClass} value={m.inventoryItemId} onChange={e => change('materials', i, 'inventoryItemId', e.target.value)}><option value="">Selecciona material</option>{inventory?.filter(x => x.id !== id && x.status === 'ACTIVE').map(x => <option key={x.id} value={x.id}>{x.sku} — {x.name} ({x.uom || 'UND'})</option>)}</select><input aria-label="Cantidad por pieza" required type="number" min="0.000001" step="any" className={inputClass} value={m.quantity} onChange={e => change('materials', i, 'quantity', Number(e.target.value))} /><button type="button" onClick={() => remove('materials', i)}>Quitar</button></div>)}<button type="button" className="underline" onClick={() => setRecipe({ ...recipe, materials: [...recipe.materials, { inventoryItemId: '', quantity: 1 }] })}>Agregar material</button></fieldset>
      <fieldset className="space-y-3"><legend className="font-semibold">Operaciones del lote, en orden</legend>{recipe.operations.map((o, i) => <div key={i} className="border rounded p-3 grid md:grid-cols-2 gap-2"><label>Operación {i + 1}<input required className={inputClass} value={o.name} onChange={e => change('operations', i, 'name', e.target.value)} /></label><label>Minutos estimados<input required type="number" min={0} className={inputClass} value={o.estimatedMinutes} onChange={e => change('operations', i, 'estimatedMinutes', Number(e.target.value))} /></label><label>Instrucciones<textarea className={inputClass} value={o.instructions} onChange={e => change('operations', i, 'instructions', e.target.value)} /></label><label><input type="checkbox" checked={o.evidenceRequired} onChange={e => change('operations', i, 'evidenceRequired', e.target.checked)} /> Exige evidencia</label><button type="button" className="text-left underline" onClick={() => remove('operations', i)}>Quitar operación</button></div>)}<button type="button" className="underline" onClick={() => setRecipe({ ...recipe, operations: [...recipe.operations, { name: '', instructions: '', estimatedMinutes: 0, evidenceRequired: false }] })}>Agregar operación</button></fieldset>
      <fieldset className="space-y-3"><legend className="font-semibold">Control de calidad</legend>{recipe.checks.map((c, i) => <div key={i} className="border rounded p-3 grid md:grid-cols-2 gap-2"><label>Control<input required className={inputClass} value={c.name} onChange={e => change('checks', i, 'name', e.target.value)} /></label><label>Criterio de aceptación<input required className={inputClass} value={c.criteria} onChange={e => change('checks', i, 'criteria', e.target.value)} /></label><label>Tipo<select className={inputClass} value={c.type} onChange={e => change('checks', i, 'type', e.target.value)}><option value="PASS_FAIL">Conforme / No conforme</option><option value="NUMERIC">Medición numérica</option></select></label>{c.type === 'NUMERIC' ? <div className="flex gap-2"><label>Mínimo<input type="number" step="any" className={inputClass} value={c.min ?? ''} onChange={e => change('checks', i, 'min', e.target.value === '' ? null : Number(e.target.value))} /></label><label>Máximo<input type="number" step="any" className={inputClass} value={c.max ?? ''} onChange={e => change('checks', i, 'max', e.target.value === '' ? null : Number(e.target.value))} /></label></div> : null}<label><input type="checkbox" checked={c.evidenceRequired} onChange={e => change('checks', i, 'evidenceRequired', e.target.checked)} /> Exige evidencia</label><button type="button" className="text-left underline" onClick={() => remove('checks', i)}>Quitar control</button></div>)}<button type="button" className="underline" onClick={() => setRecipe({ ...recipe, checks: [...recipe.checks, { name: '', criteria: '', type: 'PASS_FAIL', min: null, max: null, evidenceRequired: false }] })}>Agregar control</button></fieldset>
      <label className="block"><input type="checkbox" required /> Confirmo que el diseño es estable y la pieza no es crítica.</label>
      <div className="flex gap-3"><button disabled={busy} className="rounded bg-violet-700 text-white px-4 py-2">Guardar borrador</button><button type="button" onClick={() => setEditing(false)}>Cancelar</button></div>
    </form> : null}
    <div className="space-y-3">{profiles?.map(p => <article key={p.id} className="border rounded-lg p-4 space-y-2"><div className="font-semibold">Revisión {p.revision} · {p.recipe.name} · {({ DRAFT: 'Borrador', APPROVED: 'Aprobada', RETIRED: 'Retirada' } as any)[p.status]}</div><p className="text-sm">{p.recipe.specification} · Rev. {p.recipe.drawingRevision} · {p.recipe.materials.length} materiales · {p.recipe.operations.length} operaciones · {p.recipe.checks.length} controles</p><p className="text-xs">{p.validUntil ? `Vigencia: ${new Date(p.validUntil).toLocaleDateString()}` : 'Sin vencimiento'}{p.approvedAt ? ` · Aprobada: ${new Date(p.approvedAt).toLocaleString()}` : ''}</p><details><summary className="cursor-pointer">Consultar receta</summary><ul className="list-disc pl-5 text-sm">{p.recipe.materials.map((m: any, i: number) => <li key={`m${i}`}>{m.sku} — {m.name}: {m.quantity} {m.uom} por pieza</li>)}{p.recipe.operations.map((o: any, i: number) => <li key={`o${i}`}>{i + 1}. {o.name}: {o.instructions} ({o.estimatedMinutes} min)</li>)}{p.recipe.checks.map((c: any, i: number) => <li key={`c${i}`}>{c.name}: {c.criteria}{c.type === 'NUMERIC' ? ` (${c.min ?? 'sin mínimo'} a ${c.max ?? 'sin máximo'})` : ''}</li>)}</ul></details>{isAdmin ? <div className="flex gap-4">{p.status === 'DRAFT' ? <button disabled={busy} className="text-violet-700 underline" onClick={() => { if (window.confirm('¿Aprobar esta revisión para nuevas OF abreviadas?')) command(`/manufacturing/quick-profiles/${p.id}/approve`, { approvalExceptionReason: approvalExceptionReason || undefined }); }}>Aprobar revisión</button> : null}{p.status !== 'RETIRED' ? <button disabled={busy} className="underline" onClick={() => { if (window.confirm('¿Retirar esta revisión para que no se use en nuevas OF?')) command(`/manufacturing/quick-profiles/${p.id}/retire`); }}>Retirar revisión</button> : null}</div> : null}</article>)}</div>
  </main>;
}
