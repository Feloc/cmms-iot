'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

type Item = { id: string; code: string; name: string };

export default function CodeAutocomplete({
  kind,            // 'symptom' | 'cause' | 'remedy'
  label,
  valueId,         // id actualmente seleccionado (del formulario)
  onChangeId,      // setea el id cuando el usuario elige un ítem o limpia
  otherText,       // texto libre "Otro"
  onChangeOther,   // setea el texto libre
  assetType,
}: {
  kind: 'symptom' | 'cause' | 'remedy';
  label: string;
  valueId?: string | null;
  onChangeId: (id?: string | null) => void;
  otherText?: string | null;
  onChangeOther?: (t?: string | null) => void;
  assetType?: string;
}) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Buscar
  const path = useMemo(() => {
    if (!token || !tenantSlug) return null;
    const base = kind === 'symptom' ? '/catalog/symptom-codes'
               : kind === 'cause'   ? '/catalog/cause-codes'
                                    : '/catalog/remedy-codes';
    const sp = new URLSearchParams();
    if (query) sp.set('q', query);
    if (assetType) sp.set('assetType', assetType);
    sp.set('limit', '20');
    return `${base}?${sp.toString()}`;
  }, [token, tenantSlug, query, assetType, kind]);

  const { data } = useApiSWR<Item[]>(path, token, tenantSlug);
  const items = data ?? [];

  // Cierra el menú si haces click fuera
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const select = (it: Item) => {
    onChangeId(it.id);
    setQuery(`${it.code} — ${it.name}`);
    setOpen(false);
  };

  const clear = () => {
    onChangeId(null);
    setQuery('');
  };

  return (
    <div className="space-y-1" ref={boxRef}>
      <label className="text-xs text-gray-600">{label}</label>
      <div className="relative">
        <input
          className="border rounded w-full px-3 py-2"
          placeholder="Buscar por código o nombre…"
          value={query}
          onChange={(e)=>{ setQuery(e.target.value); setOpen(true); }}
          onFocus={()=>setOpen(true)}
          onKeyDown={(e)=>{
            if (e.key === 'Enter' && items.length > 0) {
              e.preventDefault();
              select(items[0]); // Enter elige el primer resultado
            }
          }}
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
            title="Limpiar"
          >
            ✕
          </button>
        )}

        {open && items.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto border rounded bg-white shadow">
            {items.map(it => (
              <button
                key={it.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-gray-100"
                onClick={()=>select(it)}
              >
                <div className="text-sm font-medium">{it.code} — {it.name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {onChangeOther && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600 shrink-0">Otro:</span>
          <input
            className="border rounded px-2 py-1 w-full"
            placeholder="Texto libre"
            value={otherText ?? ''}
            onChange={(e)=>onChangeOther(e.target.value || null)}
          />
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Selecciona un ítem del listado (o usa “Otro”). Escribe y presiona <kbd>Enter</kbd> para elegir el primero.
      </p>
    </div>
  );
}
