'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { format } from 'date-fns';

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Line,
  LabelList,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type OperationalTimeRow = {
  key: 'travel' | 'intake' | 'handover' | 'onsite' | 'wrapup' | 'total';
  label: string;
  span?: string;
  count: number;
  avgHours: number | null;
  p50Hours: number | null;
  p90Hours: number | null;
};

type OpSegmentMetric = {
  count: number;
  avgHours: number | null;
  p50Hours: number | null;
  p90Hours: number | null;
};

type OpComparisonGroup = {
  groupKey: string;
  groupLabel: string;
  segments: Record<string, OpSegmentMetric>;
};

type OperationalTimesComparisons = {
  segments: Array<{ key: OperationalTimeRow['key']; label: string; span: string }>;
  byTechnician: OpComparisonGroup[];
  byServiceOrderType: OpComparisonGroup[];
  byCustomer: OpComparisonGroup[];
  byLocation: OpComparisonGroup[];
};

type ScheduledNegotiationMonthRow = {
  month: string;
  scheduled: number;
  pendingQuote: number;
  pendingApproval: number;
  approved: number;
  confirmed: number;
  undefinedStatus: number;
};

type ScheduledNegotiationChartRow = {
  monthKey: string;
  month: string;
  scheduled: number;
  pc: number;
  pa: number;
  ap: number;
  cf: number;
  undefinedStatus: number;
};

type Summary = {
  range: { from: string; to: string; days: number };

  assets: {
    total: number;
    inWarranty: number;
    inWarrantyExcludingManual: number;
    forkliftsTotal: number;
    forkliftsInWarranty: number;
    inWarrantyByName: Array<{ name: string; inWarranty: number }>;
    byStatus: Record<string, number>;
    byCriticality: Record<string, number>;
    criticalHigh: number;
    withOpenServiceOrders: number;
    topAssetsByOpenSO: Array<{ assetCode: string; openSO: number }>;
  };

  service: {
    backlogTotal: number;
    backlogByStatus: Record<string, number>;
    overdue: number;
    unassigned: number;
    createdInRange: number;
    closedInRange: number;
    mttrHours: number | null;
    trendCreated: Array<{ day: string; count: number }>;
    trendClosed: Array<{ day: string; count: number }>;
    scheduledNegotiationByMonth: ScheduledNegotiationMonthRow[];

    technicianWorkload: Array<{ userId: string; name: string; openAssigned: number }>;

    technicianPerformance: Array<{
      userId: string;
      name: string;
      closedInRange: number;
      effectiveHours: number;
      hrsPerOs: number | null;
      availableHours: number;
      utilizationPct: number | null;
      openAssigned: number;
      overdueOpenAssigned: number;
      onTimeRate?: number | null;
      // optional legacy/derived fields used by UI (may not be present in API)
      avgCycleHours?: number | null;
      avgResponseHours?: number | null;
    }>;

    technicianWeeklyProductivity: Array<{
      weekStart: string;
      userId: string;
      name: string;
      closedCount: number;
      workHours: number;
      availableHours: number;
      utilizationPct: number | null;
    }>;

    technicianTypeAverages: Array<{
      userId: string;
      name: string;
      preventiveCount: number;
      correctiveCount: number;
      diagnosticCount: number;
      dailyPreventive: number;
      dailyCorrective: number;
      dailyDiagnostic: number;
      weeklyPreventive: number;
      weeklyCorrective: number;
      weeklyDiagnostic: number;
      dailyTotal: number;
      weeklyTotal: number;
    }>;

    closedOrdersSummary?: {
      byTechnician: Array<{ userId: string; name: string; closedCount: number }>;
      byServiceType: Array<{ serviceType: string; closedCount: number }>;
      byTechnicianAndServiceType: Array<{ userId: string; name: string; serviceType: string; closedCount: number }>;
    };

    operationalTimes: OperationalTimeRow[];
    operationalTimesComparisons?: OperationalTimesComparisons;
  };
};


function HelpTip(props: { text: string }) {
  return (
    <span
      className="inline-flex items-center justify-center ml-2 w-4 h-4 rounded-full border border-neutral-300 text-[10px] text-neutral-600 cursor-help"
      title={props.text}
      aria-label={props.text}
    >
      ?
    </span>
  );
}

function fmtHours(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(2);
}

