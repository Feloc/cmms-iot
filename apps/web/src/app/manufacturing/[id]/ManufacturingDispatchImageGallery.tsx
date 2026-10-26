'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiBase } from '@/lib/api';
import { dateLabel, type ManufacturingDispatch } from '@/lib/manufacturing';
import { fatMediaResponse } from './ManufacturingFatMedia';
import { DispatchImageAuth, DispatchImagePreview } from './ManufacturingDispatchImagePreview';

type Resource = 'dispatch-checklist-evidence' | 'dispatch-documents';
type ImageFile = { id: string; title: string; filename?: string | null; mimeType?: string | null };
type Photo = ImageFile & { key: string; resource: Resource; group: string; groupName: string; notes?: string | null; createdByName: string; createdAt: string };
type Auth = { token?: string; tenantSlug?: string };
type ImageState = { status: 'loading' | 'ready' | 'error'; url?: string; error?: string; controller?: AbortController };
type GalleryContext = { photos: Photo[]; open: (filter?: string, selected?: string) => void };
const Gallery = createContext<GalleryContext | null>(null);
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const buttonClass = 'rounded border bg-white px-3 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 disabled:opacity-50';
const normalizedType = (mimeType?: string | null) => mimeType?.toLowerCase().split(';')[0].trim() || '';

function dispatchPhotos(dispatch: ManufacturingDispatch): Photo[] {
  const checklist = dispatch.checklistItems.flatMap(item => (item.evidence || []).map(file => ({ ...file, key: `dispatch-checklist-evidence:${file.id}`, resource: 'dispatch-checklist-evidence' as const, group: item.id, groupName: `${item.position}. ${item.name}` })));
  const documents = dispatch.documents.filter(file => !!file.filename).map(file => ({ ...file, key: `dispatch-documents:${file.id}`, resource: 'dispatch-documents' as const, group: 'documents', groupName: 'Documentos generales' }));
  return [...checklist, ...documents].filter(file => imageTypes.has(normalizedType(file.mimeType)));
}

export function DispatchGalleryProvider({ dispatch, children }: { dispatch: ManufacturingDispatch; children: ReactNode }) {
  const auth = useContext(DispatchImageAuth);
  const sessionKey = JSON.stringify([auth.token, auth.tenantSlug, dispatch.id]);
  return <GalleryProvider key={sessionKey} dispatch={dispatch} auth={auth}>{children}</GalleryProvider>;
}

function GalleryProvider({ dispatch, auth, children }: { dispatch: ManufacturingDispatch; auth: Auth; children: ReactNode }) {
  const photos = useMemo(() => dispatchPhotos(dispatch), [dispatch]);
  const [view, setView] = useState<{ filter: string; selected: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = useCallback((filter = 'all', selected = '') => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setView({ filter, selected });
  }, []);
  return <Gallery.Provider value={{ photos, open }}>
    {children}
    <Dialog open={!!view} onOpenChange={value => { if (!value) setView(null); }}>
      {view ? <GalleryContent photos={photos} dispatchCode={dispatch.dispatchCode} auth={auth} initial={view} onRestoreFocus={() => opener.current?.focus()} /> : null}
    </Dialog>
  </Gallery.Provider>;
}

export function DispatchGalleryButton({ checklistItemId }: { checklistItemId?: string }) {
  const gallery = useContext(Gallery);
  if (!gallery) return null;
  const count = gallery.photos.filter(photo => !checklistItemId || photo.group === checklistItemId).length;
  if (!count) return null;
  return <button type="button" className={buttonClass} onClick={() => gallery.open(checklistItemId || 'all')}>
    {checklistItemId ? 'Ver fotos de este punto' : 'Ver galería'} · {count} {count === 1 ? 'foto' : 'fotos'}
  </button>;
}

export function DispatchGalleryThumbnail({ file, resource }: { file: ImageFile; resource: Resource }) {
  const gallery = useContext(Gallery);
  return <DispatchImagePreview file={file} resource={resource} onOpen={gallery ? () => gallery.open('all', `${resource}:${file.id}`) : undefined} />;
}

