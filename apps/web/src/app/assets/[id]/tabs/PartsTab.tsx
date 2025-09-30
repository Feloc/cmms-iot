'use client';
import React from 'react';
import useSWR from 'swr';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type PartRow = {
  id: string;
  sku: string;
  name: string;
  stockAvailable?: number;
  locationName?: string;
  minQty?: number | null;
};

export default function PartsTab({ assetId }: { assetId: string }) {
  const { data, isLoading, error } = useSWR<PartRow[]>(`${API_BASE}/assets/${assetId}/parts`, (url) =>
    fetch(url, { credentials: 'include' }).then((r) => r.json())
  );

  if (isLoading) return <div className="text-sm text-gray-500 p-3">Cargando repuestos…</div>;
  if (error) return <div className="text-sm text-red-600 p-3">Error cargando repuestos.</div>;
  const rows = data || [];

  return (
    <div className="border rounded">
      {rows.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">Sin repuestos vinculados.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">SKU</th>
              <th className="text-left px-3 py-2">Nombre</th>
              <th className="text-left px-3 py-2">Stock disponible</th>
              <th className="text-left px-3 py-2">Ubicación</th>
              <th className="text-left px-3 py-2">Min Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2">{p.sku}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2">{p.stockAvailable ?? '-'}</td>
                <td className="px-3 py-2">{p.locationName ?? '-'}</td>
                <td className="px-3 py-2">{p.minQty ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
