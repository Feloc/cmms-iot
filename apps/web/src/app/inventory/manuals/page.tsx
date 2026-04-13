'use client';

import Link from 'next/link';
import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';

type InventoryMatch = {
  id: string;
  sku: string;
  name: string;
  oemPartNo?: string | null;
  itemNo?: string | null;
  systemGroup?: string | null;
  description?: string | null;
  qty?: number | null;
};

type ManualHotspot = {
  id: string;
  itemNo: string;
  label: string;
  oemPartNo: string;
  inventoryItemSku: string;
  x: number;
  y: number;
  width: number;
  height: number;
  qtyHint: string;
  notes: string;
};

type ManualPage = {
  id: string;
  pageNumber: number;
  title: string;
  imageUrl: string;
  hotspots: ManualHotspot[];
};

type SavedManualSummary = {
  id: string;
  brand?: string | null;
  equipmentModel: string;
  variant?: string | null;
  name: string;
  sourcePdfUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pageCount: number;
  hotspotCount: number;
};

type SavedManualDetail = {
  id: string;
  brand?: string | null;
  equipmentModel: string;
  variant?: string | null;
  name: string;
  sourcePdfUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
  pageCount: number;
  hotspotCount: number;
  pages: Array<{
    id: string;
    pageNumber: number;
    title?: string | null;
    imageUrl: string;
    hotspots: Array<{
      id: string;
      itemNo: string;
      label?: string | null;
      oemPartNo?: string | null;
      inventoryItemSku?: string | null;
      x: number;
      y: number;
      width: number;
      height: number;
      qtyHint?: number | null;
      notes?: string | null;
    }>;
  }>;
};

