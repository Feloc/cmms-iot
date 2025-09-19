'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Part = {
  id: string;
  inventoryItemId?: string | null;
  freeText?: string | null;
  qty: number;
  unitCost?: number | null;
  totalCost?: number | null;
};

export default function PartsPanel({ woId }: { woId: string }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const { data, error, isLoading, mutate } = useApiSWR<Part[]>(
    token && tenantSlug ? `/work-orders/${woId}/parts` : null,
    token, tenantSlug
  );

  const [row, setRow] = useState<Partial<Part>>({ qty: 1 });

  const add = async () => {
    try {
      await apiFetch(`/work-orders/${woId}/parts`, {
        method: 'POST', token, tenantSlug,
        body: { inventoryItemId: row.inventoryItemId, freeText: row.freeText, qty: Number(row.qty ?? 1), unitCost: row.unitCost != null ? Number(row.unitCost) : undefined }
      });
      setRow({ qty: 1 });
      mutate();
    } catch (e:any) { alert(e.message || 'Error agregando parte'); }
  };

  const update = async (id: string, patch: Partial<Part>) => {
    try {
      await apiFetch(`/work-orders/${woId}/parts/${id}`, { method: 'PATCH', token, tenantSlug, body: patch });
      mutate();
    } catch (e:any) { alert(e.message || 'Error actualizando parte'); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar parte?')) return;
    try {
      await apiFetch(`/work-orders/${woId}/parts/${id}`, { method: 'DELETE', token, tenantSlug });
      mutate();
    } catch (e:any) { alert(e.message || 'Error eliminando parte'); }
  };

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error: {(error as any).message}</div>;

  const parts = data ?? [];
  const total = parts.reduce((acc, p) => acc + (p.totalCost ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">Costo total: {total.toFixed(2)}</div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">Ítem</th>
            <th className="py-2 w-24">Qty</th>
            <th className="py-2 w-32">Unit</th>
            <th className="py-2 w-32">Total</th>
            <th className="py-2 w-28"></th>
          </tr>
        </thead>
        <tbody>
          {parts.map(p => (
            <tr key={p.id} className="border-b">
              <td className="py-2">
                {p.freeText ?? p.inventoryItemId ?? '—'}
              </td>
              <td className="py-2">
                <input
                  type="number" min={0}
                  className="border rounded px-2 py-1 w-24"
                  defaultValue={p.qty}
                  onBlur={(e)=>update(p.id, { qty: Number(e.target.value) })}
                />
              </td>
              <td className="py-2">
                <input
                  type="number" step="0.01"
                  className="border rounded px-2 py-1 w-32"
                  defaultValue={p.unitCost ?? ''}
                  onBlur={(e)=>update(p.id, { unitCost: e.target.value === '' ? null as any : Number(e.target.value) })}
                />
              </td>
              <td className="py-2">{p.totalCost?.toFixed(2) ?? '—'}</td>
              <td className="py-2">
                <button onClick={()=>remove(p.id)} className="px-2 py-1 border rounded">Eliminar</button>
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-2">
              <input
                className="border rounded px-2 py-1 w-full"
                placeholder="Free text o InventoryItemId"
                value={row.freeText ?? row.inventoryItemId ?? ''}
                onChange={(e)=>setRow(r=>({ ...r, freeText: e.target.value, inventoryItemId: undefined }))}
              />
            </td>
            <td className="py-2">
              <input
                type="number" min={0}
                className="border rounded px-2 py-1 w-24"
                value={row.qty ?? 1}
                onChange={(e)=>setRow(r=>({ ...r, qty: Number(e.target.value) }))}
              />
            </td>
            <td className="py-2">
              <input
                type="number" step="0.01"
                className="border rounded px-2 py-1 w-32"
                value={row.unitCost ?? ''}
                onChange={(e)=>setRow(r=>({ ...r, unitCost: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
            </td>
            <td className="py-2">—</td>
            <td className="py-2">
              <button onClick={add} className="px-3 py-1 rounded bg-black text-white">Agregar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