function fmtFixed(value: unknown, digits: number) {
  if (value == null) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function serviceTypeLabel(v?: string | null) {
  const t = String(v ?? '').trim().toUpperCase();
  if (!t || t === 'UNSPECIFIED' || t === 'NULL') return '(sin tipo)';
  return t;
}

function monthKeyFromValue(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  const directMatch = raw.match(/^(\d{4})-(\d{2})/);
  if (directMatch) return `${directMatch[1]}-${directMatch[2]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pctOfScheduled(value: number, scheduled: number) {
  if (!scheduled || !Number.isFinite(value) || !Number.isFinite(scheduled)) return 0;
  return Math.round((value / scheduled) * 100);
}

function formatBarValue(value: unknown, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

function createBarValueLabel(props: { placement: 'top' | 'center' | 'end'; digits?: number; fill?: string }) {
  return function BarValueLabel(labelProps: any) {
    const { x, y, width, height, value } = labelProps;
    const text = formatBarValue(value, props.digits ?? 0);
    if (!text || x == null || y == null || width == null || height == null) return null;

    const numericX = Number(x);
    const numericY = Number(y);
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)) return null;

    if (props.placement === 'center' && (numericWidth < 24 || numericHeight < 16)) return null;

    const base = {
      fill: props.fill ?? '#0f172a',
      fontSize: 11,
      dominantBaseline: 'middle' as const,
    };

    if (props.placement === 'top') {
      return (
        <text x={numericX + numericWidth / 2} y={numericY - 6} textAnchor="middle" {...base}>
          {text}
        </text>
      );
    }

    if (props.placement === 'end') {
      return (
        <text x={numericX + numericWidth + 6} y={numericY + numericHeight / 2} textAnchor="start" {...base}>
          {text}
        </text>
      );
    }

    return (
      <text x={numericX + numericWidth / 2} y={numericY + numericHeight / 2} textAnchor="middle" {...base}>
        {text}
      </text>
    );
  };
}

const TopIntegerBarLabel = createBarValueLabel({ placement: 'top', digits: 0 });
const EndIntegerBarLabel = createBarValueLabel({ placement: 'end', digits: 0 });
const CenterIntegerBarLabel = createBarValueLabel({ placement: 'center', digits: 0, fill: '#ffffff' });
const CenterDecimalBarLabel = createBarValueLabel({ placement: 'center', digits: 2, fill: '#ffffff' });

function NegotiationTooltip(props: any) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ScheduledNegotiationChartRow | undefined;
  if (!row) return null;
  const items = [
    { key: 'scheduled', label: 'SCHEDULED total', color: '#0f172a', value: row.scheduled, showPct: false },
    { key: 'pc', label: 'PC', color: '#f97316', value: row.pc, showPct: true },
    { key: 'pa', label: 'PA', color: '#f59e0b', value: row.pa, showPct: true },
    { key: 'ap', label: 'AP', color: '#0ea5e9', value: row.ap, showPct: true },
    { key: 'cf', label: 'CF', color: '#22c55e', value: row.cf, showPct: true },
    { key: 'undefinedStatus', label: 'Sin definir', color: '#94a3b8', value: row.undefinedStatus, showPct: true },
  ];
  return (
    <div className="rounded-md border bg-white p-3 text-sm shadow-sm">
      <div className="mb-2 font-medium">{label}</div>
      <div className="space-y-1">
        {items.map((item) => {
          const pct = item.showPct ? pctOfScheduled(item.value, row.scheduled) : null;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </span>
              <span className="font-medium">
                {item.value}
                {pct != null ? ` (${pct}%)` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type RangePreset = '1' | '7' | '30' | '90' | 'custom';

function toIsoLocalDayStart(v: string) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toIsoLocalDayEndExclusive(v: string) {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function StatCard(props: { title: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <Card className={props.href ? 'hover:shadow-sm transition-shadow' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-600 flex items-center">{props.title}{props.hint ? <HelpTip text={props.hint} /> : null}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{props.value}</div>
        {props.hint ? <div className="text-xs text-neutral-500 mt-1">{props.hint}</div> : null}
      </CardContent>
    </Card>
  );

  return props.href ? <Link href={props.href}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const token =
    (session as any)?.token ||
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

  const [rangePreset, setRangePreset] = useState<RangePreset>('30');
  const [appliedRange, setAppliedRange] = useState<{ days?: string; from?: string; to?: string }>({ days: '30' });
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [selectedNegotiationMonth, setSelectedNegotiationMonth] = useState<string>('all');
  const [opDim, setOpDim] = useState<'TECHNICIAN' | 'TYPE' | 'CUSTOMER' | 'LOCATION'>('TECHNICIAN');
  const [opMetric, setOpMetric] = useState<'avg' | 'p50' | 'p90'>('p90');
  const [opSegment, setOpSegment] = useState<'travel' | 'intake' | 'handover' | 'onsite' | 'wrapup' | 'total'>('total');

  type DashboardKey = readonly [string, string, string];
  type NegotiationMonthsKey = readonly [string, string, string];

  const dashboardQuery = useMemo(() => {
    const qs = new URLSearchParams();
    if (appliedRange.from && appliedRange.to) {
      qs.set('from', appliedRange.from);
      qs.set('to', appliedRange.to);
    } else {
      qs.set('days', appliedRange.days || '30');
    }
    return qs.toString();
  }, [appliedRange.days, appliedRange.from, appliedRange.to]);

  const dashboardKey: DashboardKey | null =
    token && tenantSlug
      ? ([`/dashboard/summary?${dashboardQuery}`, String(token), String(tenantSlug)] as const)
      : null;  // Fetcher para SWR:
  // - Cuando `dashboardKey` es null, SWR NO ejecuta el fetcher.
  // - Aun así, tipamos el argumento como `DashboardKey | null` para evitar errores de Typescript.
  const fetchSummary = (key: DashboardKey | null) => {
    if (!key) throw new Error('Missing dashboardKey');
    const [url, t, slug] = key;
    return apiFetch<Summary>(url, { token: t, tenantSlug: slug });
  };

  const negotiationMonthsKey: NegotiationMonthsKey | null =
    token && tenantSlug
      ? (['/dashboard/scheduled-negotiation-months', String(token), String(tenantSlug)] as const)
      : null;

  const fetchNegotiationMonths = (key: NegotiationMonthsKey | null) => {
    if (!key) throw new Error('Missing negotiationMonthsKey');
    const [url, t, slug] = key;
    return apiFetch<ScheduledNegotiationMonthRow[]>(url, { token: t, tenantSlug: slug });
  };

  const { data, error, isLoading } = useSWR<Summary, any, DashboardKey | null>(
    dashboardKey,
    fetchSummary,
    { refreshInterval: 15000 }
  );

  const {
    data: negotiationMonths,
    error: negotiationMonthsError,
    isLoading: isNegotiationMonthsLoading,
  } = useSWR<ScheduledNegotiationMonthRow[], any, NegotiationMonthsKey | null>(
    negotiationMonthsKey,
    fetchNegotiationMonths,
    { refreshInterval: 15000 }
  );

  const rangeLabel = useMemo(() => {
    if (!data?.range) return '';
    const from = new Date(data.range.from).toLocaleDateString();
    const to = new Date(data.range.to).toLocaleDateString();
    return `${from} → ${to}`;
  }, [data?.range]);

  const opComp = data?.service.operationalTimesComparisons;

  const techOptions = useMemo(() => {
    const rows = data?.service.technicianWeeklyProductivity ?? [];
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.userId, r.name);
    // fallback: usa el listado de technicianPerformance si no hay rows aún
    if (!map.size) {
      for (const r of data?.service.technicianPerformance ?? []) map.set(r.userId, r.name);
    }
    return Array.from(map.entries())
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.service.technicianWeeklyProductivity, data?.service.technicianPerformance]);

  const techScoreboard = useMemo(() => {
    const rows = data?.service.technicianPerformance ?? [];
    const byClosed = [...rows].sort((a, b) => (b.closedInRange ?? 0) - (a.closedInRange ?? 0));
    const byUtil = [...rows].sort((a, b) => (b.utilizationPct ?? 0) - (a.utilizationPct ?? 0));

    const topThroughputId = byClosed[0]?.userId;
    const bottomThroughputId = byClosed.length > 2 ? byClosed[byClosed.length - 1]?.userId : undefined;

    const topUtilId = byUtil[0]?.userId;
    const bottomUtilId = byUtil.length > 2 ? byUtil[byUtil.length - 1]?.userId : undefined;

    return { topThroughputId, bottomThroughputId, topUtilId, bottomUtilId };
  }, [data?.service.technicianPerformance]);

  const customRangeError = useMemo(() => {
    if (rangePreset !== 'custom') return '';
    if (!customFrom || !customTo) return '';
    const a = new Date(`${customFrom}T00:00:00`);
    const b = new Date(`${customTo}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'Rango de fechas inválido.';
    if (a.getTime() > b.getTime()) return 'La fecha inicial no puede ser mayor a la final.';
    return '';
  }, [rangePreset, customFrom, customTo]);

  function applyCustomRange() {
    const fromIso = toIsoLocalDayStart(customFrom);
    const toIso = toIsoLocalDayEndExclusive(customTo);
    if (!fromIso || !toIso) return;
    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) return;
    setAppliedRange({ from: fromIso, to: toIso });
  }

  function onPresetChange(v: RangePreset) {
    setRangePreset(v);
    if (v !== 'custom') {
      setAppliedRange({ days: v });
      return;
    }
    if (!customFrom || !customTo) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yyyy}-${mm}-${dd}`;
      setCustomFrom(today);
      setCustomTo(today);
    }
  }

  useEffect(() => {
    if (!selectedTechId && techOptions.length) {
      setSelectedTechId(techOptions[0].userId);
    }
  }, [selectedTechId, techOptions]);

  const weeklyChartData = useMemo(() => {
    const rows = (data?.service.technicianWeeklyProductivity ?? [])
      .filter(r => r.userId === selectedTechId)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    return rows.map(r => {
      const d = new Date(r.weekStart);
      const label = Number.isNaN(d.getTime()) ? r.weekStart : format(d, 'dd MMM');
      return {
        week: label,
        closed: r.closedCount,
        hours: r.workHours,
        utilization: r.utilizationPct ?? (r.availableHours ? Math.round(((r.workHours ?? 0) / r.availableHours) * 1000) / 10 : null),
      };
    });
  }, [data?.service.technicianWeeklyProductivity, selectedTechId]);

  const weeklyTechTotals = useMemo(() => {
    const rows = (data?.service.technicianWeeklyProductivity ?? []).filter(r => r.userId === selectedTechId);
    const closed = rows.reduce((a, b) => a + (b.closedCount ?? 0), 0);
    const hours = rows.reduce((a, b) => a + (b.workHours ?? 0), 0);
    const available = rows.reduce((a, b) => a + (b.availableHours ?? 0), 0);
    const hrsPerClosed = closed ? Math.round((hours / closed) * 100) / 100 : null;
    const utilizationPct = available ? Math.round((hours / available) * 1000) / 10 : null;
    return { closed, hours, available, hrsPerClosed, utilizationPct };
  }, [data?.service.technicianWeeklyProductivity, selectedTechId]);

  const technicianTypeAverageChart = useMemo(
    () =>
      (data?.service.technicianTypeAverages ?? []).map((row) => ({
        userId: row.userId,
        name: row.name,
        dailyPreventive: row.dailyPreventive,
        dailyCorrective: row.dailyCorrective,
        dailyDiagnostic: row.dailyDiagnostic,
        weeklyPreventive: row.weeklyPreventive,
        weeklyCorrective: row.weeklyCorrective,
        weeklyDiagnostic: row.weeklyDiagnostic,
        dailyTotal: row.dailyTotal,
        weeklyTotal: row.weeklyTotal,
      })),
    [data?.service.technicianTypeAverages]
  );

  const technicianTypeAverageChartHeight = useMemo(
    () => Math.max(300, technicianTypeAverageChart.length * 52),
    [technicianTypeAverageChart.length]
  );

  const closedSummary = data?.service.closedOrdersSummary;

  const closedByTechnicianChart = useMemo(
    () =>
      (closedSummary?.byTechnician ?? [])
        .map(r => ({ name: r.name, closed: r.closedCount }))
        .slice(0, 15),
    [closedSummary?.byTechnician]
  );

  const closedByServiceTypeChart = useMemo(
    () =>
      (closedSummary?.byServiceType ?? []).map(r => ({
        serviceType: serviceTypeLabel(r.serviceType),
        closed: r.closedCount,
      })),
    [closedSummary?.byServiceType]
  );

  const closedStackKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of closedSummary?.byTechnicianAndServiceType ?? []) {
      keys.add(serviceTypeLabel(row.serviceType));
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [closedSummary?.byTechnicianAndServiceType]);

  const closedByTechAndTypeChart = useMemo(() => {
    const grouped = new Map<string, Record<string, string | number>>();
    for (const row of closedSummary?.byTechnicianAndServiceType ?? []) {
      const typeKey = serviceTypeLabel(row.serviceType);
      const cur = grouped.get(row.userId) ?? { tech: row.name, total: 0 };
      cur[typeKey] = Number(cur[typeKey] ?? 0) + row.closedCount;
      cur.total = Number(cur.total ?? 0) + row.closedCount;
      grouped.set(row.userId, cur);
    }
    return Array.from(grouped.values())
      .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
      .slice(0, 15);
  }, [closedSummary?.byTechnicianAndServiceType]);

  const closedStackColors = useMemo(() => {
    const palette = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#0f766e'];
    return closedStackKeys.reduce<Record<string, string>>((acc, key, idx) => {
      acc[key] = palette[idx % palette.length];
      return acc;
    }, {});
  }, [closedStackKeys]);

  const scheduledNegotiationChart = useMemo(
    () => {
      const rows = negotiationMonths ?? [];
      const result: ScheduledNegotiationChartRow[] = [];

      for (const row of rows) {
        const monthKey = monthKeyFromValue(row.month);
        if (!monthKey) continue;
        const scheduled = Number(row?.scheduled ?? 0);
        const pc = Number(row?.pendingQuote ?? 0);
        const pa = Number(row?.pendingApproval ?? 0);
        const ap = Number(row?.approved ?? 0);
        const cf = Number(row?.confirmed ?? 0);
        const undefinedStatus = Math.max(0, scheduled - pc - pa - ap - cf);
        const [year, month] = monthKey.split('-').map(Number);
        result.push({
          monthKey,
          month: new Date(year, (month || 1) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
          scheduled,
          pc,
          pa,
          ap,
          cf,
          undefinedStatus,
        });
      }

      return result.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    },
    [negotiationMonths]
  );

  const scheduledNegotiationMonthOptions = useMemo(
    () => scheduledNegotiationChart.map((row) => ({ value: row.monthKey, label: row.month })),
    [scheduledNegotiationChart]
  );

  useEffect(() => {
    if (selectedNegotiationMonth === 'all') return;
    const exists = scheduledNegotiationMonthOptions.some((option) => option.value === selectedNegotiationMonth);
    if (!exists) setSelectedNegotiationMonth('all');
  }, [selectedNegotiationMonth, scheduledNegotiationMonthOptions]);

  const visibleScheduledNegotiationChart = useMemo(() => {
    if (selectedNegotiationMonth === 'all') return scheduledNegotiationChart;
    return scheduledNegotiationChart.filter((row) => row.monthKey === selectedNegotiationMonth);
  }, [scheduledNegotiationChart, selectedNegotiationMonth]);

  const scheduledNegotiationTotals = useMemo(
    () =>
      visibleScheduledNegotiationChart.reduce(
        (acc, row) => {
          acc.scheduled += row.scheduled;
          acc.pc += row.pc;
          acc.pa += row.pa;
          acc.ap += row.ap;
          acc.cf += row.cf;
          acc.undefinedStatus += row.undefinedStatus;
          return acc;
        },
        { scheduled: 0, pc: 0, pa: 0, ap: 0, cf: 0, undefinedStatus: 0 }
      ),
    [visibleScheduledNegotiationChart]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="text-sm text-neutral-500">Enfoque: Activos + Servicio técnico</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-500">{rangeLabel}</div>
          <Select value={rangePreset} onValueChange={(v: any) => onPresetChange(v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Rango" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Último día</SelectItem>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
              <SelectItem value="custom">Rango personalizado</SelectItem>
            </SelectContent>
          </Select>
          {rangePreset === 'custom' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-xs text-neutral-500">a</span>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={applyCustomRange}
                disabled={!customFrom || !customTo || !!customRangeError}
              >
                Aplicar
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {rangePreset === 'custom' && customRangeError ? (
        <Card>
          <CardContent className="p-3 text-sm text-amber-700">{customRangeError}</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">
            Error cargando dashboard: {String((error as any)?.message ?? error)}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="assets" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assets">Gestión de activos</TabsTrigger>
          <TabsTrigger value="service">Gestión de servicio técnico</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <StatCard title="Activos totales" value={isLoading ? '—' : data?.assets.total ?? 0} href="/assets" />
            <StatCard
              title="Activos en garantía"
              value={isLoading ? '—' : data?.assets.inWarranty ?? 0}
              href="/assets"
            />
            <StatCard
              title="Garantía sin manuales"
              value={isLoading ? '—' : data?.assets.inWarrantyExcludingManual ?? 0}
              href="/assets"
            />
            <StatCard
              title="Activos críticos (HIGH)"
              value={isLoading ? '—' : data?.assets.criticalHigh ?? 0}
              hint="Prioriza mantenimiento/inspecciones"
              href="/assets"
            />
            <StatCard
              title="Activos con OS abiertas"
              value={isLoading ? '—' : data?.assets.withOpenServiceOrders ?? 0}
              hint="Activos con backlog"
              href="/service-orders"
            />
            <StatCard
              title="Total montacargas"
              value={isLoading ? '—' : data?.assets.forkliftsTotal ?? 0}
              href="/assets"
            />
            <StatCard
              title="Montacargas en garantía"
              value={isLoading ? '—' : data?.assets.forkliftsInWarranty ?? 0}
              hint='Montacargas con garantía vigente'
              href="/assets"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Top activos con OS abiertas</CardTitle>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/service-orders">Ver OS</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!data?.assets.topAssetsByOpenSO?.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activo</TableHead>
                        <TableHead className="text-right">OS abiertas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.assets.topAssetsByOpenSO.map(r => (
                        <TableRow key={r.assetCode}>
                          <TableCell className="font-mono">{r.assetCode}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.openSO}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Equipos en garantía por name</CardTitle>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/assets">Ver activos</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!data?.assets.inWarrantyByName?.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">En garantía</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.assets.inWarrantyByName.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.inWarranty}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base flex items-center">
                Negociación de OS programadas por mes
                <HelpTip text='Cuenta todas las órdenes en estado SCHEDULED con fecha programada y las desglosa por estado comercial, sin depender del rango principal del dashboard.' />
              </CardTitle>
              <Select value={selectedNegotiationMonth} onValueChange={setSelectedNegotiationMonth}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Mes a visualizar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {scheduledNegotiationMonthOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-4">
              {negotiationMonthsError ? (
                <div className="text-sm text-red-600">
                  Error cargando negociación por mes: {String((negotiationMonthsError as any)?.message ?? negotiationMonthsError)}
                </div>
              ) : !visibleScheduledNegotiationChart.length ? (
                isNegotiationMonthsLoading ? (
                  <div className="text-sm text-neutral-500">Cargando meses con OS programadas...</div>
                ) : (
                  <div className="text-sm text-neutral-500">Sin meses con OS programadas</div>
                )
              ) : (
                <>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={visibleScheduledNegotiationChart} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis allowDecimals={false} />
                        <Tooltip content={<NegotiationTooltip />} />
                        <Legend />
                        <Bar dataKey="pc" stackId="negotiation" name="PC" fill="#f97316" radius={[0, 0, 0, 0]}>
                          <LabelList dataKey="pc" content={<CenterIntegerBarLabel />} />
                        </Bar>
                        <Bar dataKey="pa" stackId="negotiation" name="PA" fill="#f59e0b" radius={[0, 0, 0, 0]}>
                          <LabelList dataKey="pa" content={<CenterIntegerBarLabel />} />
                        </Bar>
                        <Bar dataKey="ap" stackId="negotiation" name="AP" fill="#0ea5e9" radius={[0, 0, 0, 0]}>
                          <LabelList dataKey="ap" content={<CenterIntegerBarLabel />} />
                        </Bar>
                        <Bar dataKey="cf" stackId="negotiation" name="CF" fill="#22c55e" radius={[0, 0, 0, 0]}>
                          <LabelList dataKey="cf" content={<CenterIntegerBarLabel />} />
                        </Bar>
                        <Bar dataKey="undefinedStatus" stackId="negotiation" name="Sin definir" fill="#cbd5e1" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="undefinedStatus" content={<CenterIntegerBarLabel />} />
                        </Bar>
                        <Line type="monotone" dataKey="scheduled" name="SCHEDULED total" stroke="#0f172a" strokeWidth={2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">SCHEDULED</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.scheduled}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">PC</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.pc}</div>
                      <div className="text-xs text-neutral-500">{pctOfScheduled(scheduledNegotiationTotals.pc, scheduledNegotiationTotals.scheduled)}%</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">PA</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.pa}</div>
                      <div className="text-xs text-neutral-500">{pctOfScheduled(scheduledNegotiationTotals.pa, scheduledNegotiationTotals.scheduled)}%</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">AP</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.ap}</div>
                      <div className="text-xs text-neutral-500">{pctOfScheduled(scheduledNegotiationTotals.ap, scheduledNegotiationTotals.scheduled)}%</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">CF</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.cf}</div>
                      <div className="text-xs text-neutral-500">{pctOfScheduled(scheduledNegotiationTotals.cf, scheduledNegotiationTotals.scheduled)}%</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-neutral-500">Sin definir</div>
                      <div className="text-lg font-semibold">{scheduledNegotiationTotals.undefinedStatus}</div>
                      <div className="text-xs text-neutral-500">{pctOfScheduled(scheduledNegotiationTotals.undefinedStatus, scheduledNegotiationTotals.scheduled)}%</div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="service" className="space-y-4">
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/service-orders/new">Crear orden de servicio</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/service-orders">Ver backlog</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <StatCard title="Backlog total" value={isLoading ? '—' : data?.service.backlogTotal ?? 0} href="/service-orders" />
            <StatCard title="Vencidas" value={isLoading ? '—' : data?.service.overdue ?? 0} hint="dueDate < hoy" href="/service-orders" />
            <StatCard title="Sin asignar" value={isLoading ? '—' : data?.service.unassigned ?? 0} hint="Sin técnico activo" href="/service-orders" />
            <StatCard title="Cerradas en rango" value={isLoading ? '—' : data?.service.closedInRange ?? 0} />
            <StatCard title="MTTR (horas)" value={isLoading ? '—' : (data?.service.mttrHours ?? '—')} hint="Promedio cierre (rango)" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen de cierres por rango</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!closedSummary ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="rounded-md border p-3">
                      <div className="text-sm font-medium mb-2">Órdenes cerradas por técnico (Top 15)</div>
                      {!closedByTechnicianChart.length ? (
                        <div className="text-sm text-neutral-500">Sin datos</div>
                      ) : (
                        <div className="h-[280px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={closedByTechnicianChart}
                              layout="vertical"
                              margin={{ top: 6, right: 14, left: 12, bottom: 6 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis type="number" allowDecimals={false} />
                              <YAxis type="category" dataKey="name" width={130} interval={0} />
                              <Tooltip formatter={(v: any) => [v, 'Cerradas']} />
                              <Bar dataKey="closed" name="Cerradas" fill="#2563eb" radius={[0, 4, 4, 0]}>
                                <LabelList dataKey="closed" content={<EndIntegerBarLabel />} />
                              </Bar>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    <div className="rounded-md border p-3">
                      <div className="text-sm font-medium mb-2">Totales por clase de servicio</div>
                      {!closedByServiceTypeChart.length ? (
                        <div className="text-sm text-neutral-500">Sin datos</div>
                      ) : (
                        <div className="h-[280px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={closedByServiceTypeChart} margin={{ top: 6, right: 14, left: 6, bottom: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="serviceType" angle={-20} textAnchor="end" interval={0} height={55} />
                              <YAxis allowDecimals={false} />
                              <Tooltip formatter={(v: any) => [v, 'Cerradas']} />
                              <Bar dataKey="closed" name="Cerradas" fill="#16a34a" radius={[4, 4, 0, 0]}>
                                <LabelList dataKey="closed" content={<TopIntegerBarLabel />} />
                              </Bar>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Totales de técnico por clase (Top 15 técnicos)</div>
                    {!closedByTechAndTypeChart.length ? (
                      <div className="text-sm text-neutral-500">Sin datos</div>
                    ) : (
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={closedByTechAndTypeChart} margin={{ top: 6, right: 14, left: 6, bottom: 28 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="tech" angle={-20} textAnchor="end" interval={0} height={55} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Legend />
                            {closedStackKeys.map((k) => (
                              <Bar key={k} dataKey={k} stackId="closedByType" fill={closedStackColors[k]} name={k}>
                                <LabelList dataKey={k} content={<CenterIntegerBarLabel />} />
                              </Bar>
                            ))}
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  <div className="text-xs text-neutral-500">
                    Tablas de detalle:
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Órdenes cerradas por técnico</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Técnico</TableHead>
                            <TableHead className="text-right">Cerradas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(closedSummary.byTechnician ?? []).map((r) => (
                            <TableRow key={r.userId}>
                              <TableCell>{r.name}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{r.closedCount}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(closedSummary.byTechnician ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell className="text-neutral-500" colSpan={2}>Sin datos</TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Totales por clase de servicio</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Clase</TableHead>
                            <TableHead className="text-right">Cerradas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(closedSummary.byServiceType ?? []).map((r) => (
                            <TableRow key={r.serviceType}>
                              <TableCell>{serviceTypeLabel(r.serviceType)}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{r.closedCount}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(closedSummary.byServiceType ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell className="text-neutral-500" colSpan={2}>Sin datos</TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Totales de técnico por clase</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Técnico</TableHead>
                            <TableHead>Clase</TableHead>
                            <TableHead className="text-right">Cerradas</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(closedSummary.byTechnicianAndServiceType ?? []).map((r) => (
                            <TableRow key={`${r.userId}:${r.serviceType}`}>
                              <TableCell>{r.name}</TableCell>
                              <TableCell>{serviceTypeLabel(r.serviceType)}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{r.closedCount}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                          {(closedSummary.byTechnicianAndServiceType ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell className="text-neutral-500" colSpan={3}>Sin datos</TableCell>
                            </TableRow>
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                Promedio diario y semanal por técnico
                <HelpTip text="Calculado sobre OS cerradas en el rango. Las barras separan PREVENTIVO, CORRECTIVO y DIAGNOSTICO, divididos por la duración real del rango seleccionado." />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!technicianTypeAverageChart.length ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Promedio diario por técnico</div>
                    <div style={{ height: technicianTypeAverageChartHeight }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={technicianTypeAverageChart}
                          layout="vertical"
                          margin={{ top: 6, right: 16, left: 16, bottom: 6 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={150} interval={0} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value: any, name: any) => [fmtFixed(value, 2), name]} />
                          <Legend />
                          <Bar dataKey="dailyPreventive" stackId="daily" name="Preventivos" fill="#16a34a" radius={[0, 0, 0, 0]}>
                            <LabelList dataKey="dailyPreventive" content={<CenterDecimalBarLabel />} />
                          </Bar>
                          <Bar dataKey="dailyCorrective" stackId="daily" name="Correctivos" fill="#ea580c" radius={[0, 0, 0, 0]}>
                            <LabelList dataKey="dailyCorrective" content={<CenterDecimalBarLabel />} />
                          </Bar>
                          <Bar dataKey="dailyDiagnostic" stackId="daily" name="Diagnósticos" fill="#2563eb" radius={[0, 4, 4, 0]}>
                            <LabelList dataKey="dailyDiagnostic" content={<CenterDecimalBarLabel />} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <div className="text-sm font-medium mb-2">Promedio semanal por técnico</div>
                    <div style={{ height: technicianTypeAverageChartHeight }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={technicianTypeAverageChart}
                          layout="vertical"
                          margin={{ top: 6, right: 16, left: 16, bottom: 6 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis type="category" dataKey="name" width={150} interval={0} tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value: any, name: any) => [fmtFixed(value, 2), name]} />
                          <Legend />
                          <Bar dataKey="weeklyPreventive" stackId="weekly" name="Preventivos" fill="#16a34a" radius={[0, 0, 0, 0]}>
                            <LabelList dataKey="weeklyPreventive" content={<CenterDecimalBarLabel />} />
                          </Bar>
                          <Bar dataKey="weeklyCorrective" stackId="weekly" name="Correctivos" fill="#ea580c" radius={[0, 0, 0, 0]}>
                            <LabelList dataKey="weeklyCorrective" content={<CenterDecimalBarLabel />} />
                          </Bar>
                          <Bar dataKey="weeklyDiagnostic" stackId="weekly" name="Diagnósticos" fill="#2563eb" radius={[0, 4, 4, 0]}>
                            <LabelList dataKey="weeklyDiagnostic" content={<CenterDecimalBarLabel />} />
                          </Bar>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Backlog por estado</CardTitle>
              </CardHeader>
              <CardContent>
                {!data ? (
                  <div className="text-sm text-neutral-500">Cargando…</div>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(data.service.backlogByStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between text-sm">
                        <div className="font-medium">{status}</div>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                    {!Object.keys(data.service.backlogByStatus).length ? (
                      <div className="text-sm text-neutral-500">Sin backlog</div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Carga por técnico (OS activas)</CardTitle>
              </CardHeader>
              <CardContent>
                {!data?.service.technicianWorkload?.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Técnico</TableHead>
                        <TableHead className="text-right">Asignadas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.service.technicianWorkload.map(r => (
                        <TableRow key={r.userId}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.openAssigned}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">Tiempos operativos<HelpTip text="Avg/Mediana/P90 por tramo usando timestamps de la OS. Sirve para medir demoras por etapa del servicio." /></CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.service.operationalTimes?.length ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tramo</TableHead>
                      <TableHead className="text-right">Muestras</TableHead>
                      <TableHead className="text-right">Avg (h)</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Mediana (h)</TableHead>
                      <TableHead className="text-right hidden md:table-cell">P90 (h)</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Cobertura</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.service.operationalTimes.map(r => {
                      const denom = data?.service.closedInRange ?? 0;
                      const coverage = denom ? Math.round((r.count / denom) * 100) : null;
                      return (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium"><span className="inline-flex items-center">{r.label}{r.span ? <HelpTip text={r.span} /> : null}</span></TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.count}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmtHours(r.avgHours)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">{fmtHours(r.p50Hours)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">{fmtHours(r.p90Hours)}</TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            {coverage == null ? '—' : `${coverage}%`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <div className="text-xs text-neutral-500 mt-2">
                Nota: para los tramos que terminan en <span className="font-mono">deliveredAt</span>, si este campo no existe se usa
                <span className="font-mono"> completedAt</span> (o <span className="font-mono">updatedAt</span>) para no perder cierres.
                Además, en OS con <span className="font-mono">formData.visitMode = FOLLOW_UP</span> se excluyen los tramos previos a inicio de actividad.
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base flex items-center">
                Comparativos por tramo
                <HelpTip text="Comparación de tiempos (Avg/Mediana/P90) por técnico, tipo de OS, cliente y sede. Útil para identificar variabilidad y causas de demoras." />
              </CardTitle>

              <div className="grid grid-cols-2 md:flex gap-2">
                <Select value={opDim} onValueChange={(v: any) => setOpDim(v)}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Dimensión" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TECHNICIAN">Técnico</SelectItem>
                    <SelectItem value="TYPE">Tipo de OS</SelectItem>
                    <SelectItem value="CUSTOMER">Cliente</SelectItem>
                    <SelectItem value="LOCATION">Sede</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={opMetric} onValueChange={(v: any) => setOpMetric(v)}>
                  <SelectTrigger className="w-full md:w-[160px]">
                    <SelectValue placeholder="Métrica" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avg">Promedio</SelectItem>
                    <SelectItem value="p50">Mediana</SelectItem>
                    <SelectItem value="p90">P90</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={opSegment} onValueChange={(v: any) => setOpSegment(v)}>
                  <SelectTrigger className="w-full md:w-[220px]">
                    <SelectValue placeholder="Tramo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(opComp?.segments ?? []).map(s => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {!opComp ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : opDim === 'TECHNICIAN' ? (
                <div className="space-y-4">
                  <div className="text-xs text-neutral-500">
                    Heatmap: filas = técnicos (lead), columnas = tramos. Valores en horas ({opMetric === 'avg' ? 'promedio' : opMetric === 'p50' ? 'mediana' : 'P90'}).
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Técnico</TableHead>
                        {opComp.segments.map(s => (
                          <TableHead key={s.key} className="text-right">
                            <span className="inline-flex items-center">
                              {s.label}
                              <HelpTip text={s.span} />
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {opComp.byTechnician.map(g => (
                        <TableRow key={g.groupKey}>
                          <TableCell className="font-medium">{g.groupLabel}</TableCell>
                          {opComp.segments.map(s => {
                            const m = g.segments?.[s.key];
                            const val =
                              opMetric === 'avg' ? m?.avgHours : opMetric === 'p50' ? m?.p50Hours : m?.p90Hours;
                            return (
                              <TableCell key={s.key} className="text-right">
                                <div>{fmtHours(val)}</div>
                                <div className="text-[10px] text-neutral-500">{m?.count ?? 0} mues.</div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div>
                    <div className="text-sm font-medium mb-2 inline-flex items-center">
                      Ranking por {opMetric.toUpperCase()} — {opComp.segments.find(s => s.key === opSegment)?.label ?? ''}
                      <HelpTip text="Ordena por el valor del tramo seleccionado (en horas). Útil para detectar a quién apoyar o qué casos auditar." />
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Técnico</TableHead>
                          <TableHead className="text-right">Muestras</TableHead>
                          <TableHead className="text-right">Avg</TableHead>
                          <TableHead className="text-right hidden md:table-cell">P50</TableHead>
                          <TableHead className="text-right">P90</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const rows = [...opComp.byTechnician]
                            .map(g => ({ g, m: g.segments?.[opSegment] }))
                            .filter(x => (x.m?.count ?? 0) > 0)
                            .sort((a, b) => (b.m?.p90Hours ?? 0) - (a.m?.p90Hours ?? 0))
                            .slice(0, 20);

                          return rows.map(({ g, m }) => (
                            <TableRow key={g.groupKey}>
                              <TableCell className="font-medium">{g.groupLabel}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant="secondary">{m?.count ?? 0}</Badge>
                              </TableCell>
                              <TableCell className="text-right">{fmtHours(m?.avgHours)}</TableCell>
                              <TableCell className="text-right hidden md:table-cell">{fmtHours(m?.p50Hours)}</TableCell>
                              <TableCell className="text-right">{fmtHours(m?.p90Hours)}</TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-neutral-500">
                    Ranking (Top 30) por tramo seleccionado. Se ordena por P90 del tramo para atacar demoras.
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{opDim === 'TYPE' ? 'Tipo de OS' : opDim === 'CUSTOMER' ? 'Cliente' : 'Sede'}</TableHead>
                        <TableHead className="text-right">Muestras</TableHead>
                        <TableHead className="text-right">Avg</TableHead>
                        <TableHead className="text-right hidden md:table-cell">P50</TableHead>
                        <TableHead className="text-right">P90</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const groups =
                          opDim === 'TYPE'
                            ? opComp.byServiceOrderType
                            : opDim === 'CUSTOMER'
                              ? opComp.byCustomer
                              : opComp.byLocation;

                        const rows = [...groups]
                          .map(g => ({ g, m: g.segments?.[opSegment] }))
                          .filter(x => (x.m?.count ?? 0) > 0)
                          .sort((a, b) => (b.m?.p90Hours ?? 0) - (a.m?.p90Hours ?? 0))
                          .slice(0, 30);

                        return rows.map(({ g, m }) => (
                          <TableRow key={g.groupKey}>
                            <TableCell className="font-medium">{g.groupLabel}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="secondary">{m?.count ?? 0}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{fmtHours(m?.avgHours)}</TableCell>
                            <TableCell className="text-right hidden md:table-cell">{fmtHours(m?.p50Hours)}</TableCell>
                            <TableCell className="text-right">{fmtHours(m?.p90Hours)}</TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="text-xs text-neutral-500 mt-3">
                Nota: para los tramos que terminan en <span className="font-mono">deliveredAt</span>, si este campo no existe se usa
                <span className="font-mono"> completedAt</span> o <span className="font-mono">updatedAt</span> para no perder cierres.
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desempeño por técnico (rango)</CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.service.technicianPerformance?.length ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Técnico</TableHead>
                      <TableHead className="text-right">OS cerradas</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead className="text-right md:hidden">Utilización</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Hrs/OS</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Utilización</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Ciclo (h)</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Respuesta (h)</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">% a tiempo</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Backlog</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Vencidas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.service.technicianPerformance.map(r => (
                      <TableRow key={r.userId}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Link href={`/service-orders?technicianId=${r.userId}`}>{r.name}</Link>
                            {r.userId === techScoreboard.topThroughputId ? <Badge variant="secondary">Top OS</Badge> : null}
                            {r.userId === techScoreboard.topUtilId ? <Badge variant="secondary">Top Util</Badge> : null}
                            {r.userId === techScoreboard.bottomThroughputId ? <Badge variant="outline">Bajo OS</Badge> : null}
                            {r.userId === techScoreboard.bottomUtilId ? <Badge variant="outline">Baja Util</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{r.closedInRange}</TableCell>
                        <TableCell className="text-right">{fmtFixed(r.effectiveHours, 1)}</TableCell>
                        <TableCell className="text-right md:hidden">
                          {r.utilizationPct == null ? '—' : `${r.utilizationPct}%`}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {fmtFixed(r.hrsPerOs, 2)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.utilizationPct == null ? '—' : `${r.utilizationPct}%`}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {fmtFixed(r.avgCycleHours, 1)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {fmtFixed(r.avgResponseHours, 1)}
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          {r.onTimeRate == null ? '—' : `${r.onTimeRate}%`}
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          <Badge variant="secondary">{r.openAssigned}</Badge>
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell">
                          {r.overdueOpenAssigned ? (
                            <Badge variant="destructive">{r.overdueOpenAssigned}</Badge>
                          ) : (
                            <Badge variant="secondary">0</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base">Productividad semanal por técnico</CardTitle>
              <div className="w-full md:w-[280px]">
                <Select value={selectedTechId} onValueChange={(v: any) => setSelectedTechId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    {techOptions.map(t => (
                      <SelectItem key={t.userId} value={t.userId}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedTechId ? (
                <div className="text-sm text-neutral-500">Sin técnicos para mostrar.</div>
              ) : !weeklyChartData.length ? (
                <div className="text-sm text-neutral-500">Sin datos en el rango seleccionado.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <StatCard title="OS cerradas (semanal)" value={weeklyTechTotals.closed} />
                    <StatCard title="Horas (semanal)" value={weeklyTechTotals.hours.toFixed(1)} />
                    <StatCard title="Utilización" value={weeklyTechTotals.utilizationPct == null ? '—' : `${weeklyTechTotals.utilizationPct}%`} hint="Horas / horas hábiles (8h/día)" />
                    <StatCard
                      title="Hrs/OS"
                      value={weeklyTechTotals.hrsPerClosed == null ? '—' : weeklyTechTotals.hrsPerClosed.toFixed(2)}
                      hint="Horas trabajadas / OS cerradas"
                    />
                  </div>

                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={weeklyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week" tickLine={false} axisLine={false} />
                        <YAxis yAxisId="left" tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} />
                        <YAxis yAxisId="pct" orientation="right" tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                        <Tooltip />
                        <Bar yAxisId="left" dataKey="closed" name="OS cerradas" fill="#64748b" radius={[6, 6, 0, 0]}>
                          <LabelList dataKey="closed" content={<TopIntegerBarLabel />} />
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="hours" name="Horas" stroke="#0f172a" strokeWidth={2} />
                        <Line yAxisId="pct" type="monotone" dataKey="utilization" name="Utilización" stroke="#16a34a" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">Detalle por semana</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Semana</TableHead>
                          <TableHead className="text-right">OS cerradas</TableHead>
                          <TableHead className="text-right">Horas</TableHead>
                          <TableHead className="text-right">Utilización</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weeklyChartData.map(r => (
                          <TableRow key={r.week}>
                            <TableCell>{r.week}</TableCell>
                            <TableCell className="text-right">{r.closed}</TableCell>
                            <TableCell className="text-right">{Number(r.hours).toFixed(1)}</TableCell>
                            <TableCell className="text-right">{r.utilization == null ? '—' : `${Number(r.utilization).toFixed(1)}%`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

        </TabsContent>
      </Tabs>

    </div>
  );
}
