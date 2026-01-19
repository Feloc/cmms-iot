'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

type User = { id: string; name: string; email: string; role: string };

type ServiceOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  serviceOrderType?: string | null;
  dueDate?: string | null;
  durationMin?: number | null;
  createdAt?: string;
  assetCode: string;
  asset?: { customer?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  assignments?: Array<{
    id: string;
    role: string;
    state: string;
    user?: { id: string; name: string } | null;
  }> | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number };

type Filter =
  | { id: string; field: 'q'; value: string }
  | { id: string; field: 'status'; value: string }
  | { id: string; field: 'type'; value: string }
  | { id: string; field: 'technicianId'; value: string };

type EditRow = { dueLocal: string; technicianId: string };

const EMPTY_ITEMS: ServiceOrder[] = [];

const STATUS_TABS = ['ALL', 'OPEN', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELED'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

function fmt(dt?: string | null) {
  if (!dt) return '';
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}

export default function ServiceOrdersPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [filters, setFilters] = useState<Filter[]>([{ id: 'f-q', field: 'q', value: '' }]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');

  const [data, setData] = useState<Paginated<ServiceOrder> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [technicians, setTechnicians] = useState<User[]>([]);

  const listPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug) return null;

    const qs = new URLSearchParams();
    for (const f of filters) {
      const v = (f.value || '').trim();
      if (!v) continue;
      qs.append(f.field, v);
    }
    qs.set('page', '1');
    qs.set('size', '50');

    return `/service-orders?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, filters]);

  const items = data?.items ?? EMPTY_ITEMS;

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const so of items) counts[so.status] = (counts[so.status] ?? 0) + 1;
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (statusTab === 'ALL') return items;
    return items.filter((so) => so.status === statusTab);
  }, [items, statusTab]);

  // Cargar técnicos una vez (y refrescar si cambia auth)
  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    setErr('');
    apiFetch<User[]>(`/users?role=TECH`, { token: auth.token, tenantSlug: auth.tenantSlug })
      .then((u) => setTechnicians(Array.isArray(u) ? u : []))
      .catch((e: any) => setErr(e?.message ?? 'Error cargando técnicos'));
  }, [auth.token, auth.tenantSlug]);

  // Cargar lista cuando cambian filtros
  useEffect(() => {
    if (!auth.token || !auth.tenantSlug || !listPath) return;

    setLoading(true);
    setErr('');

    const t = setTimeout(() => {
      apiFetch<Paginated<ServiceOrder>>(listPath, { token: auth.token!, tenantSlug: auth.tenantSlug! })
        .then((d) => setData(d))
        .catch((e: any) => setErr(e?.message ?? 'Error cargando órdenes'))
        .finally(() => setLoading(false));
    }, 150); // debounce pequeño

    return () => clearTimeout(t);
  }, [auth.token, auth.tenantSlug, listPath]);

  // Inicializa state de edición cuando llegan items nuevos
  useEffect(() => {
    if (items.length === 0) return;

    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const so of items) {
        if (next[so.id]) continue;

        const dueLocal = so.dueDate ? new Date(so.dueDate).toISOString().slice(0, 16) : '';
        const tech = so.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user?.id ?? '';
        next[so.id] = { dueLocal, technicianId: tech };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [items]);

  async function saveSchedule(id: string) {
    if (!auth.token || !auth.tenantSlug) return;

    const row = edits[id];
    const dueDate = row?.dueLocal ? new Date(row.dueLocal).toISOString() : null;

    await apiFetch(`/service-orders/${id}/schedule`, {
      method: 'PATCH',
      token: auth.token,
      tenantSlug: auth.tenantSlug,
      body: { dueDate, technicianId: row?.technicianId || null },
    });

    // refrescar lista
    if (listPath) {
      const d = await apiFetch<Paginated<ServiceOrder>>(listPath, { token: auth.token, tenantSlug: auth.tenantSlug });
      setData(d);
    }
  }

  function addFilter(field: Filter['field']) {
    setFilters((s) => {
      const id = `${field}-${Math.random().toString(16).slice(2)}`;
      return [...s, { id, field, value: '' } as any];
    });
  }

  function removeFilter(id: string) {
    setFilters((s) => s.filter((f) => f.id !== id));
  }

  function setFilterValue(id: string, value: string) {
    setFilters((s) => s.map((f) => (f.id === id ? ({ ...f, value } as any) : f)));
  }

  function setFilterField(id: string, field: Filter['field']) {
    setFilters((s) => s.map((f) => (f.id === id ? ({ ...f, field, value: '' } as any) : f)));
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Órdenes de servicio</div>
          <div className="text-sm text-gray-600">Filtra y programa rápidamente (asignar técnico + fecha/hora).</div>
          <div className="text-xs text-gray-500 mt-1">
            {loading ? 'Cargando…' : null}
            {!loading && data ? `Total: ${data.total}` : null}
            {!loading && !data ? 'Sin datos aún' : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/service-orders/new" className="px-3 py-2 border rounded text-sm bg-black text-white">
            Nueva OS
          </Link>
          <Link href="/calendar" className="px-3 py-2 border rounded text-sm">
            Calendario
          </Link>
        </div>
      </div>

      {err ? (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div>
      ) : null}

      {/* Filters builder */}
      <div className="border rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-semibold">Filtros</div>
          <div className="flex gap-2 flex-wrap">
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('status')} type="button">
              + Status
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('type')} type="button">
              + Tipo
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('technicianId')} type="button">
              + Técnico
            </button>
          </div>
        </div>

        <div className="grid gap-2">
          {filters.map((f) => (
            <div key={f.id} className="flex items-center gap-2 flex-wrap">
              <select
                className="border rounded px-2 py-1 text-sm"
                value={f.field}
                onChange={(e) => setFilterField(f.id, e.target.value as any)}
              >
                <option value="q">Texto</option>
                <option value="status">Status</option>
                <option value="type">Tipo</option>
                <option value="technicianId">Técnico</option>
              </select>

              {f.field === 'q' ? (
                <input
                  className="border rounded px-3 py-2 text-sm w-[280px]"
                  placeholder="Buscar (título, assetCode...)"
                  value={f.value}
                  onChange={(e) => setFilterValue(f.id, e.target.value)}
                />
              ) : null}

              {f.field === 'status' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value="OPEN">OPEN</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELED">CANCELED</option>
                </select>
              ) : null}

              {f.field === 'type' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value="ALISTAMIENTO">ALISTAMIENTO</option>
                  <option value="DIAGNOSTICO">DIAGNOSTICO</option>
                  <option value="PREVENTIVO">PREVENTIVO</option>
                  <option value="CORRECTIVO">CORRECTIVO</option>
                  <option value="ENTREGA">ENTREGA</option>
                  <option value="OTRO">OTRO</option>
                </select>
              ) : null}

              {f.field === 'technicianId' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : null}

              {filters.length > 1 ? (
                <button className="text-sm underline text-gray-600" type="button" onClick={() => removeFilter(f.id)}>
                  Quitar
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="text-xs text-gray-500">Tip: puedes agregar varios filtros.</div>
      </div>

      <div className="border rounded p-2">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map((t) => {
            const active = t === statusTab;
            const n = t === 'ALL' ? items.length : statusCounts[t] ?? 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setStatusTab(t)}
                className={`px-3 py-1.5 border rounded text-sm flex items-center gap-2 ${
                  active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{t}</span>
                <span className={`text-[11px] px-1.5 py-0.5 rounded ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-700'}`}>{n}</span>
              </button>
            );
          })}
          <div className="text-xs text-gray-500 ml-auto">
            Mostrando {visibleItems.length} / {items.length}
          </div>
        </div>
      </div>

      <div className="border rounded overflow-auto">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Creada</th>
              <th className="text-left p-2 border-b">OS</th>
              <th className="text-left p-2 border-b">Cliente / Serie</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Tipo</th>
              <th className="text-left p-2 border-b">Programación</th>
              <th className="text-left p-2 border-b">Técnico</th>
              <th className="text-left p-2 border-b">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((so) => {
              const row = edits[so.id] || { dueLocal: '', technicianId: '' };
              return (
                <tr key={so.id} className="hover:bg-gray-50">
                  <td className="p-2 border-b whitespace-nowrap">{fmt(so.createdAt)}</td>
                  <td className="p-2 border-b">
                    <Link className="font-medium underline" href={`/service-orders/${so.id}`}>
                      {so.assetCode}
                    </Link>
                    <div className="text-xs text-gray-600">{so.title}</div>
                  </td>
                  <td className="p-2 border-b">
                    <div>{so.asset?.customer || '-'}</div>
                    <div className="text-xs text-gray-600">{so.asset?.serialNumber || '-'}</div>
                  </td>
                  <td className="p-2 border-b whitespace-nowrap">{so.status}</td>
                  <td className="p-2 border-b whitespace-nowrap">{so.serviceOrderType || '-'}</td>
                  <td className="p-2 border-b whitespace-nowrap">
                    <input
                      type="datetime-local"
                      className="border rounded px-2 py-1"
                      value={row.dueLocal}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [so.id]: { ...row, dueLocal: e.target.value } }))}
                    />
                  </td>
                  <td className="p-2 border-b whitespace-nowrap">
                    <select
                      className="border rounded px-2 py-1"
                      value={row.technicianId}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [so.id]: { ...row, technicianId: e.target.value } }))}
                    >
                      <option value="">(sin asignar)</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 border-b whitespace-nowrap">
                    <button className="px-3 py-1 border rounded" onClick={() => saveSchedule(so.id)} type="button">
                      Guardar
                    </button>
                    {isAdmin ? (
                      <Link className="ml-2 text-sm underline" href={`/service-orders/${so.id}#edit`}>
                        Editar
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {visibleItems.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={8}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
