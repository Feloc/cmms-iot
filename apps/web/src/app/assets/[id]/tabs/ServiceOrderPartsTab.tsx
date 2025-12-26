'use client';

import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAssetsDetail } from '../assets-detail.context';

type Row = {
  id: string;
  qty: number;
  notes?: string | null;
  freeText?: string | null;
  inventoryItem?: {
    id: string;
    sku?: string | null;
    name?: string | null;
    model?: string | null;
  } | null;
  workOrder?: {
    id: string;
    dueDate?: string | null;
    title?: string | null;
    serviceOrderType?: string | null;
    status?: string | null;
  } | null;
};

export default function ServiceOrderPartsTab() {
  const { assetId, apiBase, headers, tenantSlug } = useAssetsDetail();

  const key = tenantSlug ? `${apiBase}/assets/${assetId}/service-order-parts` : null;

  const { data, isLoading, error } = useSWR<Row[]>(
    key,
    async (url) => {
      const res = await fetch(url, { credentials: 'include', headers });
      const text = await res.text().catch(() => '');
      let json: any = [];
      try {
        json = text ? JSON.parse(text) : [];
      } catch {
        // ignore
      }
      if (!res.ok) {
        const msg = json?.message || json?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return Array.isArray(json) ? json : [];
    },
    { revalidateOnFocus: false }
  );

  if (!tenantSlug) return <div className="p-4 text-sm text-amber-700">No hay tenant en la sesión.</div>;
  if (isLoading) return <div className="p-4 text-sm text-gray-500">Cargando repuestos…</div>;
  if (error) return <div className="p-4 text-sm text-red-600">Error: {(error as any)?.message || 'No se pudo cargar.'}</div>;

  const rows = data ?? [];

  return (
    <div className="border rounded overflow-x-auto">
      {rows.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">Sin repuestos registrados para este activo.</div>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Orden</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Repuesto</th>
              <th className="px-3 py-2 text-left">Cantidad</th>
              <th className="px-3 py-2 text-left">Notas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const wo = r.workOrder;
              const inv = r.inventoryItem;
              const partLabel =
                inv?.sku ? `${inv.sku} - ${inv.name ?? ''}`.trim() : inv?.name ? inv.name : r.freeText ?? '(sin nombre)';
              const dateStr = wo?.dueDate ? String(wo.dueDate).slice(0, 10) : '-';

              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{dateStr}</td>
                  <td className="px-3 py-2">
                    {wo?.id ? (
                      <Link className="underline" href={`/service-orders/${wo.id}`}>
                        {wo.title || wo.id.slice(-8)}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{wo?.serviceOrderType ?? '-'}</td>
                  <td className="px-3 py-2">{partLabel}</td>
                  <td className="px-3 py-2">{r.qty ?? 1}</td>
                  <td className="px-3 py-2">{r.notes ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
