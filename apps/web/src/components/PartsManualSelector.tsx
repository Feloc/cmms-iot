'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiBase } from '@/lib/api';

export type PartsManualInventoryMatch = {
  id: string;
  sku: string;
  name: string;
  oemPartNo?: string | null;
  itemNo?: string | null;
  systemGroup?: string | null;
  description?: string | null;
  qty?: number | null;
};

export type PartsManualHotspot = {
  id: string;
  itemNo: string;
  label?: string | null;
  oemPartNo?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  qtyHint?: number | null;
  notes?: string | null;
  freeText: string;
  matches: PartsManualInventoryMatch[];
  matchCount: number;
};

export type PartsManualPage = {
  id: string;
  pageNumber: number;
  title?: string | null;
  imageUrl: string;
  hotspots: PartsManualHotspot[];
};

export type PartsManual = {
  id: string;
  brand?: string | null;
  equipmentModel: string;
  variant?: string | null;
  name: string;
  sourcePdfUrl?: string | null;
  pages: PartsManualPage[];
};

export type PartsManualHotspotUsage = {
  requiredQty?: number;
  replacedQty?: number;
};

type Props = {
  manual?: PartsManual | null;
  loading?: boolean;
  modelLabel?: string | null;
  disabled?: boolean;
  hotspotUsageById?: Record<string, PartsManualHotspotUsage>;
  onAddInventoryItem: (item: PartsManualInventoryMatch, qty: number) => Promise<void> | void;
  onAddFreeText: (freeText: string, qty: number) => Promise<void> | void;
};

