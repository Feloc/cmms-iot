'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { ToolAuth, toolError, toolInput } from '@/lib/tools';
type Preview = { count: number; rows: { code: string; name: string; tracking: string; quantity: number; location: string }[] };
export default function ToolImport({ auth, onClose, onSaved }: { auth: ToolAuth; onClose: () => void; onSaved: (count: number) => void }) {
  const [csv, setCsv] = useState(''), [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function load(file?: File) {
    setCsv(''); setPreview(null); setError('');
    if (!file) return;
    if (file.size > 1000000) { setError('El archivo debe pesar máximo 1 MB.'); return; }
    setBusy(true);
    try { const text = await file.text(); setCsv(text); setPreview(await apiFetch<Preview>('/tools/import/preview', { ...auth, method: 'POST', body: { csv: text } })); }
    catch (e) { setError(toolError(e)); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setError('');
    try { const result = await apiFetch<{ count: number }>('/tools/import/commit', { ...auth, method: 'POST', body: { csv } }); onSaved(result.count); }
    catch (e) { setPreview(null); setError(toolError(e)); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Cargar herramientas</DialogTitle><DialogDescription>Archivo CSV de hasta 200 registros. Se revisa el archivo completo antes de guardar.</DialogDescription></DialogHeader>
    <p className="text-sm">Descarga la <a href="/templates/template-tools.csv" download className="text-emerald-700 underline">plantilla CSV</a>. Usa INDIVIDUAL o CANTIDAD en control y fechas AAAA-MM-DD. Los códigos deben ser nuevos. La condición inicial será buena.</p>
    <label className="grid gap-1 text-sm">Archivo CSV<input type="file" accept=".csv,text/csv" disabled={busy} className={toolInput} onChange={e => void load(e.target.files?.[0])} /></label>
    {busy && <p role="status">Procesando archivo…</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {preview && <><p className="text-sm font-medium">{preview.count} registros listos para cargar</p><div className="max-h-72 overflow-auto border rounded"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-gray-50"><tr>{['Código', 'Nombre', 'Control', 'Cantidad', 'Ubicación'].map(v => <th key={v} className="p-2">{v}</th>)}</tr></thead><tbody>{preview.rows.map(r => <tr key={r.code} className="border-t"><td className="p-2">{r.code}</td><td className="p-2">{r.name}</td><td className="p-2">{r.tracking === 'UNIT' ? 'Individual' : 'Cantidad'}</td><td className="p-2">{r.quantity}</td><td className="p-2">{r.location}</td></tr>)}</tbody></table></div></>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>Cerrar</Button><Button disabled={busy || !preview} onClick={commit}>Importar {preview?.count || ''} herramientas</Button></div>
  </DialogContent></Dialog>;
}
