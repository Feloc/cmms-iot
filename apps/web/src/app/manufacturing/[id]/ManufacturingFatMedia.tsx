'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { apiBase } from '@/lib/api';
import { dateLabel, type ManufacturingFatEvidence } from '@/lib/manufacturing';
import type { FatFindingCall } from './ManufacturingFatFindings';

export const FatMediaAuth = createContext<{ token?: string; tenantSlug?: string }>({});
const accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime';
const buttonClass = 'rounded border px-3 py-1.5 text-xs disabled:opacity-50';

export async function fatMediaResponse(response: Response) {
  if (response.ok) return;
  if (response.status === 401) window.dispatchEvent(new Event('cmms:unauthorized'));
  const body = await response.json().catch(() => null);
  throw new Error(Array.isArray(body?.message) ? body.message.join('\n') : body?.message || `No se pudo procesar el archivo (${response.status})`);
}

export function FatMediaUpload({ path, busy, call }: { path: string; busy: string; call: FatFindingCall }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(''); const [notes, setNotes] = useState('');
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const input = useRef<HTMLInputElement>(null);
  function select(next?: File) {
    setError(''); setSuccess(''); setFile(null);
    if (!next) return;
    if (!accept.split(',').includes(next.type)) { setError('Usa JPG, PNG, WebP, MP4, WebM o MOV. Otros formatos, como HEIC, deben convertirse primero.'); return; }
    const limit = next.type.startsWith('image/') ? 10 : 50;
    if (!next.size || next.size > limit * 1024 * 1024) { setError(`El archivo debe contener datos y no superar ${limit} MB.`); return; }
    setFile(next); if (!title) setTitle(next.name);
  }
  async function upload() {
    if (!file || !title.trim() || busy) return;
    const body = new FormData(); body.append('file', file); body.append('title', title.trim()); if (notes.trim()) body.append('notes', notes.trim());
    setError(''); setSuccess('');
    if (await call(`${path}/file`, body)) { setFile(null); setTitle(''); setNotes(''); if (input.current) input.current.value = ''; setSuccess('Archivo agregado a las evidencias.'); }
  }
  return <form className="space-y-2 rounded border border-dashed p-3" onSubmit={e => { e.preventDefault(); void upload(); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) { if (e.dataTransfer.files.length > 1) setError('Agrega un archivo a la vez.'); else select(e.dataTransfer.files[0]); } }}>
    <fieldset disabled={!!busy} className="space-y-2">
      <label className="block text-xs font-medium">Agregar imagen o video<input ref={input} type="file" accept={accept} className="mt-1 block w-full text-xs" onChange={e => select(e.target.files?.[0])} /></label>
      <p className="text-xs text-gray-500">Selecciona o arrastra un archivo. Imágenes hasta 10 MB; videos hasta 50 MB. Se conserva el original, sin compresión.</p>
      {file ? <div className="space-y-2"><p className="break-all text-xs">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p><label className="block text-xs">Título<input required maxLength={200} className="mt-1 block w-full rounded border p-2" value={title} onChange={e => setTitle(e.target.value)} /></label><label className="block text-xs">Descripción<textarea maxLength={10000} className="mt-1 block w-full rounded border p-2" value={notes} onChange={e => setNotes(e.target.value)} /></label><button disabled={!title.trim()} className={buttonClass}>{busy === `${path}/file` ? 'Subiendo…' : 'Subir evidencia'}</button></div> : null}
    </fieldset>
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}{success ? <p role="status" className="text-xs text-emerald-700">{success}</p> : null}
  </form>;
}

export function FatEvidenceList({ items }: { items: ManufacturingFatEvidence[] }) {
  return <div className="space-y-2">{items.length ? items.map(item => <Evidence key={item.id} item={item} />) : <p className="text-xs text-gray-500">Sin evidencias registradas.</p>}</div>;
}

function Evidence({ item }: { item: ManufacturingFatEvidence }) {
  const auth = useContext(FatMediaAuth);
  const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const resource = useRef(''); const request = useRef<AbortController | null>(null);
  useEffect(() => { setUrl(''); setError(''); setLoading(false); return () => { request.current?.abort(); if (resource.current) URL.revokeObjectURL(resource.current); resource.current = ''; }; }, [auth.token, auth.tenantSlug, item.id]);
  async function show() {
    if (loading || !auth.token || !auth.tenantSlug) return;
    setLoading(true); setError(''); const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch(`${apiBase}/manufacturing/fat-evidence/${item.id}/file`, { signal: controller.signal, headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug } });
      await fatMediaResponse(response); const blob = await response.blob();
      if (controller.signal.aborted) return;
      resource.current = URL.createObjectURL(blob); setUrl(resource.current);
    } catch (err: any) { if (!controller.signal.aborted) setError(err.message || 'No se pudo cargar el archivo'); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  return <div className="space-y-1 rounded border p-2 text-xs">
    <p><strong>{item.title}</strong>{item.reference ? ` · ${item.reference}` : ''}</p><p className="whitespace-pre-wrap">{item.notes}</p>
    <p className="text-gray-500">{item.createdByName} · {dateLabel(item.createdAt, true)}</p>
    {item.url && /^https?:\/\//i.test(item.url) ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block underline">Abrir enlace</a> : null}
    {item.hasFile ? <div className="space-y-2"><p className="break-all">{item.filename} · {((item.size || 0) / 1024 / 1024).toFixed(2)} MB</p>{!url ? <button type="button" disabled={loading} className={buttonClass} onClick={show}>{loading ? 'Cargando archivo…' : 'Ver imagen / video'}</button> : <>
      {item.mimeType?.startsWith('image/') ? <img src={url} alt={item.title} className="max-h-64 max-w-full rounded object-contain" /> : <video src={url} controls preload="metadata" playsInline className="max-h-80 max-w-full rounded" onError={() => setError('El navegador no reproduce este formato o códec. Puedes descargar el original.')} />}
      <a href={url} download={item.filename || 'evidencia'} className="inline-block underline">Descargar original</a><p className="text-gray-500">La reproducción de videos depende de los códecs admitidos por tu navegador.</p>
    </>}{error ? <p role="alert" className="text-red-700">{error}</p> : null}</div> : null}
  </div>;
}
