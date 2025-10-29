'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

type Asset = {
  id: string;
  code: string;
  name: string;
  location?: string | null;
};

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
  pages: number;
};

type AssetPickerProps = {
  label?: string;
  placeholder?: string;
  value?: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
  required?: boolean;
};

export default function AssetPicker({
  label = 'Activo',
  placeholder = 'Buscar activo por nombre, código o ubicación…',
  value,
  onChange,
  disabled,
  required,
}: AssetPickerProps) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const { data: assets, isLoading, error } = useApiSWR<PaginatedResponse<Asset> | Asset[]>(
    'assets',
    token,
    tenantSlug
  );

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Normalizar lista de activos (acepta array o respuesta paginada)
  const list: Asset[] = useMemo(() => {
    if (Array.isArray(assets)) return assets;
    if (Array.isArray((assets as any)?.items)) return (assets as any).items;
    return [];
  }, [assets]);

  const selectedAsset = useMemo(() => {
    if (!value) return null;
    return list.find(a => a.code === value) || null;
  }, [list, value]);

  const norm = (s?: string | null) =>
    (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  const filtered: Asset[] = useMemo(() => {
    const nq = norm(q);
    if (!nq) return list;
    return list.filter(a => {
      const bag = `${a.name} ${a.code} ${a.location || ''}`;
      return norm(bag).includes(nq);
    });
  }, [list, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of filtered) {
      const key = a.location?.trim() || 'Sin ubicación';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }

    const entries = Array.from(map.entries()).sort(([l1], [l2]) =>
      l1.localeCompare(l2, 'es', { sensitivity: 'base' })
    );
    for (const [, arr] of entries) {
      arr.sort((x, y) => x.name.localeCompare(y.name, 'es', { sensitivity: 'base' }));
    }
    return entries;
  }, [filtered]);

  return (
    <div className="w-full" ref={rootRef}>
      <label className="block text-sm font-medium mb-1">
        {label}{required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </label>

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          className={`w-full text-left border rounded-xl px-3 py-2 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50
            ${selectedAsset ? '' : 'text-gray-500'}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {selectedAsset ? (
            <span className="flex flex-col">
              <span className="font-medium">{selectedAsset.name}</span>
              <span className="text-xs text-gray-500">
                {selectedAsset.code}{selectedAsset.location ? ` · ${selectedAsset.location}` : ''}
              </span>
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
        </button>

        {open && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border bg-white shadow-xl" role="listbox">
            <div className="p-2 border-b">
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Escribe para filtrar…"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {isLoading && <div className="p-3 text-sm text-gray-500">Cargando activos…</div>}
            {error && !isLoading && <div className="p-3 text-sm text-red-600">Error cargando activos.</div>}
            {!isLoading && !error && grouped.length === 0 && (
              <div className="p-3 text-sm text-gray-500">Sin resultados.</div>
            )}

            <div className="max-h-72 overflow-auto">
              {grouped.map(([loc, arr]) => (
                <div key={loc} className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold uppercase text-gray-500 bg-gray-50">
                    {loc}
                  </div>
                  <ul>
                    {arr.map((a) => {
                      const isSel = a.code === value;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onChange(a.code);
                              setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${isSel ? 'bg-blue-50' : ''}`}
                          >
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-gray-500">{a.code}</div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
