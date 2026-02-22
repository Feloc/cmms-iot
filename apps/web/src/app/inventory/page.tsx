'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiBase, apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice?: number | null;
  updatedAt?: string | null;
};

type PreviewRow = {
  sku?: string;
  name?: string;
  qty?: number;
  unitPrice?: number | null;
  _row?: number;
  _errors?: string[];
  _warnings?: string[];
};

type PreviewResponse = {
  totalRows: number;
  errors: number;
  warnings: number;
  sample: PreviewRow[];
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtPrice(n?: number | null) {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return '-';
  return Number(n).toFixed(2);
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [qty, setQty] = useState<string>('0');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const canCreate = useMemo(() => {
    return !!sku.trim() && !!name.trim() && !creating;
  }, [sku, name, creating]);

  async function loadItems() {
    if (!auth.token || !auth.tenantSlug || !isAdmin) return;
    setLoading(true);
    setErr('');
    try {
      const list = await apiFetch<InventoryItem[]>('/inventory', {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      setItems(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || 'Error cargando inventario');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setItems([]);
      return;
    }
    loadItems();
  }, [auth.token, auth.tenantSlug, isAdmin]);

  async function createOne(e: FormEvent) {
    e.preventDefault();
    if (!auth.token || !auth.tenantSlug) return;
    if (!canCreate) return;

    const qtyNum = Number(qty || '0');
    if (!Number.isFinite(qtyNum) || qtyNum < 0) {
      setErr('La cantidad debe ser mayor o igual a 0.');
      return;
    }

    const priceVal = unitPrice.trim();
    const priceNum = priceVal === '' ? undefined : Number(priceVal);
    if (priceVal !== '' && (!Number.isFinite(priceNum) || Number(priceNum) < 0)) {
      setErr('El precio debe ser mayor o igual a 0.');
      return;
    }

    setCreating(true);
    setErr('');
    try {
      await apiFetch('/inventory', {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          sku: sku.trim(),
          name: name.trim(),
          qty: Math.round(qtyNum),
          unitPrice: priceVal === '' ? null : Number(priceNum),
        },
      });
      setSku('');
      setName('');
      setQty('0');
      setUnitPrice('');
      await loadItems();
    } catch (e: any) {
      setErr(e?.message || 'Error creando repuesto');
    } finally {
      setCreating(false);
    }
  }

  async function uploadPreview() {
    if (!auth.token || !auth.tenantSlug || !file) return;
    setPreviewing(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${apiBase}/inventory/import/preview`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      setPreview({
        totalRows: Number(json?.totalRows ?? 0),
        errors: Number(json?.errors ?? 0),
        warnings: Number(json?.warnings ?? 0),
        sample: Array.isArray(json?.sample) ? json.sample : [],
      });
    } catch (e: any) {
      setErr(e?.message || 'Error previsualizando archivo');
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function commitImport() {
    if (!auth.token || !auth.tenantSlug || !file) return;
    setCommitting(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${apiBase}/inventory/import/commit`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      await loadItems();
      setPreview(null);
      setFile(null);
    } catch (e: any) {
      setErr(e?.message || 'Error importando archivo');
    } finally {
      setCommitting(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado. Inventario solo para ADMIN.</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inventario de repuestos</h1>
        <p className="text-sm text-gray-600">Ingreso individual y carga masiva de repuestos.</p>
      </div>

      {err ? <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Ingreso individual</h2>
          <form onSubmit={createOne} className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">SKU</span>
              <input className="border rounded px-3 py-2 w-full" value={sku} onChange={(e) => setSku(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Nombre</span>
              <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Cantidad</span>
              <input type="number" min={0} step={1} className="border rounded px-3 py-2 w-full" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Precio unitario</span>
              <input type="number" min={0} step="0.01" className="border rounded px-3 py-2 w-full" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </label>
            <div className="md:col-span-2">
              <button type="submit" disabled={!canCreate} className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50">
                {creating ? 'Guardando...' : 'Crear repuesto'}
              </button>
            </div>
          </form>
        </section>

        <section className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Carga masiva</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={!file || previewing || committing}
              onClick={uploadPreview}
            >
              {previewing ? 'Previsualizando...' : 'Previsualizar'}
            </button>
            <button
              type="button"
              className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
              disabled={!file || committing}
              onClick={commitImport}
            >
              {committing ? 'Importando...' : 'Importar'}
            </button>
            <a className="text-sm underline" href="/templates/template-inventory.csv" download>
              Descargar plantilla
            </a>
          </div>

          {preview ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-700">
                {preview.totalRows} filas · {preview.errors} con error · {preview.warnings} con advertencia
              </div>
              <div className="border rounded overflow-auto max-h-72">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left border-b">Fila</th>
                      <th className="p-2 text-left border-b">SKU</th>
                      <th className="p-2 text-left border-b">Nombre</th>
                      <th className="p-2 text-left border-b">Cantidad</th>
                      <th className="p-2 text-left border-b">Precio</th>
                      <th className="p-2 text-left border-b">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r, idx) => {
                      const hasErr = Array.isArray(r._errors) && r._errors.length > 0;
                      const hasWarn = Array.isArray(r._warnings) && r._warnings.length > 0;
                      return (
                        <tr key={`${r._row ?? idx}-${r.sku ?? ''}`} className={hasErr ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : ''}>
                          <td className="p-2 border-b">{r._row ?? idx + 1}</td>
                          <td className="p-2 border-b">{r.sku ?? ''}</td>
                          <td className="p-2 border-b">{r.name ?? ''}</td>
                          <td className="p-2 border-b">{r.qty ?? ''}</td>
                          <td className="p-2 border-b">{fmtPrice(r.unitPrice)}</td>
                          <td className="p-2 border-b">
                            {hasErr ? (r._errors ?? []).join('; ') : hasWarn ? (r._warnings ?? []).join('; ') : 'OK'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="border rounded overflow-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">SKU</th>
              <th className="text-left p-2 border-b">Nombre</th>
              <th className="text-left p-2 border-b">Cantidad</th>
              <th className="text-left p-2 border-b">Precio unitario</th>
              <th className="text-left p-2 border-b">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={5}>Cargando...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={5}>Sin repuestos registrados.</td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id}>
                  <td className="p-2 border-b">{it.sku}</td>
                  <td className="p-2 border-b">{it.name}</td>
                  <td className="p-2 border-b">{it.qty}</td>
                  <td className="p-2 border-b">{fmtPrice(it.unitPrice)}</td>
                  <td className="p-2 border-b">{fmtDate(it.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
