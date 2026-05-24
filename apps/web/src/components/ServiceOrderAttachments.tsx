'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AttachmentFilePicker } from '@/components/AttachmentFilePicker';

type Kind = 'IMAGE' | 'VIDEO' | 'DOCUMENT';

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function ServiceOrderAttachments({
  serviceOrderId,
  token,
  tenantSlug,
  isAdmin,
}: {
  serviceOrderId: string;
  token: string;
  tenantSlug: string;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Kind>('IMAGE');

  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);

  const [selected, setSelected] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const list = useMemo(() => {
    if (tab === 'IMAGE') return images;
    if (tab === 'VIDEO') return videos;
    return docs;
  }, [tab, images, videos, docs]);

  useEffect(() => {
    // reset selection when changing tab
    setSelected('');
    setPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return '';
    });
  }, [tab]);

  useEffect(() => {
    refreshAll().catch((e) => setErr(e?.message ?? String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOrderId, token, tenantSlug]);

  async function refresh(kind: Kind) {
    const res = await apiFetch<{ items: string[] }>(`/service-orders/${serviceOrderId}/attachments?type=${kind}`, {
      token,
      tenantSlug,
    });
    const items = res?.items ?? [];
    if (kind === 'IMAGE') setImages(items);
    if (kind === 'VIDEO') setVideos(items);
    if (kind === 'DOCUMENT') setDocs(items);
  }

  async function refreshAll() {
    setErr('');
    await Promise.all([refresh('IMAGE'), refresh('VIDEO'), refresh('DOCUMENT')]);
  }

  async function fetchBlob(kind: Kind, filename: string) {
    const url = `${apiBase()}/service-orders/${serviceOrderId}/attachments/${kind}/${encodeURIComponent(filename)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant': tenantSlug,
      },
    });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return await res.blob();
  }

  async function openPreview(kind: Kind, filename: string) {
    setLoading(true);
    setErr('');
    try {
      const blob = await fetchBlob(kind, filename);
      const url = URL.createObjectURL(blob);

      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setSelected(filename);
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo cargar el archivo');
    } finally {
      setLoading(false);
    }
  }

  async function deleteFile(kind: Kind, filename: string) {
    if (!isAdmin) return;
    if (!confirm('¿Eliminar archivo?')) return;

    setLoading(true);
    setErr('');
    try {
      await apiFetch(`/service-orders/${serviceOrderId}/attachments/${kind}/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        token,
        tenantSlug,
      });
      await refresh(kind);
      if (selected === filename) {
        setSelected('');
        setPreviewUrl((u) => {
          if (u) URL.revokeObjectURL(u);
          return '';
        });
      }
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo eliminar');
    } finally {
      setLoading(false);
    }
  }

  async function upload(kind: Kind, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setLoading(true);
    setErr('');
    try {
      const fd = new FormData();
      Array.from(fileList).forEach((f) => fd.append('files', f));

      const url = `${apiBase()}/service-orders/${serviceOrderId}/attachments?type=${kind}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant': tenantSlug,
        },
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`POST ${url} -> ${res.status} ${text}`);
      }

      await refresh(kind);
    } catch (e: any) {
      setErr(e?.message ?? 'Error subiendo archivos');
    } finally {
      setLoading(false);
    }
  }

  const accept = tab === 'IMAGE'
    ? 'image/*'
    : tab === 'VIDEO'
    ? 'video/*'
    : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation';

  return (
    <section className="border rounded p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold">Adjuntos</h2>
          <div className="text-xs text-gray-600">Imágenes, videos y documentos (con vista previa y eliminación).</div>
        </div>

        <div className="flex items-center gap-2">
          <AttachmentFilePicker
            label={`Elegir ${tab === 'IMAGE' ? 'imágenes' : tab === 'VIDEO' ? 'videos' : 'documentos'}`}
            accept={accept}
            disabled={loading}
            onFiles={(files) => upload(tab, files)}
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Tab label={`Imágenes (${images.length})`} active={tab === 'IMAGE'} onClick={() => setTab('IMAGE')} />
        <Tab label={`Videos (${videos.length})`} active={tab === 'VIDEO'} onClick={() => setTab('VIDEO')} />
        <Tab label={`Documentos (${docs.length})`} active={tab === 'DOCUMENT'} onClick={() => setTab('DOCUMENT')} />
      </div>

      {err ? <div className="p-2 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div> : null}
      {loading ? <div className="text-sm text-gray-600">Procesando…</div> : null}

      {/* Lista + preview */}
      {tab === 'IMAGE' ? (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-auto py-1">
            {images.map((f) => (
              <button
                key={f}
                className={['border rounded p-1 min-w-[76px]', selected === f ? 'border-black' : 'border-gray-200'].join(' ')}
                onClick={() => openPreview('IMAGE', f)}
                type="button"
                title={f}
              >
                {/* miniatura real sólo cuando se selecciona; si no, placeholder */}
                <div className="w-[64px] h-[64px] bg-gray-100 rounded flex items-center justify-center text-xs text-gray-500">
                  {selected === f && previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="img" className="w-full h-full object-cover rounded" />
                  ) : (
                    'IMG'
                  )}
                </div>
                <div className="text-[10px] mt-1 truncate w-[64px]">{f}</div>
              </button>
            ))}
            {images.length === 0 ? <div className="text-sm text-gray-600">Sin imágenes.</div> : null}
          </div>

          {selected && previewUrl ? (
            <div className="border rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-gray-600 truncate">{selected}</div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <button
                      className="inline-flex min-h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-all hover:bg-red-100 active:scale-[0.98]"
                      onClick={() => deleteFile('IMAGE', selected)}
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="preview" className="max-h-[420px] w-auto rounded border" />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'VIDEO' ? (
        <div className="grid gap-3 md:grid-cols-[340px_1fr]">
          <div className="border rounded p-2 max-h-[420px] overflow-auto">
            {videos.length === 0 ? <div className="text-sm text-gray-600">Sin videos.</div> : null}
            {videos.map((f) => (
              <div key={f} className="flex items-center justify-between gap-2 py-1">
                <button className="truncate text-sm font-medium text-gray-800 underline-offset-4 hover:underline" onClick={() => openPreview('VIDEO', f)} type="button" title={f}>
                  {f}
                </button>
                {isAdmin ? (
                  <button
                    className="inline-flex min-h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-all hover:bg-red-100 active:scale-[0.98]"
                    onClick={() => deleteFile('VIDEO', f)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Eliminar
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border rounded p-2">
            {!selected || !previewUrl ? (
              <div className="text-sm text-gray-600">Selecciona un video para previsualizar.</div>
            ) : (
              <video src={previewUrl} controls className="w-full max-h-[420px] rounded border" />
            )}
          </div>
        </div>
      ) : null}

      {tab === 'DOCUMENT' ? (
        <div className="border rounded p-2">
          {docs.length === 0 ? <div className="text-sm text-gray-600">Sin documentos.</div> : null}
          {docs.map((f) => (
            <div key={f} className="flex items-center justify-between gap-2 py-1">
              <div className="min-w-0">
                <div className="text-sm truncate" title={f}>{f}</div>
                <div className="text-[11px] text-gray-500">{extOf(f) || 'doc'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex min-h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 transition-all hover:bg-gray-50 active:scale-[0.98]"
                  onClick={async () => {
                    // abrir blob en nueva pestaña
                    const blob = await fetchBlob('DOCUMENT', f);
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                  type="button"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Abrir
                </button>
                {isAdmin ? (
                  <button
                    className="inline-flex min-h-8 items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition-all hover:bg-red-100 active:scale-[0.98]"
                    onClick={() => deleteFile('DOCUMENT', f)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Eliminar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={[
        'inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-[0.98]',
        active ? 'border-black bg-black text-white' : 'border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:bg-gray-50',
      ].join(' ')}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