// Originals are shared by the grid and viewer only for the lifetime of this dialog.
// Three active requests bound simultaneous downloads, including quick navigation.
function useGalleryImages(auth: Auth, photos: Photo[]) {
  const entries = useRef(new Map<string, ImageState>());
  const queue = useRef<Photo[]>([]);
  const active = useRef(new Set<AbortController>());
  const mounted = useRef(false);
  const [, refresh] = useState(0);
  const publish = useCallback(() => { if (mounted.current) refresh(value => value + 1); }, []);
  const pump = useRef<() => void>(() => {});

  pump.current = () => {
    while (mounted.current && active.current.size < 3 && queue.current.length) {
      const photo = queue.current.shift()!;
      const state = entries.current.get(photo.key);
      if (!state || state.controller || state.status !== 'loading') continue;
      const controller = new AbortController();
      state.controller = controller;
      active.current.add(controller);
      void (async () => {
        try {
          const response = await fetch(`${apiBase}/manufacturing/${photo.resource}/${encodeURIComponent(photo.id)}/file`, {
            signal: controller.signal, cache: 'no-store',
            headers: { Authorization: `Bearer ${auth.token}`, 'x-tenant': auth.tenantSlug! },
          });
          await fatMediaResponse(response);
          const blob = await response.blob();
          if (!mounted.current || controller.signal.aborted || entries.current.get(photo.key) !== state) return;
          if (!blob.size || !imageTypes.has(normalizedType(blob.type))) throw new Error('El archivo recibido no es una imagen JPG, PNG o WebP válida.');
          state.url = URL.createObjectURL(blob);
          state.status = 'ready';
        } catch (error: unknown) {
          if (!mounted.current || controller.signal.aborted || entries.current.get(photo.key) !== state) return;
          state.status = 'error';
          state.error = error instanceof Error ? error.message : 'No se pudo cargar la imagen.';
        } finally {
          active.current.delete(controller);
          publish();
          pump.current();
        }
      })();
    }
  };

  useEffect(() => {
    mounted.current = true;
    pump.current();
    return () => {
      mounted.current = false;
      active.current.forEach(controller => controller.abort());
      active.current.clear();
      entries.current.forEach(state => { if (state.url) URL.revokeObjectURL(state.url); });
      entries.current.clear();
      queue.current = [];
    };
  }, []);

  useEffect(() => {
    const keys = new Set(photos.map(photo => photo.key));
    queue.current = queue.current.filter(photo => keys.has(photo.key));
    entries.current.forEach((state, key) => {
      if (keys.has(key)) return;
      state.controller?.abort();
      if (state.url) URL.revokeObjectURL(state.url);
      entries.current.delete(key);
    });
  }, [photos]);

  const load = useCallback((photo: Photo, retry = false, priority = false) => {
    if (!auth.token || !auth.tenantSlug) return;
    const previous = entries.current.get(photo.key);
    if (previous && (!retry || previous.status === 'loading')) {
      if (priority && previous.status === 'loading' && !previous.controller) {
        queue.current = [photo, ...queue.current.filter(queued => queued.key !== photo.key)];
        pump.current();
      }
      return;
    }
    if (previous?.url) URL.revokeObjectURL(previous.url);
    entries.current.set(photo.key, { status: 'loading' });
    if (priority) queue.current.unshift(photo); else queue.current.push(photo);
    publish();
    pump.current();
  }, [auth.token, auth.tenantSlug, publish]);

  const decodeFailed = useCallback((photo: Photo) => {
    const state = entries.current.get(photo.key);
    if (!state || state.status === 'error') return;
    state.status = 'error';
    state.error = 'El navegador no pudo mostrar esta imagen. Puedes descargar el original o volver a cargarla.';
    publish();
  }, [publish]);
  return { entries: entries.current, load, decodeFailed };
}

