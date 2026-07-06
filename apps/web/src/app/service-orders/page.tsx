'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiBase, apiFetch } from '@/lib/api';

type User = { id: string; name: string; email: string; role: string };

type ServiceOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  serviceOrderType?: string | null;
  commercialStatus?: CommercialStatus | null;
  hasIssue?: boolean;
  dueDate?: string | null;
  durationMin?: number | null;
  createdAt?: string;
  assetCode: string;
  asset?: { customer?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  serviceOrderIssue?: { status?: string | null; ownerUserId?: string | null; resolutionWorkOrderId?: string | null } | null;
  assignments?: Array<{
    id: string;
    role: string;
    state: string;
    user?: { id: string; name: string } | null;
  }> | null;
  _count?: {
    commercialNotes?: number;
  } | null;
};

type ServiceOrderPartSummary = {
  id: string;
  qty: number;
  stage: 'REQUIRED' | 'REPLACED';
  notes?: string | null;
  freeText?: string | null;
  replacedAt?: string | null;
  createdAt?: string | null;
  sourceServiceOrderId?: string | null;
  sourceServiceOrderPartId?: string | null;
  replacementServiceOrderId?: string | null;
  replacementServiceOrderPartId?: string | null;
  inventoryItem?: {
    id: string;
    sku?: string | null;
    name?: string | null;
    model?: string | null;
  } | null;
  replacedByUser?: { id: string; name?: string | null; email?: string | null } | null;
  workOrder?: {
    id: string;
    title?: string | null;
    assetCode?: string | null;
    status?: string | null;
    serviceOrderType?: string | null;
    dueDate?: string | null;
    createdAt?: string | null;
    completedAt?: string | null;
    deliveredAt?: string | null;
    asset?: { customer?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  } | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number; statusCounts?: Record<string, number> };
type CommercialStatus =
  | 'NO_MANAGEMENT'
  | 'PENDING_QUOTE'
  | 'PENDING_APPROVAL'
  | 'NOT_APPROVED'
  | 'APPROVED'
  | 'PROGRAMMED'
  | 'CONFIRMED'
  | 'COMPLETED';

type Filter =
  | { id: string; field: 'q'; value: string }
  | { id: string; field: 'status'; value: string }
  | { id: string; field: 'type'; value: string }
  | { id: string; field: 'month'; value: string }
  | { id: string; field: 'guarantee'; value: string }
  | { id: string; field: 'commercialStatus'; value: string }
  | { id: string; field: 'assignment'; value: string }
  | { id: string; field: 'technicianId'; value: string }
  | { id: string; field: 'issueStatus'; value: string };

type EditRow = { dueLocal: string; technicianId: string };
type PersistedServiceOrderFilters = {
  version?: number;
  filters?: unknown;
  dateRange?: unknown;
  listTab?: unknown;
  statusTab?: unknown;
};

const EMPTY_ITEMS: ServiceOrder[] = [];
const PAGE_SIZE = 50;
const COMMERCIAL_STATUS_UNDEFINED_FILTER = '__UNDEFINED__';
const SERVICE_ORDER_FILTERS_STORAGE_VERSION = 1;
const DEFAULT_FILTERS: Filter[] = [{ id: 'f-q', field: 'q', value: '' }];
const FILTER_FIELDS = new Set<Filter['field']>([
  'q',
  'status',
  'type',
  'month',
  'guarantee',
  'commercialStatus',
  'assignment',
  'technicianId',
  'issueStatus',
]);

const STATUS_TABS = ['ALL', 'OPEN', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELED'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const LIST_TABS = [
  { id: 'ALL', label: 'Todas las OS' },
  { id: 'ISSUES', label: 'Equipos con novedad' },
  { id: 'PARTS', label: 'Repuestos OS' },
] as const;
type ListTab = (typeof LIST_TABS)[number]['id'];

function fmt(dt?: string | null) {
  if (!dt) return '';
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return String(dt);
  }
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toLocalInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function monthToRange(value: string) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;

  const [yearStr, monthStr] = raw.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;

  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  end.setMilliseconds(end.getMilliseconds() - 1);

  return { start: start.toISOString(), end: end.toISOString() };
}

