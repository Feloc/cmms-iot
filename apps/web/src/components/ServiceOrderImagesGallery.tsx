'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronLeft, ChevronRight, RefreshCcw, X } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { AttachmentFilePicker } from '@/components/AttachmentFilePicker';

type Props = {
  serviceOrderId: string;
};

type Item = { filename: string; url: string };

export function ServiceOrderImagesGallery({ serviceOrderId }: Props) {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const baseApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (auth.token) h['Authorization'] = `Bearer ${auth.token}`;
    if (auth.tenantSlug) h['x-tenant'] = auth.tenantSlug;
    return h;
  }, [auth.token, auth.tenantSlug]);

  function revokeAll(list: Item[]) {
    for (const it of list) {
      try {
        URL.revokeObjectURL(it.url);
      } catch {}
    }
  }

  async function load() {
    if (!auth.token || !auth.tenantSlug) return;
    setBusy(true);
    setErr('');
    try {
      const data = await apiFetch<{ items: string[] }>(`/service-orders/${serviceOrderId}/attachments?type=IMAGE`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });

      const filenames = Array.isArray(data?.items) ? data.items : [];
      // Descarga blobs con headers para que el multi-tenant/auth funcione
      const next: Item[] = [];
      for (const filename of filenames) {
        const r = await fetch(`${baseApi}/service-orders/${serviceOrderId}/attachments/IMAGE/${encodeURIComponent(filename)}`, {
          method: 'GET',
          headers,
        });
        if (!r.ok) continue;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        next.push({ filename, url });
      }

      setItems((prev) => {
        revokeAll(prev);
        return next;
      });
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando imágenes');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, serviceOrderId]);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!auth.token || !auth.tenantSlug) return;

    const selected = Array.from(files);
    setBusy(true);
    setErr('');
    setUploadProgress('');
    try {
      const failures: string[] = [];

      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        setUploadProgress(`Subiendo ${i + 1} de ${selected.length}: ${file.name}`);

        const fd = new FormData();
        fd.append('files', file);

        const res = await fetch(`${baseApi}/service-orders/${serviceOrderId}/attachments?type=IMAGE`, {
          method: 'POST',
          headers, // Authorization + x-tenant
          body: fd,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          failures.push(`${file.name}: ${detail || res.statusText || res.status}`);
          continue;
        }

        await res.json().catch(() => null);
      }

      await load();

      if (failures.length > 0) {
        setErr(`No se pudieron subir ${failures.length} archivo(s):\n${failures.join('\n')}`);
      }
    } catch (e: any) {
      setErr(e?.message ?? 'Error subiendo imágenes');
    } finally {
      setUploadProgress('');
      setBusy(false);
    }
  }

  async function del(filename: string) {
    if (!isAdmin) return;
    if (!auth.token || !auth.tenantSlug) return;
    if (!confirm('¿Eliminar esta foto?')) return;

    setErr('');
    setBusy(true);
    try {
      await apiFetch(`/service-orders/${serviceOrderId}/attachments/IMAGE/${filename}`, {
        method: 'DELETE',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Error eliminando imagen');
    } finally {
      setBusy(false);
    }
  }

  const current = lightbox != null ? items[lightbox] : null;

  return (
    <div className="border rounded p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold">Fotos</div>
          <div className="text-xs text-gray-600">Miniaturas (click para ampliar)</div>
        </div>
        <div className="flex items-center gap-2">
          <AttachmentFilePicker
            label="Elegir fotos"
            accept="image/*"
            disabled={busy}
            onFiles={uploadFiles}
          />
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-400 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            onClick={load}
            disabled={busy}
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refrescar
          </button>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 whitespace-pre-wrap">{err}</div> : null}
      {busy ? <div className="text-sm text-gray-600">Procesando…</div> : null}
      {uploadProgress ? <div className="text-sm text-gray-600">{uploadProgress}</div> : null}

      <div className="flex gap-2 overflow-x-auto">
        {items.map((it, idx) => (
          <button
            key={it.filename}
            type="button"
            className="relative shrink-0 rounded-md transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            onClick={() => setLightbox(idx)}
            title={it.filename}
          >
            <img src={it.url} alt={it.filename} className="w-24 h-20 object-cover rounded border" />
            {isAdmin ? (
              <span
                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-red-200 bg-white/95 text-xs font-medium text-red-700 shadow-sm transition-colors hover:bg-red-50"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  del(it.filename);
                }}
                title="Eliminar"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : null}
          </button>
        ))}
        {items.length === 0 && !busy ? <div className="text-sm text-gray-600">Sin fotos.</div> : null}
      </div>

      {/* Lightbox */}
      {current ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setLightbox(null)} />
          <div className="absolute inset-0 p-4 flex items-center justify-center">
            <div className="bg-white rounded border shadow max-w-5xl w-full p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm break-all">{current.filename}</div>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                    type="button"
                    onClick={() => setLightbox((i) => (i == null ? i : (i + items.length - 1) % items.length))}
                    aria-label="Foto anterior"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    className="inline-flex min-h-8 items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                    type="button"
                    onClick={() => setLightbox((i) => (i == null ? i : (i + 1) % items.length))}
                    aria-label="Foto siguiente"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    className="inline-flex min-h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                    type="button"
                    onClick={() => setLightbox(null)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Cerrar
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <img src={current.url} alt={current.filename} className="w-full max-h-[70vh] object-contain rounded border" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
