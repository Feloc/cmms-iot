'use client';

import React from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

type Asset = {
  id: string;
  code: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  customer?: string | null;
  acquiredOn?: string | null;
  status: string;
  criticality: string;
  createdAt: string;
};

type AssetListResponse = {
  items: Asset[];
  page: number;
  size: number;
  total: number;
  pages: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Filters = {
  serial: string;
  name: string;
  model: string;
  customer: string;
};

export default function AssetsPage() {
  const { data: session } = useSession();

  const token =
    (session as any)?.accessToken ||
    (session as any)?.user?.token ||
    (session as any)?.jwt ||
    undefined;

  const tenantSlug =
    (session as any)?.user?.tenant?.slug ||
    (session as any)?.tenant?.slug ||
    (session as any)?.tenantSlug ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    undefined;

  const headers = React.useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (tenantSlug) h['x-tenant'] = tenantSlug; // ajusta a x-tenant-id si tu API lo espera
    return h;
  }, [token, tenantSlug]);

  const [filters, setFilters] = React.useState<Filters>({
    serial: '',
    name: '',
    model: '',
    customer: '',
  });

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load(p = 1) {
    if (!tenantSlug) return; // No dispares hasta tener tenant
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(p));
      qs.set('size', '20');

      const serial = filters.serial.trim();
      const name = filters.name.trim();
      const model = filters.model.trim();
      const customer = filters.customer.trim();

      if (serial) qs.set('serial', serial);
      if (name) qs.set('name', name);
      if (model) qs.set('model', model);
      if (customer) qs.set('customer', customer);

      const url = `${API_BASE}/assets?${qs.toString()}`;
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers,
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {}
      if (!res.ok) {
        const msg = json?.message || json?.error || `HTTP ${res.status}`;
        throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
      }

      const data = json as AssetListResponse;
      setAssets(Array.isArray(data.items) ? data.items : []);
      setPage(data.page || p);
      setPages(data.pages || 1);
    } catch (e: any) {
      setError(e?.message || 'Error cargando assets');
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!tenantSlug) return;
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  React.useEffect(() => {
    if (!tenantSlug) return;
    const t = setTimeout(() => {
      load(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.serial, filters.name, filters.model, filters.customer, tenantSlug]);

  function fmtDate(d?: string | null) {
    if (!d) return '-';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleDateString('es-CO');
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <div className="text-sm text-gray-600">Filtra por serial, nombre, modelo y cliente.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="px-3 py-2 border rounded" href="/assets/new">
            Nuevo
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Serial..."
          value={filters.serial}
          onChange={(e) => setFilters((s) => ({ ...s, serial: e.target.value }))}
        />
        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Nombre..."
          value={filters.name}
          onChange={(e) => setFilters((s) => ({ ...s, name: e.target.value }))}
        />
        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Modelo..."
          value={filters.model}
          onChange={(e) => setFilters((s) => ({ ...s, model: e.target.value }))}
        />
        <input
          className="border rounded px-3 py-2 text-sm"
          placeholder="Cliente..."
          value={filters.customer}
          onChange={(e) => setFilters((s) => ({ ...s, customer: e.target.value }))}
        />
      </div>

      <div className="flex items-center justify-between">
        {error ? <div className="text-sm text-red-600">{error}</div> : <div />}
        <button
          className="px-3 py-2 border rounded text-sm"
          onClick={() => setFilters({ serial: '', name: '', model: '', customer: '' })}
        >
          Limpiar filtros
        </button>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Serial</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Marca</th>
              <th className="px-3 py-2 text-left">Modelo</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Adquisición</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                  No hay resultados.
                </td>
              </tr>
            ) : (
              assets.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{a.serialNumber || a.code || '-'}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2">{a.brand || '-'}</td>
                  <td className="px-3 py-2">{a.model || '-'}</td>
                  <td className="px-3 py-2">{a.customer || '-'}</td>
                  <td className="px-3 py-2">{fmtDate(a.acquiredOn)}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <Link className="underline" href={`/assets/${a.id}`}>
                        Ver
                      </Link>
                      <Link className="underline" href={`/assets/${a.id}/edit`}>
                        Editar
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          className="px-3 py-2 border rounded text-sm disabled:opacity-50"
          disabled={page <= 1 || loading}
          onClick={() => load(page - 1)}
        >
          Anterior
        </button>
        <div className="text-sm text-gray-600">
          Página {page} / {pages}
        </div>
        <button
          className="px-3 py-2 border rounded text-sm disabled:opacity-50"
          disabled={page >= pages || loading}
          onClick={() => load(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