type DragDraft = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPage(nextPageNumber = 1): ManualPage {
  return {
    id: uid(),
    pageNumber: nextPageNumber,
    title: '',
    imageUrl: '',
    hotspots: [],
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function buildHotspotLabel(hotspot: ManualHotspot) {
  return hotspot.label || hotspot.oemPartNo || (hotspot.itemNo ? `Item ${hotspot.itemNo}` : 'Hotspot');
}

function normalizeManualAssetPath(value: string) {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/');
  if (!normalized) return '';
  if (/^(https?:|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  const sanitized = normalized.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
  return `/${sanitized}`;
}

export default function InventoryManualsPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const imageWrapRef = useRef<HTMLDivElement | null>(null);

  const [brand, setBrand] = useState('HELI');
  const [equipmentModel, setEquipmentModel] = useState('');
  const [variant, setVariant] = useState('');
  const [manualName, setManualName] = useState('');
  const [sourcePdfUrl, setSourcePdfUrl] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  const [pages, setPages] = useState<ManualPage[]>([emptyPage(1)]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('');
  const [dragDraft, setDragDraft] = useState<DragDraft | null>(null);

  const [searchQ, setSearchQ] = useState('');
  const [savedManualSearch, setSavedManualSearch] = useState('');
  const [loadedManualId, setLoadedManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const savedManualsPath = useMemo(() => {
    if (!isAdmin) return null;
    const qs = new URLSearchParams();
    if (savedManualSearch.trim()) qs.set('q', savedManualSearch.trim());
    return qs.toString() ? `/inventory/manuals?${qs.toString()}` : '/inventory/manuals';
  }, [isAdmin, savedManualSearch]);

  const { data: savedManuals, mutate: mutateSavedManuals } = useApiSWR<SavedManualSummary[]>(
    savedManualsPath,
    auth.token,
    auth.tenantSlug,
  );

  const loadedManualPath = useMemo(() => {
    if (!loadedManualId) return null;
    return `/inventory/manuals/${loadedManualId}`;
  }, [loadedManualId]);

  const { data: loadedManual } = useApiSWR<SavedManualDetail | null>(
    loadedManualPath,
    auth.token,
    auth.tenantSlug,
  );

  useEffect(() => {
    setSelectedPageId((current) => {
      if (!pages.length) return '';
      if (current && pages.some((page) => page.id === current)) return current;
      return pages[0]?.id || '';
    });
  }, [pages]);

  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId],
  );

  const selectedHotspot = useMemo(
    () => selectedPage?.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null,
    [selectedPage, selectedHotspotId],
  );

  useEffect(() => {
    if (!selectedPage) {
      setSelectedHotspotId('');
      return;
    }
    const exists = selectedPage.hotspots.some((hotspot) => hotspot.id === selectedHotspotId);
    if (!exists) setSelectedHotspotId('');
  }, [selectedPage?.id, selectedHotspotId]);

  useEffect(() => {
    if (!selectedHotspot) return;
    if (selectedHotspot.inventoryItemSku) {
      setSearchQ(selectedHotspot.inventoryItemSku);
      return;
    }
    setSearchQ(selectedHotspot.oemPartNo || selectedHotspot.label || selectedHotspot.itemNo || '');
  }, [selectedHotspot?.id]);

  const searchPath = useMemo(() => {
    if (!selectedHotspot || !searchQ.trim() || !isAdmin) return null;
    const qs = new URLSearchParams({ q: searchQ.trim() });
    return `/inventory/search?${qs.toString()}`;
  }, [selectedHotspot?.id, searchQ, isAdmin]);

  const { data: inventoryMatches } = useApiSWR<InventoryMatch[]>(searchPath, auth.token, auth.tenantSlug);

  useEffect(() => {
    if (!loadedManual) return;
    setBrand(String(loadedManual.brand || ''));
    setEquipmentModel(String(loadedManual.equipmentModel || ''));
    setVariant(String(loadedManual.variant || ''));
    setManualName(String(loadedManual.name || ''));
    setSourcePdfUrl(String(loadedManual.sourcePdfUrl || ''));
    setReplaceExisting(false);
    setPages(
      (loadedManual.pages ?? []).map((page) => ({
        id: uid(),
        pageNumber: Number(page.pageNumber || 1),
        title: String(page.title || ''),
        imageUrl: String(page.imageUrl || ''),
        hotspots: (page.hotspots ?? []).map((hotspot) => ({
          id: uid(),
          itemNo: String(hotspot.itemNo || ''),
          label: String(hotspot.label || ''),
          oemPartNo: String(hotspot.oemPartNo || ''),
          inventoryItemSku: String(hotspot.inventoryItemSku || ''),
          x: Number(hotspot.x || 0),
          y: Number(hotspot.y || 0),
          width: Number(hotspot.width || 0),
          height: Number(hotspot.height || 0),
          qtyHint:
            hotspot.qtyHint !== null && hotspot.qtyHint !== undefined && Number.isFinite(Number(hotspot.qtyHint))
              ? String(hotspot.qtyHint)
              : '',
          notes: String(hotspot.notes || ''),
        })),
      })),
    );
    setSelectedPageId('');
    setSelectedHotspotId('');
    setInfo(`Manual cargado: ${loadedManual.name}`);
    setErr('');
  }, [loadedManual?.id]);

  function startNewManual() {
    setLoadedManualId('');
    setBrand('HELI');
    setEquipmentModel('');
    setVariant('');
    setManualName('');
    setSourcePdfUrl('');
    setReplaceExisting(false);
    setPages([emptyPage(1)]);
    setSelectedPageId('');
    setSelectedHotspotId('');
    setSearchQ('');
    setInfo('Editor limpiado para crear un manual nuevo.');
    setErr('');
  }

  function updateSelectedPage(patch: Partial<ManualPage>) {
    if (!selectedPage) return;
    setPages((current) =>
      current.map((page) => (page.id === selectedPage.id ? { ...page, ...patch } : page)),
    );
  }

  function updateSelectedHotspot(patch: Partial<ManualHotspot>) {
    if (!selectedPage || !selectedHotspot) return;
    setPages((current) =>
      current.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              hotspots: page.hotspots.map((hotspot) =>
                hotspot.id === selectedHotspot.id ? { ...hotspot, ...patch } : hotspot,
              ),
            },
      ),
    );
  }

  function addPage() {
    const nextPageNumber = (pages.reduce((max, page) => Math.max(max, Number(page.pageNumber || 0)), 0) || 0) + 1;
    const page = emptyPage(nextPageNumber);
    setPages((current) => [...current, page]);
    setSelectedPageId(page.id);
    setSelectedHotspotId('');
  }

  function duplicatePage() {
    if (!selectedPage) return;
    const nextPageNumber = (pages.reduce((max, page) => Math.max(max, Number(page.pageNumber || 0)), 0) || 0) + 1;
    const clonedPage: ManualPage = {
      ...selectedPage,
      id: uid(),
      pageNumber: nextPageNumber,
      title: selectedPage.title ? `${selectedPage.title} copia` : '',
      hotspots: selectedPage.hotspots.map((hotspot) => ({ ...hotspot, id: uid() })),
    };
    setPages((current) => [...current, clonedPage]);
    setSelectedPageId(clonedPage.id);
    setSelectedHotspotId('');
  }

  function removeSelectedPage() {
    if (!selectedPage) return;
    if (pages.length === 1) {
      setErr('Debe existir al menos una página en el manual.');
      return;
    }
    const remainingPages = pages.filter((page) => page.id !== selectedPage.id);
    setPages(remainingPages);
    setSelectedPageId(remainingPages[0]?.id || '');
    setSelectedHotspotId('');
    setErr('');
  }

  function removeSelectedHotspot() {
    if (!selectedPage || !selectedHotspot) return;
    setPages((current) =>
      current.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              hotspots: page.hotspots.filter((hotspot) => hotspot.id !== selectedHotspot.id),
            },
      ),
    );
    setSelectedHotspotId('');
  }

  function getRelativePercent(event: MouseEvent<HTMLDivElement>) {
    const rect = imageWrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    return { x, y };
  }

  function beginDrag(event: MouseEvent<HTMLDivElement>) {
    if (!selectedPage || !selectedPage.imageUrl) return;
    if ((event.target as HTMLElement).closest('[data-hotspot-id]')) return;
    const point = getRelativePercent(event);
    if (!point) return;
    setDragDraft({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y });
    setSelectedHotspotId('');
    setErr('');
  }

  function updateDrag(event: MouseEvent<HTMLDivElement>) {
    if (!dragDraft) return;
    const point = getRelativePercent(event);
    if (!point) return;
    setDragDraft((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : null,
    );
  }

  function finishDrag() {
    if (!selectedPage || !dragDraft) return;
    const x = roundPercent(Math.min(dragDraft.startX, dragDraft.currentX));
    const y = roundPercent(Math.min(dragDraft.startY, dragDraft.currentY));
    const width = roundPercent(Math.abs(dragDraft.currentX - dragDraft.startX));
    const height = roundPercent(Math.abs(dragDraft.currentY - dragDraft.startY));

    if (width < 0.4 || height < 0.4) {
      setDragDraft(null);
      return;
    }

    const nextIndex = selectedPage.hotspots.length + 1;
    const hotspot: ManualHotspot = {
      id: uid(),
      itemNo: String(nextIndex),
      label: '',
      oemPartNo: '',
      inventoryItemSku: '',
      x,
      y,
      width,
      height,
      qtyHint: '1',
      notes: '',
    };

    setPages((current) =>
      current.map((page) =>
        page.id !== selectedPage.id
          ? page
          : {
              ...page,
              hotspots: [...page.hotspots, hotspot],
            },
      ),
    );
    setSelectedHotspotId(hotspot.id);
    setDragDraft(null);
  }

  function cancelDrag() {
    setDragDraft(null);
  }

  const dragStyle = useMemo(() => {
    if (!dragDraft) return null;
    return {
      left: `${Math.min(dragDraft.startX, dragDraft.currentX)}%`,
      top: `${Math.min(dragDraft.startY, dragDraft.currentY)}%`,
      width: `${Math.abs(dragDraft.currentX - dragDraft.startX)}%`,
      height: `${Math.abs(dragDraft.currentY - dragDraft.startY)}%`,
    };
  }, [dragDraft]);

  const manifest = useMemo(() => {
    return {
      tenantSlug: auth.tenantSlug || '',
      brand: brand.trim() || null,
      equipmentModel: equipmentModel.trim(),
      variant: variant.trim() || null,
      name: manualName.trim() || (equipmentModel.trim() ? `Manual de partes ${equipmentModel.trim()}` : ''),
      sourcePdfUrl: sourcePdfUrl.trim() ? normalizeManualAssetPath(sourcePdfUrl) : null,
      replaceExisting,
      pages: pages
        .slice()
        .sort((a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
        .map((page) => ({
          pageNumber: Number(page.pageNumber || 0),
          title: page.title.trim() || null,
          imageUrl: normalizeManualAssetPath(page.imageUrl),
          hotspots: page.hotspots.map((hotspot) => ({
            itemNo: hotspot.itemNo.trim(),
            label: hotspot.label.trim() || null,
            oemPartNo: hotspot.oemPartNo.trim() || null,
            inventoryItemSku: hotspot.inventoryItemSku.trim() || null,
            x: Number(hotspot.x),
            y: Number(hotspot.y),
            width: Number(hotspot.width),
            height: Number(hotspot.height),
            qtyHint: hotspot.qtyHint.trim() ? Number(hotspot.qtyHint) : null,
            notes: hotspot.notes.trim() || null,
          })),
        })),
    };
  }, [auth.tenantSlug, brand, equipmentModel, manualName, pages, replaceExisting, sourcePdfUrl, variant]);

  const manifestJson = useMemo(() => JSON.stringify(manifest, null, 2), [manifest]);

  const canSave = useMemo(() => {
    return (
      !!auth.token &&
      !!auth.tenantSlug &&
      !!equipmentModel.trim() &&
      !!manualName.trim() &&
      pages.length > 0 &&
      pages.every((page) => Number(page.pageNumber) > 0 && !!page.imageUrl.trim())
    );
  }, [auth.tenantSlug, auth.token, equipmentModel, manualName, pages]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(manifestJson);
      setInfo('JSON copiado al portapapeles.');
      setErr('');
    } catch (error: any) {
      setErr(error?.message || 'No se pudo copiar el JSON.');
    }
  }

  async function saveManual() {
    if (!canSave || !auth.token || !auth.tenantSlug) return;
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const editingExisting = !!loadedManualId;
      const saved = await apiFetch<{ id: string; name: string }>(
        editingExisting ? `/inventory/manuals/${loadedManualId}` : '/inventory/manuals',
        {
          method: editingExisting ? 'PATCH' : 'POST',
          token: auth.token,
          tenantSlug: auth.tenantSlug,
          body: manifest,
        },
      );
      setLoadedManualId(saved.id);
      await mutateSavedManuals();
      setInfo(editingExisting ? 'Manual actualizado correctamente.' : 'Manual guardado correctamente.');
    } catch (error: any) {
      setErr(error?.message || 'No se pudo guardar el manual.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSavedManual(manual: SavedManualSummary) {
    if (!auth.token || !auth.tenantSlug) return;
    const ok = window.confirm(`Eliminar el manual "${manual.name}" para ${manual.equipmentModel}?`);
    if (!ok) return;

    setBusy(true);
    setErr('');
    setInfo('');
    try {
      await apiFetch(`/inventory/manuals/${manual.id}`, {
        method: 'DELETE',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      if (loadedManualId === manual.id) {
        startNewManual();
      } else {
        setLoadedManualId((current) => (current === manual.id ? '' : current));
      }
      await mutateSavedManuals();
      setInfo(`Manual eliminado: ${manual.name}`);
    } catch (error: any) {
      setErr(error?.message || 'No se pudo eliminar el manual.');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado. Manuales solo para ADMIN.</div>;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Editor de manuales de partes</h1>
          <p className="text-sm text-gray-600">
            Crea páginas, dibuja hotspots sobre la imagen y guarda el manifiesto del manual para usarlo en OS de diagnóstico.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory" className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Volver a inventario
          </Link>
          <button type="button" className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={startNewManual}>
            Nuevo manual
          </button>
          <button type="button" className="px-3 py-2 border rounded text-sm hover:bg-gray-50" onClick={copyJson}>
            Copiar JSON
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            onClick={saveManual}
            disabled={!canSave || busy}
          >
            {busy ? 'Guardando...' : loadedManualId ? 'Actualizar manual' : 'Guardar manual'}
          </button>
        </div>
      </div>

      {err ? <div className="border rounded bg-red-50 text-red-700 px-3 py-2 text-sm whitespace-pre-wrap">{err}</div> : null}
      {info ? <div className="border rounded bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{info}</div> : null}

      <section className="border rounded p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium">Manuales guardados</div>
            <div className="text-sm text-gray-600">
              Carga un manual existente en el editor o elimínalo si ya no aplica.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="border rounded px-3 py-2 text-sm min-w-[240px]"
              placeholder="Buscar por modelo, marca o nombre"
              value={savedManualSearch}
              onChange={(e) => setSavedManualSearch(e.target.value)}
            />
            <button type="button" className="px-3 py-2 border rounded text-sm" onClick={startNewManual}>
              Nuevo manual
            </button>
          </div>
        </div>

        {(savedManuals ?? []).length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {(savedManuals ?? []).map((manual) => {
              const isActive = manual.id === loadedManualId;
              return (
                <div key={manual.id} className={`border rounded p-3 space-y-2 ${isActive ? 'border-slate-900 bg-slate-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{manual.name}</div>
                      <div className="text-sm text-gray-600">
                        {[manual.brand, manual.equipmentModel, manual.variant].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{manual.pageCount} pág.</div>
                      <div>{manual.hotspotCount} hotspot(s)</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Actualizado: {manual.updatedAt ? new Date(manual.updatedAt).toLocaleString() : '-'}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="px-3 py-2 border rounded text-sm hover:bg-white"
                      onClick={() => {
                        setLoadedManualId(manual.id);
                        setInfo('');
                        setErr('');
                      }}
                    >
                      Cargar en editor
                    </button>
                    <button
                      type="button"
                      className="px-3 py-2 border rounded text-sm text-red-700 hover:bg-red-50"
                      onClick={() => deleteSavedManual(manual)}
                      disabled={busy}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No hay manuales guardados para este tenant todavía.</div>
        )}
      </section>

      <section className="border rounded p-4 bg-slate-50 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Marca</label>
            <input className="border rounded px-3 py-2 w-full" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Modelo</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={equipmentModel}
              onChange={(e) => setEquipmentModel(e.target.value)}
              placeholder="Ej: CBD20J-LI3"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Variante</label>
            <input className="border rounded px-3 py-2 w-full" value={variant} onChange={(e) => setVariant(e.target.value)} />
          </div>
          <div className="space-y-1 xl:col-span-2">
            <label className="text-sm font-medium">Nombre visible del manual</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Ej: Manual de partes CBD20J-LI3"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Ruta PDF fuente</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={sourcePdfUrl}
              onChange={(e) => setSourcePdfUrl(e.target.value)}
              placeholder="/manuals/cbd20j-li3/CBD20J-LI3.pdf"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
          Reemplazar manual existente para esta combinación marca/modelo/variante
        </label>
      </section>

      <div className="grid grid-cols-1 2xl:grid-cols-[280px_minmax(0,1fr)_420px] gap-4">
        <section className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium">Páginas</div>
            <div className="flex gap-2">
              <button type="button" className="px-2 py-1 border rounded text-sm" onClick={addPage}>
                Agregar
              </button>
              <button type="button" className="px-2 py-1 border rounded text-sm" onClick={duplicatePage} disabled={!selectedPage}>
                Duplicar
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {pages
              .slice()
              .sort((a, b) => Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
              .map((page) => {
                const active = page.id === selectedPage?.id;
                return (
                  <button
                    key={page.id}
                    type="button"
                    className={`w-full text-left border rounded px-3 py-2 ${active ? 'border-slate-900 bg-slate-100' : 'hover:bg-gray-50'}`}
                    onClick={() => {
                      setSelectedPageId(page.id);
                      setSelectedHotspotId('');
                    }}
                  >
                    <div className="font-medium text-sm">Pág. {page.pageNumber}</div>
                    <div className="text-xs text-gray-600 truncate">{page.title || page.imageUrl || 'Sin título'}</div>
                    <div className="text-xs text-gray-500 mt-1">{page.hotspots.length} hotspot(s)</div>
                  </button>
                );
              })}
          </div>

          {selectedPage ? (
            <div className="pt-2 border-t space-y-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Número de página</label>
                <input
                  type="number"
                  min={1}
                  className="border rounded px-3 py-2 w-full"
                  value={String(selectedPage.pageNumber)}
                  onChange={(e) => updateSelectedPage({ pageNumber: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Título</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={selectedPage.title}
                  onChange={(e) => updateSelectedPage({ title: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Ruta imagen</label>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={selectedPage.imageUrl}
                  onChange={(e) => updateSelectedPage({ imageUrl: e.target.value })}
                  placeholder="/manuals/cbd20j-li3/page-002.png"
                />
              </div>
              <button type="button" className="px-3 py-2 border rounded text-sm text-red-700" onClick={removeSelectedPage}>
                Eliminar página
              </button>
            </div>
          ) : null}
        </section>

        <section className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-medium">Lámina y hotspots</div>
              <div className="text-sm text-gray-600">
                Arrastra sobre la imagen para crear un hotspot nuevo. Luego edítalo en el panel derecho.
              </div>
            </div>
            {selectedHotspot ? (
              <button type="button" className="px-3 py-2 border rounded text-sm text-red-700" onClick={removeSelectedHotspot}>
                Eliminar hotspot
              </button>
            ) : null}
          </div>

          {selectedPage?.imageUrl ? (
            <div
              ref={imageWrapRef}
              className="relative border rounded overflow-hidden bg-white select-none"
              onMouseDown={beginDrag}
              onMouseMove={updateDrag}
              onMouseUp={finishDrag}
              onMouseLeave={cancelDrag}
            >
              <img
                src={normalizeManualAssetPath(selectedPage.imageUrl)}
                alt={selectedPage.title || `Página ${selectedPage.pageNumber}`}
                className="w-full h-auto block"
              />
              {selectedPage.hotspots.map((hotspot) => {
                const active = hotspot.id === selectedHotspotId;
                return (
                  <button
                    key={hotspot.id}
                    data-hotspot-id={hotspot.id}
                    type="button"
                    className={`absolute border-2 rounded ${active ? 'border-amber-500 bg-amber-300/20' : 'border-sky-500 bg-sky-300/15 hover:bg-sky-300/25'}`}
                    style={{
                      left: `${hotspot.x}%`,
                      top: `${hotspot.y}%`,
                      width: `${hotspot.width}%`,
                      height: `${hotspot.height}%`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedHotspotId(hotspot.id);
                    }}
                    title={buildHotspotLabel(hotspot)}
                  >
                    <span className={`absolute -top-2 left-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? 'bg-amber-500 text-white' : 'bg-sky-600 text-white'}`}>
                      {hotspot.itemNo || '?'}
                    </span>
                  </button>
                );
              })}
              {dragStyle ? <div className="absolute border-2 border-emerald-500 bg-emerald-300/20 rounded" style={dragStyle} /> : null}
            </div>
          ) : (
            <div className="border border-dashed rounded px-4 py-10 text-sm text-gray-600 bg-gray-50">
              Define una ruta de imagen para la página actual. Ejemplo: `/manuals/cbd20j-li3/page-002.png`
            </div>
          )}

          <div className="border rounded p-3 bg-slate-50 space-y-2">
            <div className="font-medium text-sm">Hotspots de la página</div>
            {selectedPage?.hotspots.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {selectedPage.hotspots.map((hotspot) => (
                  <button
                    key={hotspot.id}
                    type="button"
                    className={`text-left border rounded px-3 py-2 ${hotspot.id === selectedHotspotId ? 'border-slate-900 bg-white' : 'bg-white hover:bg-gray-50'}`}
                    onClick={() => setSelectedHotspotId(hotspot.id)}
                  >
                    <div className="font-medium text-sm">Item {hotspot.itemNo || '?'}</div>
                    <div className="text-xs text-gray-600 truncate">{buildHotspotLabel(hotspot)}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      x {hotspot.x} · y {hotspot.y} · w {hotspot.width} · h {hotspot.height}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-600">Todavía no hay hotspots en esta página.</div>
            )}
          </div>
        </section>

        <section className="border rounded p-4 space-y-4">
          <div>
            <div className="font-medium">Editor del hotspot</div>
            <div className="text-sm text-gray-600">
              Completa el número de item, nombre de la parte y el SKU del inventario si ya existe.
            </div>
          </div>

          {!selectedHotspot ? (
            <div className="text-sm text-gray-600">Selecciona un hotspot o crea uno arrastrando sobre la imagen.</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Item No.</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={selectedHotspot.itemNo}
                    onChange={(e) => updateSelectedHotspot({ itemNo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Cantidad sugerida</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="border rounded px-3 py-2 w-full"
                    value={selectedHotspot.qtyHint}
                    onChange={(e) => updateSelectedHotspot({ qtyHint: e.target.value })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">Nombre / etiqueta</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={selectedHotspot.label}
                    onChange={(e) => updateSelectedHotspot({ label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Parte OEM</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={selectedHotspot.oemPartNo}
                    onChange={(e) => updateSelectedHotspot({ oemPartNo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">SKU inventario</label>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={selectedHotspot.inventoryItemSku}
                    onChange={(e) => updateSelectedHotspot({ inventoryItemSku: e.target.value })}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium">Notas</label>
                  <textarea
                    className="border rounded px-3 py-2 w-full min-h-[88px]"
                    value={selectedHotspot.notes}
                    onChange={(e) => updateSelectedHotspot({ notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">X</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="border rounded px-3 py-2 w-full"
                    value={String(selectedHotspot.x)}
                    onChange={(e) => updateSelectedHotspot({ x: clampPercent(Number(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Y</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="border rounded px-3 py-2 w-full"
                    value={String(selectedHotspot.y)}
                    onChange={(e) => updateSelectedHotspot({ y: clampPercent(Number(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Width</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="border rounded px-3 py-2 w-full"
                    value={String(selectedHotspot.width)}
                    onChange={(e) => updateSelectedHotspot({ width: clampPercent(Number(e.target.value) || 0) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Height</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="border rounded px-3 py-2 w-full"
                    value={String(selectedHotspot.height)}
                    onChange={(e) => updateSelectedHotspot({ height: clampPercent(Number(e.target.value) || 0) })}
                  />
                </div>
              </div>

              <div className="border rounded p-3 bg-slate-50 space-y-2">
                <div className="font-medium text-sm">Buscar repuesto en inventario</div>
                <input
                  className="border rounded px-3 py-2 w-full bg-white"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="SKU / OEM / nombre"
                />
                {searchQ.trim() && (inventoryMatches ?? []).length > 0 ? (
                  <div className="max-h-72 overflow-auto border rounded bg-white">
                    {(inventoryMatches ?? []).map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50"
                        onClick={() =>
                          updateSelectedHotspot({
                            inventoryItemSku: match.sku,
                            oemPartNo: selectedHotspot.oemPartNo || match.oemPartNo || '',
                            label: selectedHotspot.label || match.name || '',
                          })
                        }
                      >
                        <div className="font-medium text-sm">{match.sku} · {match.name}</div>
                        <div className="text-xs text-gray-600">
                          {[match.oemPartNo, match.itemNo ? `Item ${match.itemNo}` : null, match.systemGroup].filter(Boolean).join(' · ') || match.description || ''}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchQ.trim() ? (
                  <div className="text-sm text-gray-600">Sin coincidencias para esa búsqueda.</div>
                ) : null}
              </div>
            </>
          )}

          <div className="border rounded p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-sm">JSON del manifiesto</div>
              <span className="text-xs text-gray-500">{pages.length} página(s)</span>
            </div>
            <textarea className="border rounded px-3 py-2 w-full min-h-[320px] font-mono text-xs bg-white" readOnly value={manifestJson} />
          </div>
        </section>
      </div>
    </div>
  );
}
