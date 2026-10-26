'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiBase } from '@/lib/api';
import { fatMediaResponse } from './ManufacturingFatMedia';

type ImageAuth = { token?: string; tenantSlug?: string };
type ImageFile = { id: string; title: string; filename?: string | null; mimeType?: string | null };
type ImageResource = 'dispatch-checklist-evidence' | 'dispatch-documents';
type PreviewState = { status: 'idle' | 'loading' | 'ready' | 'error'; url: string; error: string };

export const DispatchImageAuth = createContext<ImageAuth>({});

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const buttonClass = 'rounded border bg-white px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 disabled:opacity-50';

export function DispatchImagePreview({ file, resource, onOpen }: { file: ImageFile; resource: ImageResource; onOpen?: () => void }) {
  const auth = useContext(DispatchImageAuth);
  const mimeType = file.mimeType?.toLowerCase().split(';')[0].trim() || '';
  if (!imageTypes.has(mimeType)) return null;

  // A changed session must never render an object URL belonging to the previous one.
  const sessionKey = JSON.stringify([auth.token, auth.tenantSlug, resource, file.id, mimeType]);
  return <ImagePreview key={sessionKey} file={file} resource={resource} auth={auth} onOpen={onOpen} />;
}

function ImagePreview({ file, resource, auth, onOpen }: { file: ImageFile; resource: ImageResource; auth: ImageAuth; onOpen?: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreviewState>({ status: 'idle', url: '', error: '' });
  const [decodeError, setDecodeError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const target = container.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') { setNearViewport(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport || !auth.token || !auth.tenantSlug) return;
    const controller = new AbortController();
    let objectUrl = '';
    let current = true;
    setState({ status: 'loading', url: '', error: '' });
    setDecodeError(false);

    async function load() {
      try {
        const response = await fetch(`${apiBase}/manufacturing/${resource}/${encodeURIComponent(file.id)}/file`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug! },
          cache: 'no-store',
        });
        await fatMediaResponse(response);
        const blob = await response.blob();
        if (!current || controller.signal.aborted) return;
        if (!imageTypes.has(blob.type.toLowerCase().split(';')[0].trim()) || !blob.size) {
          throw new Error('El archivo recibido no es una imagen JPG, PNG o WebP válida. Puedes descargar el original.');
        }
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl, error: '' });
      } catch (error: unknown) {
        if (!current || controller.signal.aborted) return;
        setState({ status: 'error', url: '', error: error instanceof Error ? error.message : 'No se pudo cargar la imagen.' });
      }
    }
    void load();
    return () => {
      current = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nearViewport, attempt, auth.token, auth.tenantSlug, file.id, resource]);

  function retry() {
    setOpen(false);
    setDecodeError(false);
    setState({ status: 'loading', url: '', error: '' });
    setAttempt(value => value + 1);
  }

  function imageFailed() {
    setDecodeError(true);
    setOpen(false);
  }

  const thumbnail = <button type="button" disabled={decodeError} onClick={onOpen} aria-label={`Ampliar imagen: ${file.title}`} className="inline-flex max-w-full flex-col items-center gap-1 rounded border bg-white p-1.5 text-xs text-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 disabled:opacity-60">
    {!decodeError ? <img src={state.url} alt={file.title} onError={imageFailed} className="h-32 w-48 max-w-full rounded object-contain" /> : <span className="px-3 py-6">Vista previa no disponible</span>}
    <span>{decodeError ? 'Imagen no disponible' : onOpen ? 'Ver en galería' : 'Ver imagen'}</span>
  </button>;

  return <div ref={container} className="max-w-full space-y-2">
    {!auth.token || !auth.tenantSlug ? <p className="text-xs text-gray-500">Inicia sesión para ver la imagen.</p> : null}
    {auth.token && auth.tenantSlug && (state.status === 'idle' || state.status === 'loading') ? <p role="status" className="rounded border bg-white px-3 py-6 text-xs text-gray-500">{state.status === 'loading' ? 'Cargando imagen…' : 'Vista previa de imagen'}</p> : null}
    {state.status === 'ready' ? onOpen ? thumbnail : <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {thumbnail}
      </DialogTrigger>
      <DialogContent className="max-h-[95vh] w-[calc(100%_-_2rem)] max-w-5xl overflow-y-auto bg-white p-4 text-gray-900 sm:p-6">
        <DialogHeader className="pr-7">
          <DialogTitle className="break-words">{file.title}</DialogTitle>
          <DialogDescription className="break-all">{file.filename || 'Imagen adjunta del despacho'}</DialogDescription>
        </DialogHeader>
        {!decodeError ? <img src={state.url} alt={file.title} onError={imageFailed} className="max-h-[70vh] w-full rounded object-contain" /> : null}
        <a href={state.url} download={file.filename || file.title || 'imagen'} className={`${buttonClass} justify-self-start`}>Descargar original</a>
      </DialogContent>
    </Dialog> : null}
    {state.status === 'error' || decodeError ? <div className="space-y-2">
      <p role="alert" className="text-xs text-red-700">{decodeError ? 'El navegador no pudo mostrar esta imagen. Puedes descargar el original o volver a cargarla.' : state.error}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} onClick={retry}>Volver a cargar imagen</button>
        {decodeError && state.url ? <a href={state.url} download={file.filename || file.title || 'imagen'} className={buttonClass}>Descargar original</a> : null}
      </div>
    </div> : null}
  </div>;
}