function GalleryContent({ photos, dispatchCode, auth, initial, onRestoreFocus }: { photos: Photo[]; dispatchCode: string; auth: Auth; initial: { filter: string; selected: string }; onRestoreFocus: () => void }) {
  const [filter, setFilter] = useState(initial.filter);
  const [selectedKey, setSelectedKey] = useState(initial.selected);
  const viewport = useRef<HTMLDivElement>(null);
  const { entries, load, decodeFailed } = useGalleryImages(auth, photos);
  const groups = [...new Map(photos.map(photo => [photo.group, photo.groupName])).entries()];
  const visible = photos.filter(photo => filter === 'all' || photo.group === filter);
  const index = visible.findIndex(photo => photo.key === selectedKey);
  const selected = visible[index];
  const state = selected ? entries.get(selected.key) : undefined;

  useEffect(() => {
    if (filter !== 'all' && !photos.some(photo => photo.group === filter)) { setFilter('all'); setSelectedKey(''); }
    else if (selectedKey && !photos.some(photo => photo.key === selectedKey)) setSelectedKey('');
  }, [photos, filter, selectedKey]);

  useEffect(() => { if (selected) load(selected, false, true); }, [selected?.key, load]);

  function navigate(delta: number) {
    const next = visible[index + delta];
    if (next) setSelectedKey(next.key);
  }

  return <DialogContent className="flex max-h-[95vh] w-[calc(100%_-_1rem)] max-w-6xl flex-col overflow-hidden bg-white p-4 text-gray-900 sm:p-6" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }} onKeyDown={event => {
    if (!selected || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],[role="combobox"]')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); navigate(event.key === 'ArrowLeft' ? -1 : 1); }
  }}>
    <DialogHeader className="shrink-0 pr-8">
      <DialogTitle>Galería de imágenes · {dispatchCode}</DialogTitle>
      <DialogDescription>{photos.length} {photos.length === 1 ? 'foto disponible' : 'fotos disponibles'}. Selecciona una miniatura para revisar sus detalles.</DialogDescription>
    </DialogHeader>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <label className="flex max-w-full items-center gap-2 text-sm">Mostrar<select aria-label="Filtrar imágenes del despacho" className="min-w-0 max-w-full rounded border bg-white p-2 text-sm" value={filter} onChange={event => { setFilter(event.target.value); setSelectedKey(''); }}>
        <option value="all">Todas las imágenes ({photos.length})</option>
        {groups.map(([id, name]) => <option key={id} value={id}>{name} ({photos.filter(photo => photo.group === id).length})</option>)}
      </select></label>
      {selected ? <button type="button" className={buttonClass} onClick={() => setSelectedKey('')}>Volver a la cuadrícula</button> : null}
    </div>
    <div ref={viewport} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {!auth.token || !auth.tenantSlug ? <p role="status" className="p-6 text-sm text-gray-500">Inicia sesión para ver las imágenes.</p> : selected ? <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={buttonClass} disabled={index <= 0} onClick={() => navigate(-1)}>← Anterior</button>
          <p role="status" aria-live="polite" className="text-sm">{index + 1} de {visible.length}</p>
          <button type="button" className={buttonClass} disabled={index >= visible.length - 1} onClick={() => navigate(1)}>Siguiente →</button>
        </div>
        <div className="flex min-h-48 items-center justify-center rounded bg-gray-100 p-2">
          {state?.status === 'ready' && state.url ? <img src={state.url} alt={selected.title} onError={() => decodeFailed(selected)} className="max-h-[55vh] w-full object-contain" /> : <ImageStatus state={state} onRetry={() => load(selected, true, true)} />}
        </div>
        <div className="space-y-1 text-sm">
          <p className="text-xs text-gray-500">{selected.groupName}</p>
          <h3 className="break-words font-semibold">{selected.title}</h3>
          <p className="break-all text-xs text-gray-600">{selected.filename || 'Imagen adjunta'}</p>
          {selected.notes ? <p className="whitespace-pre-wrap break-words">{selected.notes}</p> : null}
          <p className="text-xs text-gray-500">{selected.createdByName} · {dateLabel(selected.createdAt, true)}</p>
        </div>
        {state?.url ? <a className={`${buttonClass} inline-block`} href={state.url} download={selected.filename || selected.title || 'imagen'}>Descargar original</a> : null}
      </div> : !visible.length ? <p className="py-12 text-center text-sm text-gray-500">No hay imágenes disponibles en este despacho.</p> : <div className="space-y-6 pb-2">
        {groups.filter(([id]) => filter === 'all' || id === filter).map(([id, name]) => <section key={id} aria-label={name}>
          <h3 className="mb-2 font-medium">{name}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.filter(photo => photo.group === id).map(photo => <GalleryTile key={photo.key} photo={photo} viewport={viewport} state={entries.get(photo.key)} load={load} onDecodeError={decodeFailed} onSelect={() => setSelectedKey(photo.key)} />)}
          </div>
        </section>)}
      </div>}
    </div>
  </DialogContent>;
}

function ImageStatus({ state, onRetry }: { state?: ImageState; onRetry: () => void }) {
  return state?.status === 'error' ? <div className="space-y-2 p-3 text-center"><p role="alert" className="break-words text-xs text-red-700">{state.error}</p><button type="button" className={buttonClass} onClick={onRetry}>Volver a cargar imagen</button></div> : <p role="status" className="p-4 text-xs text-gray-500">{state ? 'Cargando imagen…' : 'Vista previa de imagen'}</p>;
}

function GalleryTile({ photo, viewport, state, load, onDecodeError, onSelect }: { photo: Photo; viewport: RefObject<HTMLDivElement>; state?: ImageState; load: (photo: Photo, retry?: boolean, priority?: boolean) => void; onDecodeError: (photo: Photo) => void; onSelect: () => void }) {
  const tile = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = tile.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') { load(photo); return; }
    const observer = new IntersectionObserver(events => {
      if (events.some(event => event.isIntersecting)) { load(photo); observer.disconnect(); }
    }, { root: viewport.current, rootMargin: '200px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [photo.key, viewport, load]);

  return <div ref={tile} className="min-w-0 space-y-2 rounded border bg-white p-2">
    <button type="button" aria-label={`Ampliar imagen: ${photo.title}`} className="flex h-36 w-full items-center justify-center overflow-hidden rounded bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700" onClick={onSelect}>
      {state?.status === 'ready' && state.url ? <img src={state.url} alt={photo.title} onError={() => onDecodeError(photo)} className="h-full w-full object-contain" /> : <span className="p-2 text-xs text-gray-500">{state?.status === 'error' ? 'Imagen no disponible · Ver detalle' : state ? 'Cargando imagen…' : 'Ver imagen'}</span>}
    </button>
    <p className="break-words text-xs font-medium">{photo.title}</p>
    <p className="break-all text-xs text-gray-500">{photo.filename}</p>
    {state?.status === 'error' ? <button type="button" className="text-xs text-cyan-800 underline" onClick={() => load(photo, true)}>Volver a cargar imagen</button> : null}
  </div>;
}
