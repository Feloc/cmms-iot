'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

type Props = {
  serviceOrderId: string;
  type: 'VIDEO' | 'DOCUMENT';
  title: string;
};

export function ServiceOrderFilesSection({ serviceOrderId, type, title }: Props) {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState<{ filename: string; url: string } | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (auth.token) h['Authorization'] = `Bearer ${auth.token}`;
    if (auth.tenantSlug) h['x-tenant'] = auth.tenantSlug;
    return h;
  }, [auth.token, auth.tenantSlug]);

  const baseApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function load() {
    if (!auth.token || !auth.tenantSlug) return;
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch<{ items: string[] }>(`/service-orders/${serviceOrderId}/attachments?type=${type}`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      setItems(Array.isArray(data?.items) ? data.items.map(String) : []);
    } catch (e: any) {
      setErr(e?.message ?? `Error cargando ${title.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, serviceOrderId, type]);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!auth.token || !auth.tenantSlug) return;

    setUploading(true);
    setErr('');
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);

      const res = await fetch(`${baseApi}/service-orders/${serviceOrderId}/attachments?type=${type}`, {
        method: 'POST',
        headers, // auth + tenant
        body: fd,
      });

      if (!res.ok) throw new Error(await res.text());
      await res.json().catch(() => null);

      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      setErr(e?.message ?? `Error subiendo ${title.toLowerCase()}`);
    } finally {
      setUploading(false);
    }
  }

  async function del(filename: string) {
    if (!isAdmin) return;
    if (!auth.token || !auth.tenantSlug) return;
    if (!confirm('¿Eliminar este archivo?')) return;

    setErr('');
    try {
      await apiFetch(`/service-orders/${serviceOrderId}/attachments/${type}/${filename}`, {
        method: 'DELETE',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Error eliminando archivo');
    }
  }

  async function openFile(filename: string) {
    if (!auth.token || !auth.tenantSlug) return;

    setErr('');
    try {
      const r = await fetch(`${baseApi}/service-orders/${serviceOrderId}/attachments/${type}/${encodeURIComponent(filename)}`, {
        method: 'GET',
        headers,
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);

      if (type === 'VIDEO') {
        setPlaying({ filename, url });
      } else {
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error abriendo archivo');
    }
  }

  function closeVideo() {
    if (playing?.url) URL.revokeObjectURL(playing.url);
    setPlaying(null);
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-gray-600">
            {type === 'VIDEO'
              ? 'Subida en disco (API usa diskStorage). El API soporta Range.'
              : 'PDF/Word/otros.'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={type === 'VIDEO' ? 'video/*' : undefined}
            onChange={(e) => uploadFiles(e.target.files)}
            className="text-sm"
            disabled={uploading || loading}
          />
          <button type="button" className="px-3 py-2 border rounded text-sm" onClick={load} disabled={uploading || loading}>
            Refrescar
          </button>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 whitespace-pre-wrap">{err}</div> : null}
      {loading ? <div className="text-sm text-gray-600">Cargando…</div> : null}
      {uploading ? <div className="text-sm text-gray-600">Subiendo…</div> : null}

      <div className="divide-y">
        {items.map((f) => (
          <div key={f} className="py-2 flex items-center justify-between gap-2">
            <div className="text-sm break-all">{f}</div>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 border rounded text-sm" type="button" onClick={() => openFile(f)}>
                {type === 'VIDEO' ? 'Reproducir' : 'Abrir'}
              </button>
              {isAdmin ? (
                <button className="px-2 py-1 border rounded text-sm" type="button" onClick={() => del(f)}>
                  Eliminar
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 && !loading ? <div className="py-3 text-sm text-gray-600">Sin archivos.</div> : null}
      </div>

      {/* Modal video */}
      {playing ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={closeVideo} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div className="bg-white rounded border shadow max-w-3xl w-full p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm break-all">{playing.filename}</div>
                <button className="px-2 py-1 border rounded text-sm" onClick={closeVideo}>
                  Cerrar
                </button>
              </div>
              <div className="mt-2">
                <video src={playing.url} controls className="w-full" />
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Nota: el reproductor usa blob (descarga completa). El API ya soporta Range; para streaming real sin descarga completa,
                el siguiente paso sería un proxy same-origin en Next.js.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
