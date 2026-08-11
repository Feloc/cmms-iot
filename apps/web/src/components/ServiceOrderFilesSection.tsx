'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ExternalLink, Play, RefreshCcw, Trash2, X } from 'lucide-react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { PUBLIC_API_BASE } from '@/lib/api-url';
import { AttachmentFilePicker } from '@/components/AttachmentFilePicker';

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

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (auth.token) h['Authorization'] = `Bearer ${auth.token}`;
    if (auth.tenantSlug) h['x-tenant'] = auth.tenantSlug;
    return h;
  }, [auth.token, auth.tenantSlug]);

  const baseApi = PUBLIC_API_BASE;

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
          <AttachmentFilePicker
            label={`Elegir ${type === 'VIDEO' ? 'videos' : 'documentos'}`}
            accept={type === 'VIDEO' ? 'video/*' : undefined}
            disabled={uploading || loading}
            onFiles={uploadFiles}
          />
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            onClick={load}
            disabled={uploading || loading}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
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
              <button
                className="inline-flex min-h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                type="button"
                onClick={() => openFile(f)}
              >
                {type === 'VIDEO' ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />}
                {type === 'VIDEO' ? 'Reproducir' : 'Abrir'}
              </button>
              {isAdmin ? (
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-all hover:bg-red-100 active:scale-[0.98]"
                  type="button"
                  onClick={() => del(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                  type="button"
                  onClick={closeVideo}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
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
