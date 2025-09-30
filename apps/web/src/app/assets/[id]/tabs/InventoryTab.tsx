'use client';

import React from 'react';
import { useAssetsDetail } from '../assets-detail.context';

export default function InventoryTab() {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `${apiBase}/inventory-items?assetId=${encodeURIComponent(assetId)}&size=100`;
      const res = await fetch(url, { headers, credentials: 'include' });
      const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
      setRows(arr);
    } catch (e: any) { setError(e?.message || 'No fue posible cargar inventario'); setRows([]); }
    finally { setLoading(false); }
  }, [apiBase, assetId, headers]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <section className="space-y-4">
      {error && <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">{error}</div>}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Cantidad</th>
              <th className="px-3 py-2 text-left">Ubicación</th>
              <th className="px-3 py-2 text-left">Unidad</th>
              <th className="px-3 py-2 text-left">Min. Stock</th>
              <th className="px-3 py-2 text-left">Costo</th>
              <th className="px-3 py-2 text-left">Actualizado</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Sin repuestos asociados.</td></tr>
              ) : rows.map((i) => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-t">{i.sku}</td>
                  <td className="px-3 py-2 border-t">{i.name}</td>
                  <td className="px-3 py-2 border-t">{i.qty}</td>
                  <td className="px-3 py-2 border-t">{i.location ?? '—'}</td>
                  <td className="px-3 py-2 border-t">{i.unit ?? '—'}</td>
                  <td className="px-3 py-2 border-t">{i.minStock ?? '—'}</td>
                  <td className="px-3 py-2 border-t">{typeof i.cost === 'number' ? i.cost.toFixed(2) : '—'}</td>
                  <td className="px-3 py-2 border-t">{i.updatedAt ? new Date(i.updatedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <button onClick={load} disabled={loading} className="px-3 py-2 rounded border hover:bg-gray-100">Refrescar</button>
      </div>
    </section>
  );
}