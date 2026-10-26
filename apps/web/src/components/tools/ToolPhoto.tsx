'use client';
import { useEffect, useState } from 'react';
import { apiBase } from '@/lib/api';
import { ToolAuth, ToolDetail, toolError, toolInput } from '@/lib/tools';
export default function ToolPhoto({ tool, auth, onSaved }: { tool: ToolDetail; auth: ToolAuth; onSaved: (tool: ToolDetail) => void }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true, objectUrl = ''; setUrl(''); setError('');
    if (tool.photo) void fetch(`${apiBase}/tools/${tool.id}/photo`, { headers: { Authorization: `Bearer ${auth.token}` }, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('No se pudo cargar la fotografía'); return response.blob(); })
      .then(blob => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } }).catch(e => { if (alive) setError(toolError(e)); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [tool.id, tool.photo?.updatedAt, auth.token]);
  async function upload(file?: File) {
    if (!file) return; setError('');
    if (file.size > 5 * 1024 * 1024) { setError('La imagen debe pesar máximo 5 MB.'); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', file); body.append('version', String(tool.version));
      const response = await fetch(`${apiBase}/tools/${tool.id}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${auth.token}` }, body });
      if (!response.ok) throw new Error(await response.text());
      onSaved(await response.json());
    } catch (e) { setError(toolError(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Fotografía</h2>{url ? <img src={url} alt={tool.name} className="max-h-64 w-full rounded object-contain" /> : <p className="py-6 text-center text-sm text-gray-500">{tool.photo ? 'Cargando fotografía…' : 'Sin fotografía'}</p>}{tool.permissions.manage && <label className="grid gap-1 text-sm">{busy ? 'Guardando…' : 'Cargar fotografía (PNG, JPEG o WebP, máximo 5 MB)'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} className={toolInput} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
