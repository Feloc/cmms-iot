'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

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
  const [lightbox, setLightbox] = useState<number | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);

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

    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);

      const res = await fetch(`${baseApi}/service-orders/${serviceOrderId}/attachments?type=IMAGE`, {
        method: 'POST',
        headers, // Authorization + x-tenant
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      await res.json().catch(() => null);

      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Error subiendo imágenes');
    } finally {
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
          <div className="text-xs text-gray-600">Miniaturas (click para ampliar). Subida con headers (tenant/auth).</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => uploadFiles(e.target.files)}
            disabled={busy}
            className="text-sm"
          />
          <button type="button" className="px-3 py-2 border rounded text-sm" onClick={load} disabled={busy}>
            Refrescar
          </button>
        </div>
      </div>

      {err ? <div className="text-sm text-red-700 whitespace-pre-wrap">{err}</div> : null}
      {busy ? <div className="text-sm text-gray-600">Procesando…</div> : null}

      <div className="flex gap-2 overflow-x-auto">
        {items.map((it, idx) => (
          <button
            key={it.filename}
            type="button"
            className="relative shrink-0"
            onClick={() => setLightbox(idx)}
            title={it.filename}
          >
            <img src={it.url} alt={it.filename} className="w-24 h-20 object-cover rounded border" />
            {isAdmin ? (
              <span
                className="absolute top-1 right-1 bg-white/90 border rounded px-1 text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  del(it.filename);
                }}
                title="Eliminar"
              >
                ✕
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
                    className="px-2 py-1 border rounded text-sm"
                    type="button"
                    onClick={() => setLightbox((i) => (i == null ? i : (i + items.length - 1) % items.length))}
                  >
                    ◀
                  </button>
                  <button
                    className="px-2 py-1 border rounded text-sm"
                    type="button"
                    onClick={() => setLightbox((i) => (i == null ? i : (i + 1) % items.length))}
                  >
                    ▶
                  </button>
                  <button className="px-2 py-1 border rounded text-sm" type="button" onClick={() => setLightbox(null)}>
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