function dateInputToStartIso(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function dateInputToEndIso(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dt = new Date(`${raw}T23:59:59.999`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function commercialStatusMeta(status?: string | null) {
  switch (String(status || '').toUpperCase()) {
    case 'NO_MANAGEMENT':
      return { code: 'NG', label: 'No gestión', className: 'bg-slate-50 text-slate-800 border-slate-200' };
    case 'PENDING_QUOTE':
      return { code: 'PC', label: 'Pendiente cotizar', className: 'bg-orange-50 text-orange-800 border-orange-200' };
    case 'PENDING_APPROVAL':
      return { code: 'PA', label: 'Pendiente aprobación', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'NOT_APPROVED':
      return { code: 'NA', label: 'No aprobado', className: 'bg-rose-50 text-rose-800 border-rose-200' };
    case 'APPROVED':
      return { code: 'AP', label: 'Aprobado', className: 'bg-sky-50 text-sky-800 border-sky-200' };
    case 'PROGRAMMED':
      return { code: 'PR', label: 'Programado', className: 'bg-violet-50 text-violet-800 border-violet-200' };
    case 'CONFIRMED':
      return { code: 'CF', label: 'Confirmado', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'COMPLETED':
      return { code: 'CP', label: 'Completado', className: 'bg-green-50 text-green-800 border-green-200' };
    default:
      return null;
  }
}

function partSummaryLabel(part: ServiceOrderPartSummary) {
  const inv = part.inventoryItem;
  if (inv?.sku) return `${inv.sku} - ${inv.name ?? ''}`.trim();
  if (inv?.name) return inv.name;
  return part.freeText || '(sin nombre)';
}

function normalizeStoredFilters(value: unknown): Filter[] {
  if (!Array.isArray(value)) return DEFAULT_FILTERS;
  const filters = value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const field = String((item as any).field || '') as Filter['field'];
      if (!FILTER_FIELDS.has(field)) return null;
      return {
        id: String((item as any).id || `${field}-${index}`),
        field,
        value: String((item as any).value ?? ''),
      } as Filter;
    })
    .filter((item): item is Filter => !!item);
  return filters.length ? filters : DEFAULT_FILTERS;
}

function normalizeStoredDateRange(value: unknown) {
  if (!value || typeof value !== 'object') return { start: '', end: '' };
  return {
    start: String((value as any).start ?? ''),
    end: String((value as any).end ?? ''),
  };
}

export default function ServiceOrdersPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [filters, setFilters] = useState<Filter[]>(DEFAULT_FILTERS);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [edits, setEdits] = useState<Record<string, EditRow>>({});
  const [listTab, setListTab] = useState<ListTab>('ALL');
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [page, setPage] = useState(1);
  const [hydratedStorageKey, setHydratedStorageKey] = useState('');

  const [data, setData] = useState<Paginated<ServiceOrder> | null>(null);
  const [partsData, setPartsData] = useState<Paginated<ServiceOrderPartSummary> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [savingCommercialId, setSavingCommercialId] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  const [technicians, setTechnicians] = useState<User[]>([]);
  const filtersStorageKey = useMemo(
    () => (auth.tenantSlug ? `cmms.service-orders.filters.${auth.tenantSlug}` : ''),
    [auth.tenantSlug]
  );
  const filtersHydrated = !!filtersStorageKey && hydratedStorageKey === filtersStorageKey;

  const listPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug || !filtersHydrated) return null;
    if (listTab === 'PARTS') return null;

    const qs = new URLSearchParams();
    for (const f of filters) {
      const v = (f.value || '').trim();
      if (!v) continue;
      if (statusTab !== 'ALL' && f.field === 'status') continue;
      if (f.field === 'month') {
        const range = monthToRange(v);
        if (!range) continue;
        qs.set('start', range.start);
        qs.set('end', range.end);
        continue;
      }
      qs.append(f.field, v);
    }
    const rangeStart = dateInputToStartIso(dateRange.start);
    const rangeEnd = dateInputToEndIso(dateRange.end);
    if (rangeStart) qs.set('start', rangeStart);
    if (rangeEnd) qs.set('end', rangeEnd);
    if (listTab === 'ISSUES') qs.set('hasIssue', 'true');
    if (statusTab !== 'ALL') qs.append('status', statusTab);
    qs.set('page', String(page));
    qs.set('size', String(PAGE_SIZE));

    return `/service-orders?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, filtersHydrated, filters, dateRange.end, dateRange.start, listTab, statusTab, page]);

  const partsPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug || !filtersHydrated) return null;
    if (listTab !== 'PARTS') return null;

    const qs = new URLSearchParams();
    for (const f of filters) {
      const v = (f.value || '').trim();
      if (!v) continue;
      if (statusTab !== 'ALL' && f.field === 'status') continue;
      if (f.field === 'month') {
        const range = monthToRange(v);
        if (!range) continue;
        qs.set('start', range.start);
        qs.set('end', range.end);
        continue;
      }
      if (f.field === 'q' || f.field === 'status' || f.field === 'type') qs.append(f.field, v);
    }
    const rangeStart = dateInputToStartIso(dateRange.start);
    const rangeEnd = dateInputToEndIso(dateRange.end);
    if (rangeStart) qs.set('start', rangeStart);
    if (rangeEnd) qs.set('end', rangeEnd);
    if (statusTab !== 'ALL') qs.append('status', statusTab);
    qs.set('page', String(page));
    qs.set('size', String(PAGE_SIZE));

    return `/service-orders/parts-summary?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, filtersHydrated, filters, dateRange.end, dateRange.start, listTab, statusTab, page]);

  const exportPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug || !filtersHydrated) return null;

    const qs = new URLSearchParams();
    for (const f of filters) {
      const v = (f.value || '').trim();
      if (!v) continue;
      if (statusTab !== 'ALL' && f.field === 'status') continue;
      if (f.field === 'month') {
        const range = monthToRange(v);
        if (!range) continue;
        qs.set('start', range.start);
        qs.set('end', range.end);
        continue;
      }
      qs.append(f.field, v);
    }
    const rangeStart = dateInputToStartIso(dateRange.start);
    const rangeEnd = dateInputToEndIso(dateRange.end);
    if (rangeStart) qs.set('start', rangeStart);
    if (rangeEnd) qs.set('end', rangeEnd);
    if (listTab === 'ISSUES') qs.set('hasIssue', 'true');
    if (statusTab !== 'ALL') qs.append('status', statusTab);

    return `/service-orders/export?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, filtersHydrated, filters, dateRange.end, dateRange.start, listTab, statusTab]);

  const exportReportPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug || !filtersHydrated) return null;

    const qs = new URLSearchParams();
    for (const f of filters) {
      const v = (f.value || '').trim();
      if (!v) continue;
      if (statusTab !== 'ALL' && f.field === 'status') continue;
      if (f.field === 'month') {
        const range = monthToRange(v);
        if (!range) continue;
        qs.set('start', range.start);
        qs.set('end', range.end);
        continue;
      }
      qs.append(f.field, v);
    }
    const rangeStart = dateInputToStartIso(dateRange.start);
    const rangeEnd = dateInputToEndIso(dateRange.end);
    if (rangeStart) qs.set('start', rangeStart);
    if (rangeEnd) qs.set('end', rangeEnd);
    if (listTab === 'ISSUES') qs.set('hasIssue', 'true');
    if (statusTab !== 'ALL') qs.append('status', statusTab);

    return `/service-orders/export-report?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, filtersHydrated, filters, dateRange.end, dateRange.start, listTab, statusTab]);

  const items = data?.items ?? EMPTY_ITEMS;
  const partItems = partsData?.items ?? [];
  const statusCounts = data?.statusCounts ?? {};
  const allStatusCount = useMemo(
    () => Object.values(statusCounts).reduce((acc, count) => acc + Number(count ?? 0), 0),
    [statusCounts]
  );
  const totalPages = useMemo(() => {
    const source = listTab === 'PARTS' ? partsData : data;
    const total = source?.total ?? 0;
    const size = source?.size ?? PAGE_SIZE;
    return Math.max(1, Math.ceil(total / size));
  }, [data, listTab, partsData]);
  const currentPage = (listTab === 'PARTS' ? partsData?.page : data?.page) ?? page;

  useEffect(() => {
    if (!filtersStorageKey) return;
    try {
      const raw = window.localStorage.getItem(filtersStorageKey);
      if (raw) {
        const stored = JSON.parse(raw) as PersistedServiceOrderFilters;
        setFilters(normalizeStoredFilters(stored.filters));
        setDateRange(normalizeStoredDateRange(stored.dateRange));
        if (LIST_TABS.some((tab) => tab.id === stored.listTab)) setListTab(stored.listTab as ListTab);
        if (STATUS_TABS.includes(stored.statusTab as StatusTab)) setStatusTab(stored.statusTab as StatusTab);
      } else {
        setFilters(DEFAULT_FILTERS);
        setDateRange({ start: '', end: '' });
        setListTab('ALL');
        setStatusTab('ALL');
      }
    } catch {
      setFilters(DEFAULT_FILTERS);
      setDateRange({ start: '', end: '' });
      setListTab('ALL');
      setStatusTab('ALL');
    } finally {
      setPage(1);
      setHydratedStorageKey(filtersStorageKey);
    }
  }, [filtersStorageKey]);

  useEffect(() => {
    if (!filtersHydrated || !filtersStorageKey) return;
    window.localStorage.setItem(
      filtersStorageKey,
      JSON.stringify({
        version: SERVICE_ORDER_FILTERS_STORAGE_VERSION,
        filters,
        dateRange,
        listTab,
        statusTab,
      })
    );
  }, [dateRange, filters, filtersHydrated, filtersStorageKey, listTab, statusTab]);

  useEffect(() => {
    if (!filtersHydrated) return;
    setPage(1);
  }, [filtersHydrated, filters, dateRange.end, dateRange.start, listTab, statusTab]);

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

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug || !partsPath) return;

    setLoading(true);
    setErr('');

    const t = setTimeout(() => {
      apiFetch<Paginated<ServiceOrderPartSummary>>(partsPath, { token: auth.token!, tenantSlug: auth.tenantSlug! })
        .then((d) => setPartsData(d))
        .catch((e: any) => setErr(e?.message ?? 'Error cargando repuestos de OS'))
        .finally(() => setLoading(false));
    }, 150);

    return () => clearTimeout(t);
  }, [auth.token, auth.tenantSlug, partsPath]);

  useEffect(() => {
    const source = listTab === 'PARTS' ? partsData : data;
    if (!source) return;
    if (source.total > 0 && currentPage > totalPages) {
      setPage(totalPages);
    }
  }, [currentPage, data, listTab, partsData, totalPages]);

  // Inicializa state de edición cuando llegan items nuevos
  useEffect(() => {
    if (items.length === 0) return;

    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const so of items) {
        if (next[so.id]) continue;

        const dueLocal = toLocalInputValue(so.dueDate);
        const tech = so.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user?.id ?? '';
        next[so.id] = { dueLocal, technicianId: tech };
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [items]);

  async function refreshList() {
    if (!listPath || !auth.token || !auth.tenantSlug) return;
    const d = await apiFetch<Paginated<ServiceOrder>>(listPath, { token: auth.token, tenantSlug: auth.tenantSlug });
    setData(d);
  }

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

    await refreshList();
  }

  async function saveCommercialStatus(id: string, commercialStatus: string) {
    if (!auth.token || !auth.tenantSlug) return;
    setSavingCommercialId(id);
    setErr('');
    try {
      await apiFetch(`/service-orders/${id}`, {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: { commercialStatus: commercialStatus || null },
      });
      await refreshList();
    } catch (e: any) {
      setErr(e?.message ?? 'Error actualizando estado de negociación');
    } finally {
      setSavingCommercialId('');
    }
  }

  async function exportFilteredResults() {
    if (!auth.token || !auth.tenantSlug || !exportPath) return;
    setExporting(true);
    setErr('');
    try {
      const res = await fetch(`${apiBase}${exportPath}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Error exportando (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || 'service-orders.xlsx';
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? 'Error exportando a Excel');
    } finally {
      setExporting(false);
    }
  }

  async function exportFilteredReport() {
    if (!auth.token || !auth.tenantSlug || !exportReportPath) return;
    setExportingReport(true);
    setErr('');
    try {
      const res = await fetch(`${apiBase}${exportReportPath}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Error exportando reporte (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || 'service-orders-report.pdf';
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.message ?? 'Error exportando reporte');
    } finally {
      setExportingReport(false);
    }
  }

  function addFilter(field: Filter['field']) {
    setFilters((s) => {
      if (field === 'month' && s.some((f) => f.field === 'month')) return s;
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
            {!loading && listTab !== 'PARTS' && data ? `Total: ${data.total} · Página ${currentPage} de ${totalPages}` : null}
            {!loading && listTab === 'PARTS' && partsData ? `Total repuestos: ${partsData.total} · Página ${currentPage} de ${totalPages}` : null}
            {!loading && listTab !== 'PARTS' && !data ? 'Sin datos aún' : null}
            {!loading && listTab === 'PARTS' && !partsData ? 'Sin datos aún' : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/service-orders/new" className="px-3 py-2 border rounded text-sm bg-black text-white">
            Nueva OS
          </Link>
          {listTab !== 'PARTS' ? (
            <>
              <button
                type="button"
                className="px-3 py-2 border rounded text-sm"
                onClick={exportFilteredResults}
                disabled={exporting}
              >
                {exporting ? 'Exportando...' : 'Exportar Excel'}
              </button>
              <button
                type="button"
                className="px-3 py-2 border rounded text-sm"
                onClick={exportFilteredReport}
                disabled={exportingReport}
              >
                {exportingReport ? 'Generando...' : 'Exportar reporte'}
              </button>
            </>
          ) : null}
          <Link href="/calendar" className="px-3 py-2 border rounded text-sm">
            Calendario
          </Link>
        </div>
      </div>

      {err ? (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div>
      ) : null}

      <div className="border rounded p-2">
        <div className="flex items-center gap-2 flex-wrap">
          {LIST_TABS.map((tab) => {
            const active = tab.id === listTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setListTab(tab.id)}
                className={`px-3 py-1.5 border rounded text-sm ${
                  active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          <div className="text-xs text-gray-500 ml-auto">
            {listTab === 'ISSUES'
              ? 'Mostrando equipos/OS con novedad.'
              : listTab === 'PARTS'
                ? 'Mostrando repuestos por cambiar y cambiados registrados en OS.'
                : 'Mostrando todas las órdenes de servicio.'}
          </div>
        </div>
      </div>

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
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('month')} type="button">
              + Mes
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('guarantee')} type="button">
              + Garantía
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('commercialStatus')} type="button">
              + Negociación
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('assignment')} type="button">
              + Asignación
            </button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => addFilter('technicianId')} type="button">
              + Técnico
            </button>
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Fecha programada desde</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Fecha programada hasta</label>
            <input
              type="date"
              className="border rounded px-3 py-2 text-sm"
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
            />
          </div>

          {(dateRange.start || dateRange.end) ? (
            <button
              className="px-2 py-2 border rounded text-sm text-gray-700"
              type="button"
              onClick={() => setDateRange({ start: '', end: '' })}
            >
              Limpiar rango
            </button>
          ) : null}
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
                <option value="month">Mes</option>
                <option value="guarantee">Garantía</option>
                <option value="commercialStatus">Negociación</option>
                <option value="assignment">Asignación</option>
                <option value="technicianId">Técnico</option>
                <option value="issueStatus">Estado novedad</option>
              </select>

              {f.field === 'q' ? (
                <input
                  className="border rounded px-3 py-2 text-sm w-[280px]"
                  placeholder="Buscar (título, código, cliente...)"
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

              {f.field === 'month' ? (
                <input
                  type="month"
                  className="border rounded px-3 py-2 text-sm"
                  value={f.value}
                  onChange={(e) => setFilterValue(f.id, e.target.value)}
                />
              ) : null}

              {f.field === 'guarantee' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value="IN_WARRANTY">En garantía</option>
                  <option value="OUT_OF_WARRANTY">Fuera de garantía</option>
                </select>
              ) : null}

              {f.field === 'commercialStatus' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value={COMMERCIAL_STATUS_UNDEFINED_FILTER}>Sin definir</option>
                  <option value="NO_MANAGEMENT">NG · No gestión</option>
                  <option value="PENDING_QUOTE">PC · Pendiente cotizar</option>
                  <option value="PENDING_APPROVAL">PA · Pendiente aprobación</option>
                  <option value="NOT_APPROVED">NA · No aprobado</option>
                  <option value="APPROVED">AP · Aprobado</option>
                  <option value="PROGRAMMED">PR · Programado</option>
                  <option value="CONFIRMED">CF · Confirmado</option>
                  <option value="COMPLETED">CP · Completado</option>
                </select>
              ) : null}

              {f.field === 'assignment' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value="ASSIGNED">Asignadas</option>
                  <option value="UNASSIGNED">Sin asignar</option>
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

              {f.field === 'issueStatus' ? (
                <select className="border rounded px-2 py-2 text-sm" value={f.value} onChange={(e) => setFilterValue(f.id, e.target.value)}>
                  <option value="">(cualquiera)</option>
                  <option value="OPEN">OPEN</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="WAITING_PARTS">WAITING_PARTS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="VERIFIED">VERIFIED</option>
                  <option value="CANCELED">CANCELED</option>
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

        <div className="text-xs text-gray-500">
          Tip: puedes agregar varios filtros. El filtro "Mes" y el rango de fechas usan la fecha programada. En "Repuestos OS" aplican texto, status, tipo y fechas.
        </div>
      </div>

      <div className="border rounded p-2">
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_TABS.map((t) => {
            const active = t === statusTab;
            const count = t === 'ALL' ? allStatusCount : Number(statusCounts[t] ?? 0);
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
                {listTab !== 'PARTS' && data ? (
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-700'}`}>
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="text-xs text-gray-500 ml-auto">
            Mostrando {listTab === 'PARTS' ? partItems.length : items.length} resultados en esta página
          </div>
        </div>
      </div>

      {listTab === 'PARTS' ? (
        <div className="border rounded overflow-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border-b">Estado</th>
                <th className="text-left p-2 border-b">Repuesto</th>
                <th className="text-left p-2 border-b">Cantidad</th>
                <th className="text-left p-2 border-b">OS</th>
                <th className="text-left p-2 border-b">Cliente / Serie</th>
                <th className="text-left p-2 border-b">Tipo OS</th>
                <th className="text-left p-2 border-b">Fecha</th>
                <th className="text-left p-2 border-b">Cambiado por</th>
                <th className="text-left p-2 border-b">Relación</th>
                <th className="text-left p-2 border-b">Notas</th>
              </tr>
            </thead>
            <tbody>
              {partItems.map((part) => {
                const wo = part.workOrder;
                const asset = wo?.asset;
                const isReplaced = part.stage === 'REPLACED';
                const refDate = isReplaced
                  ? part.replacedAt || wo?.deliveredAt || wo?.completedAt || wo?.dueDate || part.createdAt
                  : wo?.dueDate || part.createdAt;
                const who = part.replacedByUser?.name || part.replacedByUser?.email || '-';

                return (
                  <tr key={part.id} className="hover:bg-gray-50">
                    <td className="p-2 border-b whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 border rounded text-xs ${
                          isReplaced
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        {isReplaced ? 'Cambiado' : 'Por cambiar'}
                      </span>
                    </td>
                    <td className="p-2 border-b">
                      <div className="font-medium">{partSummaryLabel(part)}</div>
                      {part.inventoryItem?.model ? <div className="text-xs text-gray-600">{part.inventoryItem.model}</div> : null}
                    </td>
                    <td className="p-2 border-b whitespace-nowrap">{part.qty ?? 1}</td>
                    <td className="p-2 border-b">
                      {wo?.id ? (
                        <Link className="font-medium underline" href={`/service-orders/${wo.id}`}>
                          {wo.assetCode || wo.id.slice(-8)}
                        </Link>
                      ) : (
                        '-'
                      )}
                      <div className="text-xs text-gray-600">{wo?.title || ''}</div>
                      <div className="text-xs text-gray-500">{wo?.status || ''}</div>
                    </td>
                    <td className="p-2 border-b">
                      <div>{asset?.customer || '-'}</div>
                      <div className="text-xs text-gray-600">{asset?.serialNumber || '-'}</div>
                    </td>
                    <td className="p-2 border-b whitespace-nowrap">{wo?.serviceOrderType || '-'}</td>
                    <td className="p-2 border-b whitespace-nowrap">{refDate ? String(refDate).slice(0, 10) : '-'}</td>
                    <td className="p-2 border-b">{isReplaced ? who : '-'}</td>
                    <td className="p-2 border-b">
                      <div className="flex flex-col gap-1 text-xs">
                        {part.sourceServiceOrderId ? (
                          <Link className="underline text-sky-700" href={`/service-orders/${part.sourceServiceOrderId}`}>
                            Origen OS {part.sourceServiceOrderId.slice(-8)}
                          </Link>
                        ) : null}
                        {part.replacementServiceOrderId ? (
                          <Link className="underline text-emerald-700" href={`/service-orders/${part.replacementServiceOrderId}`}>
                            Cambiado en OS {part.replacementServiceOrderId.slice(-8)}
                          </Link>
                        ) : null}
                        {!part.sourceServiceOrderId && !part.replacementServiceOrderId ? '-' : null}
                      </div>
                    </td>
                    <td className="p-2 border-b">{part.notes || ''}</td>
                  </tr>
                );
              })}
              {partItems.length === 0 ? (
                <tr>
                  <td className="p-4 text-gray-600" colSpan={10}>
                    Sin repuestos registrados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="border rounded overflow-auto">
        <table className="min-w-[1220px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Creada</th>
              <th className="text-left p-2 border-b">OS</th>
              <th className="text-left p-2 border-b">Cliente / Serie</th>
              <th className="text-left p-2 border-b">Status</th>
              <th className="text-left p-2 border-b">Negociación</th>
              <th className="text-left p-2 border-b">Tipo</th>
              <th className="text-left p-2 border-b">Novedad</th>
              <th className="text-left p-2 border-b">Programación</th>
              <th className="text-left p-2 border-b">Técnico</th>
              <th className="text-left p-2 border-b">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((so) => {
              const row = edits[so.id] || { dueLocal: '', technicianId: '' };
              const commercial = commercialStatusMeta(so.commercialStatus);
              const commercialNotesCount = Number(so._count?.commercialNotes ?? 0);
              const canEditCommercialStatus = isAdmin && String(so.status || '').toUpperCase() === 'SCHEDULED';
              const isSavingCommercial = savingCommercialId === so.id;
              return (
                <tr key={so.id} className="hover:bg-gray-50">
                  <td className="p-2 border-b whitespace-nowrap">{fmt(so.createdAt)}</td>
                  <td className="p-2 border-b">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link className="font-medium underline" href={`/service-orders/${so.id}`}>
                        {so.assetCode}
                      </Link>
                      {commercialNotesCount > 0 ? (
                        <span
                          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800"
                          title={`${commercialNotesCount} registro${commercialNotesCount === 1 ? '' : 's'} de seguimiento comercial`}
                        >
                          SC {commercialNotesCount}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-gray-600">{so.title}</div>
                  </td>
                  <td className="p-2 border-b">
                    <div>{so.asset?.customer || '-'}</div>
                    <div className="text-xs text-gray-600">{so.asset?.serialNumber || '-'}</div>
                  </td>
                  <td className="p-2 border-b whitespace-nowrap">{so.status}</td>
                  <td className="p-2 border-b whitespace-nowrap">
                    {isAdmin ? (
                      <div className="space-y-1">
                        <select
                          className="border rounded px-2 py-1 text-sm min-w-[170px]"
                          value={so.commercialStatus ?? ''}
                          disabled={isSavingCommercial || !canEditCommercialStatus}
                          onChange={(e) => saveCommercialStatus(so.id, e.target.value)}
                          title={!canEditCommercialStatus ? 'Disponible solo cuando la OS está en SCHEDULED.' : 'Seguimiento comercial con el cliente.'}
                        >
                          <option value="">(sin definir)</option>
                          <option value="NO_MANAGEMENT">NG · No gestión</option>
                          <option value="PENDING_QUOTE">PC · Pendiente cotizar</option>
                          <option value="PENDING_APPROVAL">PA · Pendiente aprobación</option>
                          <option value="NOT_APPROVED">NA · No aprobado</option>
                          <option value="APPROVED">AP · Aprobado</option>
                          <option value="PROGRAMMED">PR · Programado</option>
                          <option value="CONFIRMED">CF · Confirmado</option>
                          <option value="COMPLETED">CP · Completado</option>
                        </select>
                        {commercial ? (
                          <span className={`inline-flex px-2 py-0.5 border rounded text-xs ${commercial.className}`} title={commercial.label}>
                            {commercial.code}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500">Sin definir</span>
                        )}
                      </div>
                    ) : (
                      commercial ? (
                        <span className={`px-2 py-0.5 border rounded text-xs ${commercial.className}`} title={commercial.label}>
                          {commercial.code}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )
                    )}
                  </td>
                  <td className="p-2 border-b whitespace-nowrap">{so.serviceOrderType || '-'}</td>
                  <td className="p-2 border-b whitespace-nowrap">
                    {so.hasIssue ? (
                      <span className="px-2 py-0.5 border rounded text-xs bg-amber-50 text-amber-800 border-amber-200">
                        {so.serviceOrderIssue?.status || 'OPEN'}
                      </span>
                    ) : so.serviceOrderIssue?.status ? (
                      <span className="px-2 py-0.5 border rounded text-xs bg-gray-50 text-gray-700 border-gray-200">
                        {so.serviceOrderIssue.status}
                      </span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
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
            {items.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={10}>
                  Sin resultados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap border rounded p-3">
        <div className="text-sm text-gray-600">
          Página {currentPage} de {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1 || loading}
          >
            Anterior
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
              let pageNumber = idx + 1;
              if (totalPages > 5) {
                const start = Math.min(Math.max(1, currentPage - 2), totalPages - 4);
                pageNumber = start + idx;
              }
              const active = pageNumber === currentPage;
              return (
                <button
                  key={pageNumber}
                  type="button"
                  className={`min-w-9 px-2 py-1.5 border rounded text-sm ${
                    active ? 'bg-black text-white border-black' : 'bg-white text-gray-700'
                  }`}
                  onClick={() => setPage(pageNumber)}
                  disabled={loading}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages || loading}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
