'use client';

import React from 'react';
import { useAssetsDetail } from './assets-detail.context';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export default function AssetPhotoCard({ asset, onUpdated }: { asset: any; onUpdated: () => Promise<void> }) {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const photo = asset?.photo;
  const version = photo?.createdAt ? encodeURIComponent(String(photo.createdAt)) : '';
  const photoUrl = photo ? `${apiBase}/assets/${encodeURIComponent(assetId)}/photo?v=${version}` : '';

  async function upload(file?: File) {
    if (!file) return;
    setError(null);
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Selecciona una imagen JPEG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(`${apiBase}/assets/${encodeURIComponent(assetId)}/photo`, {
        method: 'POST',
        body,
        headers,
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `No fue posible subir la foto (${response.status})`);
      await onUpdated();
    } catch (uploadError: any) {
      setError(uploadError?.message || 'No fue posible subir la foto.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    if (!photo || !confirm('¿Eliminar la foto principal de este activo?')) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/assets/${encodeURIComponent(assetId)}/photo`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `No fue posible eliminar la foto (${response.status})`);
      await onUpdated();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'No fue posible eliminar la foto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border rounded-lg p-4">
      <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
        <div className="aspect-[4/3] overflow-hidden rounded-lg border bg-gray-50 flex items-center justify-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`Foto de ${asset.name || asset.code}`} className="h-full w-full object-contain" />
          ) : (
            <div className="px-4 text-center text-sm text-gray-500">Este activo todavía no tiene foto.</div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">Foto del activo</h2>
            <p className="text-sm text-gray-500">JPEG, PNG o WebP. Tamaño máximo: 5 MB.</p>
          </div>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? 'Procesando…' : photo ? 'Reemplazar foto' : 'Agregar foto'}
            </button>
            {photo ? (
              <button
                type="button"
                className="rounded border px-3 py-2 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={busy}
                onClick={() => void remove()}
              >
                Eliminar foto
              </button>
            ) : null}
          </div>
          {photo ? <div className="text-xs text-gray-500 truncate">{photo.filename}</div> : null}
          {error ? <div className="text-sm text-red-700" role="alert">{error}</div> : null}
        </div>
      </div>
    </section>
  );
}

