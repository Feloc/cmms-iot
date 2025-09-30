'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

// -------------------- Tipos --------------------
type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string; // ignorar como href; usaremos endpoints view/download
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  createdAt: string;
  createdBy?: string;
};

type ListResponse = {
  items: Attachment[];
  page: number;
  size: number;
  total: number;
  pages: number;
};

// -------------------- Config --------------------
const MAX_MB =
  Number(process.env.NEXT_PUBLIC_ATTACHMENTS_MAX_MB || process.env.NEXT_PUBLIC_ATTACHMENTS_MAX_SIZE_MB || 20);
const ALLOWED_MIME =
  (process.env.NEXT_PUBLIC_ATTACHMENTS_ALLOWED_MIME || 'image/*,video/*,audio/*,application/pdf')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const PAGE_SIZE = 20;

// -------------------- Utils --------------------
function inferType(mime: string): Attachment['type'] {
  if (mime.startsWith('image/')) return 'IMAGE';
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}

function mimeAllowed(mime: string): boolean {
  return ALLOWED_MIME.some((rule) => {
    if (rule.endsWith('/*')) {
      const prefix = rule.slice(0, rule.indexOf('/'));
      return mime.startsWith(prefix + '/');
    }
    return rule === mime;
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(1)} ${units[i]}`;
}

function normalizeListResponse(json: any): ListResponse {
  if (Array.isArray(json)) {
    return { items: json, page: 1, size: json.length, total: json.length, pages: 1 };
  }
  const items = Array.isArray(json?.items) ? json.items : [];
  const page = Number(json?.page || 1);
  const size = Number(json?.size || items.length || PAGE_SIZE);
  const total = Number(json?.total || items.length);
  const pages = Number(json?.pages || Math.max(1, Math.ceil(total / Math.max(1, size))));
  return { items, page, size, total, pages };
}

// -------------------- Componente --------------------
export default function AttachmentsPanel({ woId }: { woId: string }) {
  const { data: session } = useSession();

  const token =
    (session as any)?.accessToken ||
    (session as any)?.user?.token ||
    (session as any)?.jwt ||
    undefined;

  const tenantSlug =
    (session as any)?.user?.tenant?.slug ||
    (session as any)?.tenant?.slug ||
    (session as any)?.tenantSlug ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    undefined;

  const [list, setList] = useState<ListResponse>({ items: [], page: 1, size: PAGE_SIZE, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<FileList | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canInteract = useMemo(() => Boolean(tenantSlug) && !busy, [tenantSlug, busy]);

  const apiHeaders = useCallback(() => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (tenantSlug) h['x-tenant'] = tenantSlug; // o x-tenant-id según backend
    return h;
  }, [token, tenantSlug]);

  const listUrl = `${API_BASE}/work-orders/${encodeURIComponent(woId)}/attachments`;

  const loadAttachments = useCallback(
    async (p = 1) => {
      if (!tenantSlug) {
        setList({ items: [], page: 1, size: PAGE_SIZE, total: 0, pages: 1 });
        return;
      }
      setLoading(true);
      setErrors([]);
      try {
        const res = await fetch(`${listUrl}?page=${p}&size=${PAGE_SIZE}`, {
          method: 'GET',
          credentials: 'include',
          headers: apiHeaders(),
        });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch {}
        if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        const normalized = normalizeListResponse(json);
        setList(normalized);
      } catch (e: any) {
        setErrors([e?.message || 'Error cargando adjuntos']);
        setList({ items: [], page: 1, size: PAGE_SIZE, total: 0, pages: 1 });
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug, listUrl, apiHeaders]
  );

  React.useEffect(() => {
    void loadAttachments(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId, tenantSlug, token]);

  const uploadSingle = useCallback(
    async (file: File) => {
      if (!tenantSlug) throw new Error('Falta tenant (tenantSlug)');
      const type = inferType(file.type);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type); // el controller de compat de WO infiere si no viene
      const res = await fetch(listUrl, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: apiHeaders(), // NO poner Content-Type manual
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} al subir "${file.name}": ${t}`);
      }
      return res.json();
    },
    [tenantSlug, listUrl, apiHeaders]
  );

  const deleteAttachment = useCallback(
    async (attId: string) => {
      const res = await fetch(`${API_BASE}/attachments/${encodeURIComponent(attId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: apiHeaders(),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} al eliminar: ${t}`);
      }
    },
    [apiHeaders]
  );

  const validateFiles = useCallback((files: FileList): string[] => {
    const errs: string[] = [];
    const maxBytes = MAX_MB * 1024 * 1024;
    Array.from(files).forEach((f) => {
      if (f.size > maxBytes) {
        errs.push(`"${f.name}" supera el máximo de ${MAX_MB} MB (${formatBytes(f.size)})`);
      }
      if (!mimeAllowed(f.type)) {
        errs.push(`"${f.name}" tiene tipo no permitido (${f.type}). Permitidos: ${ALLOWED_MIME.join(', ')}`);
      }
    });
    return errs;
  }, []);

  const uploadWithLimit = useCallback(
    async (files: File[], limit = 3) => {
      let idx = 0;
      const results: { file: File; ok: boolean; message?: string }[] = [];
      const workers: Promise<void>[] = [];
      const runOne = async () => {
        const i = idx++;
        const f = files[i];
        if (!f) return;
        try {
          await uploadSingle(f);
          results.push({ file: f, ok: true });
        } catch (e: any) {
          results.push({ file: f, ok: false, message: e?.message || 'Error subiendo archivo' });
        }
        if (idx < files.length) await runOne();
      };
      for (let i = 0; i < Math.min(limit, files.length); i++) workers.push(runOne());
      await Promise.all(workers);
      return results;
    },
    [uploadSingle]
  );

  const onSelectFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setErrors([]);
    const files = e.target.files;
    setSelected(files && files.length ? files : null);
  }, []);

  const onUpload = useCallback(async () => {
    if (!selected || !selected.length) return;
    const localErrs = validateFiles(selected);
    if (localErrs.length) {
      setErrors(localErrs);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const files = Array.from(selected);
      const results = await uploadWithLimit(files, 3);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        setErrors(failed.map((f) => `Fallo "${f.file.name}": ${f.message || 'Error desconocido'}`));
      }
      await loadAttachments(list.page);
      if (inputRef.current) inputRef.current.value = '';
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }, [selected, validateFiles, uploadWithLimit, loadAttachments, list.page]);

  const onDelete = useCallback(
    async (attId: string, filename: string) => {
      if (!confirm(`¿Eliminar el adjunto "${filename}"?`)) return;
      try {
        await deleteAttachment(attId);
        await loadAttachments(list.page);
      } catch (e: any) {
        setErrors([`No se pudo eliminar "${filename}": ${e?.message || e}`]);
      }
    },
    [deleteAttachment, loadAttachments, list.page]
  );

  const canPrev = !loading && list.page > 1;
  const canNext = !loading && list.page < list.pages;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h3 className="text-lg font-semibold">Adjuntos</h3>
          <p className="text-sm text-gray-500">Tipos permitidos: {ALLOWED_MIME.join(', ')} · Máx {MAX_MB} MB c/u</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ALLOWED_MIME.join(',')}
            onChange={onSelectFiles}
            disabled={!canInteract}
            className="block text-sm"
          />
          <button
            onClick={onUpload}
            disabled={!canInteract || !selected?.length}
            className={`px-4 py-2 rounded text-white ${
              !canInteract || !selected?.length ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {busy ? 'Subiendo…' : 'Subir'}
          </button>
          <button onClick={() => loadAttachments(list.page)} disabled={loading} className="px-3 py-2 rounded border hover:bg-gray-100">Refrescar</button>
      </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5 space-y-1">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabla (alineada con Assets) */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Archivo</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Tamaño</th>
                <th className="px-3 py-2 text-left">Creado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
              ) : list.items.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin adjuntos.</td></tr>
              ) : (
                list.items.map((a) => {
                  const isImg = a.mimeType?.startsWith('image/');
                  const isVideo = a.mimeType?.startsWith('video/');
                  const isAudio = a.mimeType?.startsWith('audio/');
                  const sizeStr = typeof a.size === 'number' ? formatBytes(a.size) : '—';
                  const hrefView = `${API_BASE}/attachments/${encodeURIComponent(a.id)}/view${tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''}`;
                  const hrefDownload = `${API_BASE}/attachments/${encodeURIComponent(a.id)}/download${tenantSlug ? `?tenant=${encodeURIComponent(tenantSlug)}` : ''}`;

                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 border-t">
                        {isImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <a className="text-blue-700 underline inline-flex items-center gap-2" href={hrefView} target="_blank" rel="noreferrer">
                            <img src={hrefView} alt={a.filename} className="w-10 h-10 object-cover rounded border" />
                            <span className="truncate max-w-[20ch]">{a.filename}</span>
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
                          <button className="px-2 py-1 rounded border hover:bg-gray-100" onClick={() => onDelete(a.id, a.filename)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-center gap-3">
        <button
          className={`px-3 py-1 rounded border ${!loading && list.page > 1 ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
          disabled={loading || list.page <= 1}
          onClick={() => loadAttachments(list.page - 1)}
        >
          Anterior
        </button>
        <span className="text-sm text-gray-600">Página {list.page} de {list.pages} · {list.total} elementos</span>
        <button
          className={`px-3 py-1 rounded border ${!loading && list.page < list.pages ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
          disabled={loading || list.page >= list.pages}
          onClick={() => loadAttachments(list.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
