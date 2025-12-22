'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

type Asset = {
  id: string;
  code: string;
  name: string;
  customer?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number };

/**
 * Selector de activo para OS.
 * - Permite buscar por texto (cliente/serie/nombre/código)
 * - Al seleccionar, devuelve assetCode y el asset completo
 */
export function AssetSearchSelect(props: {
  value?: string; // assetCode seleccionado
  onChange: (assetCode: string, asset?: Asset) => void;
  placeholder?: string;
}) {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const [input, setInput] = useState(props.value ?? '');

  useEffect(() => setInput(props.value ?? ''), [props.value]);

  const path = useMemo(() => {
    const s = input.trim();
    if (!s) return null;
    const qs = new URLSearchParams({ search: s, size: '10', page: '1' });
    return `/assets?${qs.toString()}`;
  }, [input]);

  const { data } = useApiSWR<Paginated<Asset>>(path, auth?.token, auth?.tenantSlug);
  const items = data?.items ?? [];

  const showDropdown = input.trim().length > 0 && items.length > 0;

  return (
    <div className="relative">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={props.placeholder ?? 'Busca por cliente o serie (o código)...'}
        className="border rounded px-3 py-2 w-full"
      />
      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full rounded border bg-white shadow max-h-64 overflow-auto">
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50"
              onClick={() => {
                props.onChange(a.code, a);
                setInput(a.code);
              }}
            >
              <div className="font-medium">{a.code} — {a.name}</div>
              <div className="text-xs text-gray-600">
                Cliente: {a.customer ?? '-'} · Serie: {a.serialNumber ?? '-'} · {a.brand ?? ''} {a.model ?? ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
