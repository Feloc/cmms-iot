'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Attachment = { id: string; kind: 'PHOTO'|'VIDEO'|'AUDIO'|'DOC'; url: string; label?: string | null };

export default function AttachmentsPanel({ woId }: { woId: string }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const { data, error, isLoading, mutate } = useApiSWR<Attachment[]>(
    token && tenantSlug ? `/work-orders/${woId}/attachments` : null,
    token, tenantSlug
  );

  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<Attachment['kind']>('PHOTO');

  const add = async () => {
    if (!url) return;
    try {
      await apiFetch(`/work-orders/${woId}/attachments`, {
        method: 'POST', token, tenantSlug,
        body: { kind, url, label: label || undefined }
      });
      setUrl(''); setLabel('');
      mutate();
    } catch (e:any) { alert(e.message || 'Error agregando adjunto'); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar adjunto?')) return;
    try {
      await apiFetch(`/work-orders/${woId}/attachments/${id}`, { method:'DELETE', token, tenantSlug });
      mutate();
    } catch (e:any) { alert(e.message || 'Error eliminando adjunto'); }
  };

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error: {(error as any).message}</div>;

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="text-xs text-gray-600">Tipo</label>
          <select className="border rounded w-full px-3 py-2" value={kind} onChange={e=>setKind(e.target.value as any)}>
            <option value="PHOTO">Foto</option>
            <option value="VIDEO">Video</option>
            <option value="AUDIO">Audio</option>
            <option value="DOC">Doc</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="text-xs text-gray-600">URL</label>
          <input className="border rounded w-full px-3 py-2" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/>
        </div>
        <div>
          <label className="text-xs text-gray-600">Etiqueta</label>
          <input className="border rounded w-full px-3 py-2" value={label} onChange={e=>setLabel(e.target.value)} />
        </div>
        <div className="md:col-span-5">
          <button onClick={add} className="px-3 py-2 rounded bg-black text-white">Agregar</button>
        </div>
      </div>

      <div className="grid gap-2">
        {items.map(a => (
          <div key={a.id} className="border rounded p-2 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{a.kind} — {a.label ?? a.url}</div>
              <div className="text-gray-600 break-all">{a.url}</div>
            </div>
            <button onClick={()=>remove(a.id)} className="px-2 py-1 border rounded">Eliminar</button>
          </div>
        ))}
        {items.length===0 && <div className="text-sm text-gray-500">Sin adjuntos</div>}
      </div>
    </div>
  );
}
