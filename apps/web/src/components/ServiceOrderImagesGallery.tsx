'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

type ImageItem = { filename: string; createdAt?: string | null };

function normalizeImages(data: any): ImageItem[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((x) => {
        if (typeof x === 'string') return { filename: x };
        if (x && typeof x === 'object' && typeof (x as any).filename === 'string') return { filename: (x as any).filename, createdAt: (x as any).createdAt ?? null };
        return null;
      })
      .filter(Boolean) as ImageItem[];
  }
  if (Array.isArray(data.items)) return normalizeImages(data.items);
  return [];
}

async function fetchBlobUrl(url: string, headers: Record<string, string>): Promise<string> {
  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function ServiceOrderImagesGallery({
  serviceOrderId,
  title = 'Galería',
  token,
  tenantSlug,
}: {
  serviceOrderId: string;
  title?: string;
  /** Compat: si no se pasa, se toma de la sesión */
  token?: string;
  /** Compat: si no se pasa, se toma de la sesión */
  tenantSlug?: string;
}) {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const effectiveToken = token ?? auth.token;
  const effectiveTenant = tenantSlug ?? auth.tenantSlug;

  const [items, setItems] = useState<ImageItem[]>([]);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const stripRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (effectiveToken) h['Authorization'] = `Bearer ${effectiveToken}`;
    if (effectiveTenant) h['x-tenant'] = effectiveTenant;
    return h;
  }, [effectiveToken, effectiveTenant]);

  const baseApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  async function load() {
    if (!effectiveToken || !effectiveTenant) return;
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch<any>(`/service-orders/${serviceOrderId}/images`, {
        token: effectiveToken,
        tenantSlug: effectiveTenant,
      });
      setItems(normalizeImages(data));
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando imágenes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveToken, effectiveTenant, serviceOrderId]);

  // Mantener urlMap (blob urls) para thumbnails
  useEffect(() => {
    let cancelled = false;

    async function ensureUrls() {
      if (!effectiveToken || !effectiveTenant) return;

      // Limpia urls de items removidos
      setUrlMap((prev) => {
        const keep: Record<string, string> = {};
        const set = new Set(items.map((i) => i.filename));
        for (const [k, v] of Object.entries(prev)) {
          if (set.has(k)) keep[k] = v;
          else URL.revokeObjectURL(v);
        }
        return keep;
      });

      const missing = items.map((i) => i.filename).filter((f) => !urlMap[f]);
      if (missing.length === 0) return;

      const chunkSize = 4;
      for (let i = 0; i < missing.length; i += chunkSize) {
        const chunk = missing.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (filename) => {
            const url = `${baseApi}/service-orders/${serviceOrderId}/images/${encodeURIComponent(filename)}`;
            const blobUrl = await fetchBlobUrl(url, headers);
            if (cancelled) {
              URL.revokeObjectURL(blobUrl);
              return;
            }
            setUrlMap((prev) => ({ ...prev, [filename]: blobUrl }));
          }),
        );
      }
    }

    ensureUrls();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, headers, baseApi, serviceOrderId, urlMap, effectiveToken, effectiveTenant]);

  // Revoke all on unmount
  useEffect(() => {
    return () => {
      for (const u of Object.values(urlMap)) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!effectiveToken || !effectiveTenant) return;

    setUploading(true);
    setErr('');
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append('files', f));

      const url = `${baseApi}/service-orders/${serviceOrderId}/images`;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: form,
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e: any) {
      setErr(e?.message ?? 'Error subiendo imágenes');
    } finally {
      setUploading(false);
    }
  }

  function scrollStrip(delta: number) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  }

  const has = items.length > 0;
  const lightboxItem = lightboxIndex === null ? null : items[lightboxIndex] ?? null;
  const lightboxSrc = lightboxItem ? urlMap[lightboxItem.filename] : '';

  return (
    <div className="border rounded p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-gray-600">Miniaturas (click para ampliar).</div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <button
            className="px-3 py-2 border rounded text-sm disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Subiendo…' : 'Agregar imágenes'}
          </button>
        </div>
      </div>

      {err ? <div className="mt-2 text-sm text-red-700 bg-red-50 border rounded p-2">{err}</div> : null}

      <div className="mt-3">
        {loading ? (
          <div className="text-sm text-gray-600">Cargando…</div>
        ) : !has ? (
          <div className="text-sm text-gray-600">Sin imágenes.</div>
        ) : (
          <div className="flex items-center gap-2">
            <button className="px-2 py-2 border rounded" onClick={() => scrollStrip(-260)} aria-label="Anterior">
              ‹
            </button>

            <div ref={stripRef} className="flex-1 overflow-x-auto whitespace-nowrap">
              <div className="flex gap-2">
                {items.map((it, idx) => {
                  const src = urlMap[it.filename];
                  return (
                    <button
                      key={it.filename}
                      className="border rounded overflow-hidden"
                      style={{ width: 84, height: 84 }}
                      onClick={() => setLightboxIndex(idx)}
                      title="Click para ampliar"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={it.filename} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">…</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="px-2 py-2 border rounded" onClick={() => scrollStrip(260)} aria-label="Siguiente">
              ›
            </button>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null ? (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setLightboxIndex(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded max-w-4xl w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="text-sm font-medium truncate">{lightboxItem?.filename}</div>
              <button className="px-2 py-1 border rounded text-sm" onClick={() => setLightboxIndex(null)}>
                Cerrar
              </button>
            </div>

            <div className="relative bg-black">
              {lightboxSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lightboxSrc} alt="" className="w-full max-h-[70vh] object-contain" />
              ) : (
                <div className="h-[50vh] flex items-center justify-center text-white">Cargando…</div>
              )}

              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/90"
                onClick={() => setLightboxIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length))}
                aria-label="Anterior"
              >
                ‹
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-2 rounded bg-white/90"
                onClick={() => setLightboxIndex((i) => (i === null ? null : (i + 1) % items.length))}
                aria-label="Siguiente"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
