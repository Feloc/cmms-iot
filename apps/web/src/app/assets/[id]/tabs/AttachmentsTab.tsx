'use client';

import React from 'react';
import { useAssetsDetail } from '../assets-detail.context';

export default function AttachmentsTab() {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const tenantSlug = (headers['x-tenant'] as string | undefined) || (headers['x-tenant-id'] as string | undefined);
  const [items, setItems] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [kind, setKind] = React.useState<'image'|'video'|'audio'|'doc'|'other'>('image');
  const [uploading, setUploading] = React.useState(false);

  const listUrl = `${apiBase}/attachments?entityType=asset&entityId=${encodeURIComponent(assetId)}`;

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(listUrl, { headers, credentials: 'include' });
      const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      const arr = Array.isArray(json) ? json : Array.isArray(json.items) ? json.items : [];
      setItems(arr);
    } catch (e: any) {
      setError(e?.message || 'Error cargando adjuntos'); setItems([]);
    } finally { setLoading(false); }
  }, [listUrl, headers]);

  React.useEffect(() => { load(); }, [load]);

  async function onUpload() {
    if (!file) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entityType', 'asset');
      fd.append('entityId', assetId);
      // compat: si backend usa type (enum) en vez de kind, puedes enviar ambos
      fd.append('kind', kind);
      const res = await fetch(`${apiBase}/attachments`, { method: 'POST', body: fd, headers, credentials: 'include' });
      const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      setFile(null); await load();
    } catch (e: any) { setError(e?.message || 'No fue posible subir'); } finally { setUploading(false); }
  }

  async function onDelete(id: string) {
    if (!confirm('¿Eliminar adjunto?')) return;
    try {
      const res = await fetch(`${apiBase}/attachments/${encodeURIComponent(id)}`, { method: 'DELETE', headers, credentials: 'include' });
      if (!res.ok) {
        const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
        throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      }
      await load();
    } catch (e: any) { setError(e?.message || 'No fue posible eliminar'); }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={uploading} />
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="border rounded px-2 py-1">
          <option value="image">Imagen</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="doc">Documento</option>
          <option value="other">Otro</option>
        </select>
        <button onClick={onUpload} disabled={!file || uploading} className={`px-4 py-2 rounded text-white ${!file || uploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{uploading ? 'Subiendo…' : 'Subir'}</button>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded border hover:bg-gray-100">Refrescar</button>
      </div>
      {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left">Archivo</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Tamaño</th>
              <th className="px-3 py-2 text-left">Creado</th>
              <th className="px-3 py-2 text-left">Acciones</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin adjuntos.</td></tr>
              ) : items.map((a) => {
                const isImg = a.mimeType?.startsWith('image/');
                const isVideo = a.mimeType?.startsWith('video/');
                const isAudio = a.mimeType?.startsWith('audio/');
                const sizeStr = a.size ? `${(a.size/1024).toFixed(1)} KB` : '—';
                const hrefView = `${apiBase}/attachments/${encodeURIComponent(a.id)}/view${tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''}`;
                const hrefDownload = `${apiBase}/attachments/${encodeURIComponent(a.id)}/download${tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''}`;
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-t">
                      {isImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a className="text-blue-700 underline inline-flex items-center gap-2" href={hrefView} target="_blank" rel="noreferrer">
                          <img src={hrefView} alt={a.filename} className="w-10 h-10 object-cover rounded border" />
                          <span>{a.filename}</span>
                        </a>
                      ) : (
                        <a className="text-blue-700 underline" href={hrefView} target="_blank" rel="noreferrer">{a.filename}</a>
                      )}
                    </td>
                    <td className="px-3 py-2 border-t">{a.mimeType || a.type || '—'}</td>
                    <td className="px-3 py-2 border-t">{sizeStr}</td>
                    <td className="px-3 py-2 border-t">{a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}</td>
                    <td className="px-3 py-2 border-t">
                      <div className="flex gap-2">
                        <a className="px-2 py-1 rounded border hover:bg-gray-100" href={hrefView} target="_blank" rel="noreferrer">Ver</a>
                        <a className="px-2 py-1 rounded border hover:bg-gray-100" href={hrefDownload}>Descargar</a>
                        <button className="px-2 py-1 rounded border hover:bg-gray-100" onClick={() => onDelete(a.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
