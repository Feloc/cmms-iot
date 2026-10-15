'use client';

import { useState } from 'react';
import { apiBase, apiFetch } from '@/lib/api';

type Auth = { token?: string; tenantSlug?: string };
type ImportedCase = { position: number; section: string | null; name: string; instructions: string | null; acceptanceCriteria: string; resultType: 'BOOLEAN' | 'NUMERIC' | 'TEXT'; minimumValue: number | null; maximumValue: number | null; unit: string | null; required: boolean; evidenceRequired: boolean; subpoints?: Array<Omit<ImportedCase, 'position' | 'section' | 'subpoints'>> };
type Preview = { sheetName: string; totalRows: number; rootCount: number; subpointCount: number; errorRows: number; warnings: string[]; cases: ImportedCase[]; rows: Array<{ row: number; parentPosition: number | null; data: ImportedCase; errors: string[] }> };

export function ManufacturingFatImport({ auth, onCreated }: { auth: Auth; onCreated: () => void | Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [exampleLayout, setExampleLayout] = useState('hierarchical');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [success, setSuccess] = useState('');
  const headers = { Authorization: `Bearer ${auth.token}`, ...(auth.tenantSlug ? { 'x-tenant': auth.tenantSlug } : {}) };
  const orderedRows = !preview || preview.errorRows ? preview?.rows || [] : preview.rows.filter(r => r.parentPosition === null).sort((a, b) => a.data.position - b.data.position).flatMap(parent => [parent, ...preview.rows.filter(r => r.parentPosition === parent.data.position).sort((a, b) => a.data.position - b.data.position)]);
  async function responseError(response: Response) {
    if (response.status === 401) window.dispatchEvent(new Event('cmms:unauthorized'));
    const body = await response.json().catch(() => null);
    throw new Error(Array.isArray(body?.message) ? body.message.join('\n') : body?.message || `No se pudo procesar la solicitud (${response.status})`);
  }
  async function example(format: 'xlsx' | 'csv') {
    setMessage(''); setBusy(true);
    try {
      const response = await fetch(`${apiBase}/manufacturing/fat-templates/import/example?format=${format}&layout=${exampleLayout}`, { headers });
      if (!response.ok) await responseError(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = `protocolo-fat-${exampleLayout}.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function inspect() {
    if (!file) return;
    setPreview(null); setMessage(''); setSuccess(''); setBusy(true);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('El archivo supera 2 MB');
      const body = new FormData(); body.append('file', file);
      const response = await fetch(`${apiBase}/manufacturing/fat-templates/import/preview`, { method: 'POST', headers, body });
      if (!response.ok) await responseError(response);
      setPreview(await response.json());
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  async function save() {
    if (!preview || preview.errorRows || !preview.cases.length || !auth.token) return;
    setBusy(true); setMessage(''); setSuccess('');
    try {
      const created = await apiFetch<{ code: string; version: number }>('/manufacturing/fat-templates', { method: 'POST', ...auth, body: { code, name, description: description || null, cases: preview.cases } });
      setPreview(null); setFile(null); setInputKey(k => k + 1); setCode(''); setName(''); setDescription('');
      setSuccess(`Protocolo ${created.code} v${created.version} creado. Ya puedes seleccionarlo al crear una ejecución FAT.`);
      await onCreated();
    } catch (error: any) {
      const raw = String(error.message || 'No se pudo guardar el protocolo');
      try { const body = JSON.parse(raw.slice(raw.indexOf('{'))); setMessage(Array.isArray(body.message) ? body.message.join('\n') : body.message || raw); } catch { setMessage(raw); }
    } finally { setBusy(false); }
  }
  return <section className="rounded-lg border bg-gray-50">
    <button type="button" aria-expanded={open} className="flex w-full justify-between p-3 text-left text-sm font-medium" onClick={() => setOpen(value => !value)}>Importar protocolo FAT desde Excel / CSV <span>{open ? '▲' : '▼'}</span></button>
    {success ? <p role="status" className="p-3 text-sm text-emerald-800">{success}</p> : null}
    {open ? <div className="space-y-3 border-t p-3">
      <p className="text-sm text-gray-600">Carga puntos y subpuntos desde la primera hoja de Excel (.xlsx o .xls) o un CSV UTF-8. Máximo 2 MB y 500 filas en total; hasta 50 subpuntos por punto. No modifica ejecuciones existentes; un código repetido crea una nueva versión del protocolo.</p>
      <p className="text-sm text-gray-600">Para importar jerarquía, asigna una <strong>posicion</strong> entera única a cada fila y usa <strong>punto_padre</strong> con la posición del punto principal. Déjala vacía en los puntos principales. Ejemplo: punto 20, subpuntos 21 y 22 con punto_padre 20. Solo se admite un nivel; los archivos planos anteriores siguen funcionando.</p>
      <label className="block text-sm">Plantilla de ejemplo<select disabled={busy} className="ml-2 rounded border px-2 py-1" value={exampleLayout} onChange={e => setExampleLayout(e.target.value)}><option value="hierarchical">Puntos y subpuntos</option><option value="flat">Solo puntos (formato anterior)</option></select></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={() => example('xlsx')}>Descargar ejemplo Excel</button><button type="button" disabled={busy} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={() => example('csv')}>Descargar ejemplo CSV</button></div>
      <div className="grid gap-2 md:grid-cols-2"><label className="text-sm">Código del protocolo<input disabled={busy} className="mt-1 block w-full rounded border px-3 py-2" value={code} onChange={e => setCode(e.target.value)} placeholder="FAT-MAQ" /></label><label className="text-sm">Nombre del protocolo<input disabled={busy} className="mt-1 block w-full rounded border px-3 py-2" value={name} onChange={e => setName(e.target.value)} /></label></div>
      <label className="block text-sm">Descripción (opcional)<textarea disabled={busy} className="mt-1 w-full rounded border px-3 py-2" value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="flex flex-wrap items-end gap-2"><label className="text-sm">Archivo<input key={inputKey} disabled={busy} type="file" accept=".xlsx,.xls,.csv" className="mt-1 block text-sm" onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setMessage(''); setSuccess(''); }} /></label><button type="button" disabled={busy || !file} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50" onClick={inspect}>{busy ? 'Procesando…' : 'Validar y previsualizar'}</button></div>
      {message ? <p role="alert" className="whitespace-pre-wrap rounded bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}
      {preview ? <div className="space-y-3">
        <p className="text-sm">Hoja: {preview.sheetName} · {preview.rootCount} puntos principales · {preview.subpointCount} subpuntos · {preview.totalRows} filas · {preview.errorRows} filas con errores.</p>
        {preview.warnings.map(warning => <p key={warning} className="text-sm text-amber-800">{warning}</p>)}
        {preview.errorRows ? <p role="alert" className="text-sm text-red-700">Corrige las filas indicadas en el archivo y vuelve a cargarlo. No se guardarán casos parcialmente.</p> : null}
        <div className="max-h-96 overflow-auto rounded border bg-white"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-gray-100"><tr>{['Fila / posición', 'Jerarquía / sección / nombre', 'Instrucciones / criterio', 'Tipo / límites', 'Requisitos', 'Errores'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{orderedRows.map(({ row, parentPosition, data, errors }) => <tr key={row} className={`border-t ${errors.length ? 'bg-red-50' : parentPosition !== null ? 'bg-indigo-50/40' : ''}`}><td className="p-2">{row} / {data.position}</td><td className={`p-2 ${parentPosition !== null ? 'pl-6' : ''}`}><span className="text-gray-500">{parentPosition !== null ? `Subpunto de ${parentPosition}` : 'Punto principal'} · {data.section}</span><div className="font-medium">{parentPosition !== null ? '↳ ' : ''}{data.name}</div></td><td className="whitespace-pre-wrap p-2">{data.instructions}<div>{data.acceptanceCriteria}</div></td><td className="p-2">{data.resultType}{data.resultType === 'NUMERIC' ? <div>{data.minimumValue ?? '−∞'} a {data.maximumValue ?? '+∞'} {data.unit}</div> : null}</td><td className="p-2">Obligatorio: {data.required ? 'Sí' : 'No'}<br />Evidencia: {data.evidenceRequired ? 'Sí' : 'No'}</td><td className="p-2 text-red-700">{errors.join('; ')}</td></tr>)}</tbody></table></div>
        <button type="button" disabled={busy || !!preview.errorRows || !code.trim() || !name.trim()} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50" onClick={save}>Crear protocolo: {preview.rootCount} puntos y {preview.subpointCount} subpuntos</button>
      </div> : null}
    </div> : null}
  </section>;
}