function resolveImageUrl(imageUrl: string) {
  const normalized = String(imageUrl || '')
    .trim()
    .replace(/\\/g, '/');
  if (!normalized) return '';
  if (/^(https?:|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  const sanitized = normalized.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
  if (sanitized.startsWith('manuals/')) return `/${sanitized}`;
  const base = String(apiBase || '').replace(/\/$/, '');
  return `${base}/${sanitized}`;
}

export function PartsManualSelector({
  manual,
  loading = false,
  modelLabel,
  disabled = false,
  hotspotUsageById,
  onAddInventoryItem,
  onAddFreeText,
}: Props) {
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [selectedHotspotId, setSelectedHotspotId] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [showLabels, setShowLabels] = useState(true);
  const [hotspotQuery, setHotspotQuery] = useState('');

  useEffect(() => {
    const firstPageId = manual?.pages?.[0]?.id ?? '';
    setSelectedPageId(firstPageId);
  }, [manual?.id, manual?.pages?.[0]?.id]);

  const selectedPage = useMemo(() => {
    return manual?.pages.find((page) => page.id === selectedPageId) ?? manual?.pages?.[0] ?? null;
  }, [manual?.pages, selectedPageId]);

  useEffect(() => {
    if (!selectedPage) {
      setSelectedHotspotId('');
      return;
    }
    const exists = selectedPage.hotspots.some((hotspot) => hotspot.id === selectedHotspotId);
    if (!exists) setSelectedHotspotId('');
  }, [selectedPage?.id, selectedHotspotId]);

  const selectedHotspot = useMemo(() => {
    return selectedPage?.hotspots.find((hotspot) => hotspot.id === selectedHotspotId) ?? null;
  }, [selectedPage, selectedHotspotId]);

  useEffect(() => {
    if (!selectedHotspot) {
      setQty(1);
      return;
    }
    const nextQty = Number(selectedHotspot.qtyHint ?? 1);
    setQty(Number.isFinite(nextQty) && nextQty > 0 ? nextQty : 1);
  }, [selectedHotspot?.id]);

  useEffect(() => {
    setZoom(100);
    setHotspotQuery('');
  }, [selectedPage?.id]);

  const hotspotCount = useMemo(
    () => manual?.pages?.reduce((sum, page) => sum + page.hotspots.length, 0) ?? 0,
    [manual?.pages],
  );

  const pageHotspots = useMemo(() => {
    if (!selectedPage) return [];
    return [...selectedPage.hotspots].sort((a, b) => {
      const left = Number(a.itemNo);
      const right = Number(b.itemNo);
      if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
      return a.itemNo.localeCompare(b.itemNo) || String(a.label || '').localeCompare(String(b.label || ''));
    });
  }, [selectedPage]);

  const filteredHotspots = useMemo(() => {
    const query = hotspotQuery.trim().toLowerCase();
    if (!query) return pageHotspots;
    return pageHotspots.filter((hotspot) =>
      [hotspot.itemNo, hotspot.label, hotspot.oemPartNo, hotspot.notes, hotspot.freeText]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [hotspotQuery, pageHotspots]);

  const pageAddedHotspotCount = useMemo(
    () =>
      pageHotspots.filter((hotspot) => {
        const usage = hotspotUsageById?.[hotspot.id];
        return Number(usage?.requiredQty ?? 0) > 0 || Number(usage?.replacedQty ?? 0) > 0;
      }).length,
    [hotspotUsageById, pageHotspots],
  );

  const selectedHotspotUsage = selectedHotspot ? hotspotUsageById?.[selectedHotspot.id] : undefined;

  async function handleAddInventoryItem(item: PartsManualInventoryMatch) {
    const nextQty = Number(qty ?? 1);
    if (!Number.isFinite(nextQty) || nextQty <= 0) return;
    await Promise.resolve(onAddInventoryItem(item, nextQty));
  }

  async function handleAddFreeText() {
    if (!selectedHotspot?.freeText) return;
    const nextQty = Number(qty ?? 1);
    if (!Number.isFinite(nextQty) || nextQty <= 0) return;
    await Promise.resolve(onAddFreeText(selectedHotspot.freeText, nextQty));
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm">
      <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.10),_transparent_30%),linear-gradient(135deg,#ffffff_0%,#f8fafc_45%,#eef2ff_100%)] px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-2">
            <div>
              <h3 className="font-semibold text-slate-900">Manual de partes</h3>
              <div className="text-sm text-slate-600">
                {manual ? (
                  <>
                    {manual.name}
                    {manual.brand ? ` · ${manual.brand}` : ''}
                    {manual.equipmentModel ? ` · ${manual.equipmentModel}` : ''}
                    {manual.variant ? ` · ${manual.variant}` : ''}
                  </>
                ) : modelLabel ? (
                  <>Modelo detectado: {modelLabel}</>
                ) : (
                  <>Selecciona un activo con modelo para cargar el manual.</>
                )}
              </div>
            </div>

            {manual ? (
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {manual.pages.length} página{manual.pages.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {hotspotCount} hotspot{hotspotCount === 1 ? '' : 's'}
                </span>
                {selectedPage ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                    Viendo pág. {selectedPage.pageNumber}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {manual?.sourcePdfUrl ? (
              <a
                className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                href={resolveImageUrl(manual.sourcePdfUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir PDF fuente
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {loading ? <div className="text-sm text-slate-600">Buscando manual configurado para este modelo...</div> : null}

        {!loading && !manual ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
            No hay un manual de partes configurado para este modelo todavía.
          </div>
        ) : null}

        {manual ? (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1.55fr)_minmax(330px,0.95fr)]">
              <aside className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Páginas del manual</div>
                      <div className="text-xs text-slate-500">Cambia rápidamente entre vistas del despiece.</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {manual.pages.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {manual.pages.map((page) => {
                      const isActive = page.id === (selectedPage?.id ?? '');
                      return (
                        <button
                          key={page.id}
                          type="button"
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:border-slate-300 hover:bg-white'
                          }`}
                          onClick={() => setSelectedPageId(page.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold">Pág. {page.pageNumber}</div>
                              <div className={`mt-1 text-xs ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                                {page.title || 'Sin título configurado'}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                isActive ? 'bg-white/15 text-white' : 'bg-white text-slate-600'
                              }`}
                            >
                              {page.hotspots.length}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Atajos</div>
                  <div className="mt-2 space-y-2 text-xs text-slate-600">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Haz clic en el número sobre la imagen para seleccionar la pieza.</div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Usa el buscador para ubicar el item por número, nombre u OEM.</div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">Si no existe coincidencia exacta, agrega la pieza como texto libre.</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Estado visual</div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-sky-500" />
                      <span>Disponible para agregar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-lime-500" />
                      <span>Ya agregado en repuestos necesarios</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-emerald-600" />
                      <span>Marcado como cambiado</span>
                    </div>
                  </div>
                </div>
              </aside>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {selectedPage ? `Página ${selectedPage.pageNumber}` : 'Vista de imagen'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {selectedPage?.title || 'Selecciona un número o un hotspot para revisar el repuesto.'}
                      {selectedPage ? ` · ${pageAddedHotspotCount} ya agregado(s)` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <span>Zoom</span>
                      <input
                        type="range"
                        min={100}
                        max={175}
                        step={5}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                      />
                      <span className="w-10 text-right font-medium text-slate-900">{zoom}%</span>
                    </label>

                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        showLabels
                          ? 'border-sky-200 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      onClick={() => setShowLabels((current) => !current)}
                    >
                      {showLabels ? 'Ocultar etiquetas' : 'Mostrar etiquetas'}
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-3">
                  <div className="rounded-[20px] border border-white/70 bg-white/80 p-2 shadow-inner">
                    {selectedPage ? (
                      <div className="overflow-auto rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
                        <div className="relative min-w-[720px]" style={{ width: `${zoom}%` }}>
                          <img
                            src={resolveImageUrl(selectedPage.imageUrl)}
                            alt={selectedPage.title ? `Página ${selectedPage.pageNumber}: ${selectedPage.title}` : `Página ${selectedPage.pageNumber}`}
                            className="block h-auto w-full"
                          />
                          {selectedPage.hotspots.map((hotspot) => {
                            const isActive = hotspot.id === selectedHotspotId;
                            const usage = hotspotUsageById?.[hotspot.id];
                            const hasRequired = Number(usage?.requiredQty ?? 0) > 0;
                            const hasReplaced = Number(usage?.replacedQty ?? 0) > 0;
                            return (
                              <button
                                key={hotspot.id}
                                type="button"
                                className={`absolute rounded-xl border-2 transition ${
                                  isActive
                                    ? hasReplaced
                                      ? 'border-emerald-600 bg-emerald-300/25 shadow-[0_0_0_3px_rgba(5,150,105,0.18)]'
                                      : hasRequired
                                        ? 'border-lime-500 bg-lime-300/25 shadow-[0_0_0_3px_rgba(132,204,22,0.18)]'
                                        : 'border-amber-500 bg-amber-300/20 shadow-[0_0_0_3px_rgba(245,158,11,0.18)]'
                                    : hasReplaced
                                      ? 'border-emerald-600/90 bg-emerald-300/15 hover:bg-emerald-300/25'
                                      : hasRequired
                                        ? 'border-lime-500/90 bg-lime-300/15 hover:bg-lime-300/25'
                                        : 'border-sky-500/80 bg-sky-300/10 hover:bg-sky-300/20'
                                }`}
                                style={{
                                  left: `${hotspot.x}%`,
                                  top: `${hotspot.y}%`,
                                  width: `${hotspot.width}%`,
                                  height: `${hotspot.height}%`,
                                }}
                                onClick={() => setSelectedHotspotId(hotspot.id)}
                                title={hotspot.freeText}
                              >
                                {showLabels || isActive ? (
                                  <span
                                    className={`absolute -top-2 left-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      hasReplaced
                                        ? 'bg-emerald-600 text-white'
                                        : hasRequired
                                          ? 'bg-lime-600 text-white'
                                          : isActive
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-sky-600 text-white'
                                    }`}
                                  >
                                    {hotspot.itemNo}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="px-4 py-8 text-sm text-slate-600">Este manual no tiene páginas configuradas.</div>
                    )}
                  </div>
                </div>
              </section>

              <aside className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Partes de esta página</div>
                      <div className="text-xs text-slate-500">
                        {filteredHotspots.length} de {pageHotspots.length} visibles
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {pageHotspots.length}
                    </span>
                  </div>

                  <div className="mt-3">
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                      placeholder="Buscar item, nombre u OEM"
                      value={hotspotQuery}
                      onChange={(e) => setHotspotQuery(e.target.value)}
                    />
                  </div>

                  <div className="mt-3 max-h-[280px] space-y-2 overflow-auto pr-1">
                    {filteredHotspots.length > 0 ? (
                      filteredHotspots.map((hotspot) => {
                        const isActive = hotspot.id === selectedHotspotId;
                        const usage = hotspotUsageById?.[hotspot.id];
                        const hasRequired = Number(usage?.requiredQty ?? 0) > 0;
                        const hasReplaced = Number(usage?.replacedQty ?? 0) > 0;
                        return (
                          <button
                            key={hotspot.id}
                            type="button"
                            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                              isActive
                                ? hasReplaced
                                  ? 'border-emerald-300 bg-emerald-50'
                                  : hasRequired
                                    ? 'border-lime-300 bg-lime-50'
                                    : 'border-amber-300 bg-amber-50'
                                : hasReplaced
                                  ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
                                  : hasRequired
                                    ? 'border-lime-200 bg-lime-50/60 hover:border-lime-300'
                                    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
                            }`}
                            onClick={() => setSelectedHotspotId(hotspot.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900">Item {hotspot.itemNo}</div>
                                <div className="mt-1 truncate text-xs text-slate-600">
                                  {hotspot.label || hotspot.oemPartNo || 'Parte sin nombre configurado'}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {(hasRequired || hasReplaced) && (
                                  <span
                                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                      hasReplaced
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-lime-100 text-lime-700'
                                    }`}
                                  >
                                    {hasReplaced
                                      ? `Cambiado ${Number(usage?.replacedQty ?? 0)}`
                                      : `Agregado ${Number(usage?.requiredQty ?? 0)}`}
                                  </span>
                                )}
                                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                                  {hotspot.matchCount}
                                </span>
                              </div>
                            </div>
                            <div className="mt-2 truncate text-[11px] text-slate-500">
                              {[hotspot.oemPartNo, hotspot.notes].filter(Boolean).join(' · ') || hotspot.freeText}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                        No hay partes que coincidan con ese filtro en esta página.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  {!selectedHotspot ? (
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="font-medium text-slate-900">Selecciona una pieza</div>
                      <div>
                        Al elegir un hotspot verás sus datos, la cantidad sugerida y las coincidencias disponibles en inventario.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                            Item {selectedHotspot.itemNo}
                          </div>
                          <div className="flex items-center gap-2">
                            {(Number(selectedHotspotUsage?.requiredQty ?? 0) > 0 ||
                              Number(selectedHotspotUsage?.replacedQty ?? 0) > 0) && (
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                  Number(selectedHotspotUsage?.replacedQty ?? 0) > 0
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-lime-100 text-lime-700'
                                }`}
                              >
                                {Number(selectedHotspotUsage?.replacedQty ?? 0) > 0
                                  ? `Cambiado x${Number(selectedHotspotUsage?.replacedQty ?? 0)}`
                                  : `Agregado x${Number(selectedHotspotUsage?.requiredQty ?? 0)}`}
                              </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                              {selectedHotspot.matchCount} coincidencia{selectedHotspot.matchCount === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                        <div className="text-lg font-semibold leading-tight text-slate-900">
                          {selectedHotspot.label || 'Parte sin nombre configurado'}
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-600">
                          {[selectedHotspot.oemPartNo, selectedHotspot.notes].filter(Boolean).join(' · ') || selectedHotspot.freeText}
                        </div>
                      </div>

                      <div className="mt-4 space-y-1">
                        <label className="text-sm font-medium text-slate-900">Cantidad</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                          value={String(qty)}
                          onChange={(e) => setQty(Number(e.target.value))}
                        />
                      </div>

                      {selectedHotspot.matches.length > 0 ? (
                        <div className="mt-4 space-y-2">
                          <div className="text-sm font-medium text-slate-900">Coincidencias en inventario</div>
                          <div className="space-y-2">
                            {selectedHotspot.matches.map((match) => (
                              <div key={match.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {match.sku} · {match.name}
                                  </div>
                                  <div className="mt-1 text-xs text-slate-600">
                                    {[match.oemPartNo, match.itemNo ? `Item ${match.itemNo}` : null, match.systemGroup]
                                      .filter(Boolean)
                                      .join(' · ') || match.description || 'Sin detalle adicional'}
                                  </div>
                                  <div className="mt-2 text-xs text-slate-500">Stock actual: {Number(match.qty ?? 0)}</div>
                                </div>
                                <button
                                  type="button"
                                  className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                                  onClick={() => handleAddInventoryItem(match)}
                                  disabled={disabled}
                                >
                                  Agregar repuesto
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-600">
                          No encontré una coincidencia exacta en inventario para este hotspot.
                        </div>
                      )}

                      <button
                        type="button"
                        className="mt-4 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                        onClick={handleAddFreeText}
                        disabled={disabled}
                      >
                        Agregar como texto libre
                      </button>
                    </>
                  )}
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
