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
  lastMaintenanceAt?: string | null;
  status: string;
  criticality: string;
  createdAt: string;
  hasMaintenancePlan?: boolean;
  maintenancePlanActive?: boolean;
  maintenancePlanName?: string | null;
};

type AssetListResponse = {
  items: Asset[];
  page: number;
  size: number;
  total: number;
  pages: number;
};

type AssetFilterOptionsResponse = {
  names: string[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function normalizeFilterText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

type Filters = {
  serial: string;
  nameIn: string[];
  brand: string;
  model: string;
  customer: string;
  guarantee: '' | 'IN_WARRANTY' | 'OUT_OF_WARRANTY';
  pmConfigured: '' | 'CONFIGURED' | 'UNCONFIGURED';
  status: '' | 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
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
    nameIn: [],
    brand: '',
    model: '',
    customer: '',
    guarantee: '',
    pmConfigured: '',
    status: '',
  });

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [nameOptions, setNameOptions] = React.useState<string[]>([]);
  const [nameOptionSearch, setNameOptionSearch] = React.useState('');

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const filteredNameOptions = React.useMemo(() => {
    const needle = normalizeFilterText(nameOptionSearch);
    if (!needle) return nameOptions;
    return nameOptions.filter((name) => normalizeFilterText(name).includes(needle));
  }, [nameOptions, nameOptionSearch]);
  const selectedVisibleNameCount = React.useMemo(
    () => filteredNameOptions.filter((name) => filters.nameIn.includes(name)).length,
    [filteredNameOptions, filters.nameIn],
  );
  const selectedNameSummary = React.useMemo(() => {
    if (filters.nameIn.length === 0) return 'Todas';
    if (filters.nameIn.length === 1) return filters.nameIn[0];
    return `${filters.nameIn.length} seleccionados`;
  }, [filters.nameIn]);

  async function load(p = 1) {
    if (!tenantSlug) return; // No dispares hasta tener tenant
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('page', String(p));
      qs.set('size', '20');

      const serial = filters.serial.trim();
      const nameIn = filters.nameIn;
      const brand = filters.brand.trim();
      const model = filters.model.trim();
      const customer = filters.customer.trim();
      const guarantee = filters.guarantee;
      const pmConfigured = filters.pmConfigured;
      const status = filters.status;

      if (serial) qs.set('serial', serial);
      if (nameIn.length > 0) qs.set('nameIn', nameIn.join(','));
      if (brand) qs.set('brand', brand);
      if (model) qs.set('model', model);
      if (customer) qs.set('customer', customer);
      if (guarantee) qs.set('guarantee', guarantee);
      if (pmConfigured) qs.set('pmConfigured', pmConfigured);
      if (status) qs.set('status', status);

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
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.message || 'Error cargando assets');
    } finally {
      setLoading(false);
    }
  }

  async function loadNameOptions() {
    if (!tenantSlug) return;
    try {
      const qs = new URLSearchParams();
      const serial = filters.serial.trim();
      const brand = filters.brand.trim();
      const model = filters.model.trim();
      const customer = filters.customer.trim();
      const guarantee = filters.guarantee;
      const pmConfigured = filters.pmConfigured;
      const status = filters.status;

      if (serial) qs.set('serial', serial);
      if (brand) qs.set('brand', brand);
      if (model) qs.set('model', model);
      if (customer) qs.set('customer', customer);
      if (guarantee) qs.set('guarantee', guarantee);
      if (pmConfigured) qs.set('pmConfigured', pmConfigured);
      if (status) qs.set('status', status);

      const res = await fetch(`${API_BASE}/assets/filter-options?${qs.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      const data = json as AssetFilterOptionsResponse;
      setNameOptions(Array.isArray(data.names) ? data.names : []);
    } catch (e: any) {
      setError(e?.message || 'Error cargando opciones de filtro');
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
  }, [filters.serial, filters.nameIn, filters.brand, filters.model, filters.customer, filters.guarantee, filters.pmConfigured, filters.status, tenantSlug]);

  React.useEffect(() => {
    if (!tenantSlug) return;
    loadNameOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.serial, filters.brand, filters.model, filters.customer, filters.guarantee, filters.pmConfigured, filters.status, tenantSlug]);

function fmtDate(d?: string | null) {
  if (!d) return '-';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('es-CO');
}

function monthsSince(dateText?: string | null) {
  if (!dateText) return null;
  const start = new Date(dateText);
  if (Number.isNaN(start.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const averageMonthMs = (365.25 / 12) * 24 * 60 * 60 * 1000;
  const months = diffMs / averageMonthMs;
  return Math.max(0, months);
}

function maintenanceAge(asset: Asset) {
  const baseDate = asset.lastMaintenanceAt || asset.acquiredOn || null;
  const months = monthsSince(baseDate);
  if (months == null) return { label: '-', title: 'Sin fecha base' };

  const origin = asset.lastMaintenanceAt ? 'último mantenimiento' : 'adquisición';
  return {
    label: new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(months),
    title: `Calculado desde ${origin}: ${fmtDate(baseDate)}`,
  };
}

function pmBadge(asset: Asset) {
  if (!asset.hasMaintenancePlan) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-600">
        Sin plan
      </span>
    );
  }

  if (asset.maintenancePlanActive === false) {
    return (
      <span
        className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
        title={asset.maintenancePlanName || 'Plan PM inactivo'}
      >
        Inactivo
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
      title={asset.maintenancePlanName || 'Plan PM configurado'}
    >
      Configurado
    </span>
  );
}

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Assets</h1>
          <div className="text-sm text-gray-600">Usa los filtros del encabezado para trabajar la lista como una tabla.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="px-3 py-2 border rounded" href="/assets/new">
            Nuevo
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {error ? <span className="text-red-600">{error}</span> : `${total} registro${total === 1 ? '' : 's'}`}
        </div>
        <button
          className="px-3 py-2 border rounded text-sm"
          onClick={() => setFilters({ serial: '', nameIn: [], brand: '', model: '', customer: '', guarantee: '', pmConfigured: '', status: '' })}
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
              <th className="px-3 py-2 text-left">Meses sin mtto</th>
              <th className="px-3 py-2 text-left">Estado</th>
              <th className="px-3 py-2 text-left">Plan PM</th>
              <th className="px-3 py-2 text-left">Acciones</th>
            </tr>
            <tr className="border-t bg-white">
              <th className="px-2 py-2">
                <input
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  placeholder="Filtrar..."
                  value={filters.serial}
                  onChange={(e) => setFilters((s) => ({ ...s, serial: e.target.value }))}
                />
              </th>
              <th className="px-2 py-2">
                <details className="relative">
                  <summary className="list-none border rounded px-2 py-1 text-xs w-full font-normal cursor-pointer text-left bg-white">
                    {selectedNameSummary}
                  </summary>
                  <div className="absolute left-0 z-20 mt-1 w-64 rounded border bg-white p-2 shadow-lg">
                    <input
                      className="mb-2 border rounded px-2 py-1 text-xs w-full font-normal"
                      placeholder="Buscar dentro del listado..."
                      value={nameOptionSearch}
                      onChange={(e) => setNameOptionSearch(e.target.value)}
                    />
                    <div className="flex items-center justify-between gap-2 pb-2 text-xs">
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setFilters((s) => ({
                            ...s,
                            nameIn: Array.from(new Set([...s.nameIn, ...filteredNameOptions])),
                          }))
                        }
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setFilters((s) => ({
                            ...s,
                            nameIn: s.nameIn.filter((item) => !filteredNameOptions.includes(item)),
                          }))
                        }
                      >
                        Ninguno
                      </button>
                    </div>
                    <div className="pb-2 text-[11px] text-gray-500">
                      {filteredNameOptions.length} opcion{filteredNameOptions.length === 1 ? '' : 'es'} visibles
                      {filteredNameOptions.length > 0 ? ` • ${selectedVisibleNameCount} seleccionada${selectedVisibleNameCount === 1 ? '' : 's'}` : ''}
                    </div>
                    <div className="max-h-56 overflow-auto space-y-1">
                      {filteredNameOptions.map((name) => (
                        <label key={name} className="flex items-center gap-2 text-xs font-normal">
                          <input
                            type="checkbox"
                            checked={filters.nameIn.includes(name)}
                            onChange={(e) =>
                              setFilters((s) => ({
                                ...s,
                                nameIn: e.target.checked ? [...s.nameIn, name] : s.nameIn.filter((item) => item !== name),
                              }))
                            }
                          />
                          <span>{name}</span>
                        </label>
                      ))}
                      {filteredNameOptions.length === 0 ? <div className="text-xs text-gray-500">Sin opciones</div> : null}
                    </div>
                  </div>
                </details>
              </th>
              <th className="px-2 py-2">
                <input
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  placeholder="Filtrar..."
                  value={filters.brand}
                  onChange={(e) => setFilters((s) => ({ ...s, brand: e.target.value }))}
                />
              </th>
              <th className="px-2 py-2">
                <input
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  placeholder="Filtrar..."
                  value={filters.model}
                  onChange={(e) => setFilters((s) => ({ ...s, model: e.target.value }))}
                />
              </th>
              <th className="px-2 py-2">
                <input
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  placeholder="Filtrar..."
                  value={filters.customer}
                  onChange={(e) => setFilters((s) => ({ ...s, customer: e.target.value }))}
                />
              </th>
              <th className="px-2 py-2">
                <select
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  value={filters.guarantee}
                  onChange={(e) => setFilters((s) => ({ ...s, guarantee: e.target.value as Filters['guarantee'] }))}
                >
                  <option value="">Todas</option>
                  <option value="IN_WARRANTY">En garantía</option>
                  <option value="OUT_OF_WARRANTY">Fuera</option>
                </select>
              </th>
              <th className="px-2 py-2"></th>
              <th className="px-2 py-2">
                <select
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  value={filters.status}
                  onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value as Filters['status'] }))}
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">Activo</option>
                  <option value="INACTIVE">Inactivo</option>
                  <option value="DECOMMISSIONED">Baja</option>
                </select>
              </th>
              <th className="px-2 py-2">
                <select
                  className="border rounded px-2 py-1 text-xs w-full font-normal"
                  value={filters.pmConfigured}
                  onChange={(e) => setFilters((s) => ({ ...s, pmConfigured: e.target.value as Filters['pmConfigured'] }))}
                >
                  <option value="">Todos</option>
                  <option value="CONFIGURED">Con plan</option>
                  <option value="UNCONFIGURED">Sin plan</option>
                </select>
              </th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  Cargando…
                </td>
              </tr>
            ) : assets.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  No hay resultados.
                </td>
              </tr>
            ) : (
              assets.map((a) => {
                const age = maintenanceAge(a);
                return (
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2 font-mono">{a.serialNumber || a.code || '-'}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2">{a.brand || '-'}</td>
                    <td className="px-3 py-2">{a.model || '-'}</td>
                    <td className="px-3 py-2">{a.customer || '-'}</td>
                    <td className="px-3 py-2">{fmtDate(a.acquiredOn)}</td>
                    <td className="px-3 py-2" title={age.title}>{age.label}</td>
                    <td className="px-3 py-2">{a.status}</td>
                    <td className="px-3 py-2">{pmBadge(a)}</td>
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
                );
              })
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
