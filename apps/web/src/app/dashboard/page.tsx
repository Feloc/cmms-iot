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
  Bar,
  Line,
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

type Summary = {
  range: { from: string; to: string; days: number };

  assets: {
    total: number;
    byStatus: Record<string, number>;
    byCriticality: Record<string, number>;
    criticalHigh: number;
    withOpenServiceOrders: number;
    topAssetsByOpenSO: Array<{ assetCode: string; openSO: number }>;
    topAssetsByOpenAlerts: Array<{ assetCode: string; openAlerts: number }>;
  };

  alerts: {
    open: number;
    recent: Array<{ id: string; kind: string; assetCode: string; severity: string; status: string; createdAt: string }>;
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

  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [opDim, setOpDim] = useState<'TECHNICIAN' | 'TYPE' | 'CUSTOMER' | 'LOCATION'>('TECHNICIAN');
  const [opMetric, setOpMetric] = useState<'avg' | 'p50' | 'p90'>('p90');
  const [opSegment, setOpSegment] = useState<'travel' | 'intake' | 'handover' | 'onsite' | 'wrapup' | 'total'>('total');

  type DashboardKey = readonly [string, string, string];

  const dashboardKey: DashboardKey | null =
    token && tenantSlug
      ? ([`/dashboard/summary?days=${days}`, String(token), String(tenantSlug)] as const)
      : null;

  // SWR puede pasar el key como:
// - un solo argumento (el array completo), o
// - argumentos "spread" (url, token, slug)
// Este fetcher soporta ambas formas, evitando errores tipo `path.startsWith is not a function`.
const fetchSummary = (arg1: unknown, arg2?: unknown, arg3?: unknown) => {
  const [url, t, slug] = Array.isArray(arg1)
    ? (arg1 as DashboardKey)
    : ([arg1, arg2, arg3] as unknown as DashboardKey);

  return apiFetch<Summary>(String(url), { token: String(t), tenantSlug: String(slug) });
};

  const { data, error, isLoading } = useSWR<Summary, any, DashboardKey>(
    dashboardKey,
    fetchSummary,
    { refreshInterval: 15000 }
  );

  const rangeLabel = useMemo(() => {
    if (!data?.range) return '';
    const from = new Date(data.range.from).toLocaleDateString();
    const to = new Date(data.range.to).toLocaleDateString();
    return `${from} → ${to}`;
  }, [data?.range]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <div className="text-sm text-neutral-500">Enfoque: Activos + Servicio técnico</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-500">{rangeLabel}</div>
          <Select value={days} onValueChange={(v: any) => setDays(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Rango" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 días</SelectItem>
              <SelectItem value="30">Últimos 30 días</SelectItem>
              <SelectItem value="90">Últimos 90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Activos totales" value={isLoading ? '—' : data?.assets.total ?? 0} href="/assets" />
            <StatCard
              title="Activos críticos (HIGH)"
              value={isLoading ? '—' : data?.assets.criticalHigh ?? 0}
              hint="Prioriza mantenimiento/inspecciones"
              href="/assets"
            />
            <StatCard
              title="Alertas abiertas"
              value={isLoading ? '—' : data?.alerts.open ?? 0}
              hint="IoT / reglas / umbrales"
              href="/alerts"
            />
            <StatCard
              title="Activos con OS abiertas"
              value={isLoading ? '—' : data?.assets.withOpenServiceOrders ?? 0}
              hint="Activos con backlog"
              href="/service-orders"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <CardTitle className="text-base">Top activos con alertas abiertas</CardTitle>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/alerts">Ver alertas</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!data?.assets.topAssetsByOpenAlerts?.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Activo</TableHead>
                        <TableHead className="text-right">Alertas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.assets.topAssetsByOpenAlerts.map(r => (
                        <TableRow key={r.assetCode}>
                          <TableCell className="font-mono">{r.assetCode}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.openAlerts}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
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
                    {(data?.service.operationalTimesComparisons?.segments ?? []).map(s => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {!data?.service.operationalTimesComparisons ? (
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
                        {data.service.operationalTimesComparisons.segments.map(s => (
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
                      {data.service.operationalTimesComparisons.byTechnician.map(g => (
                        <TableRow key={g.groupKey}>
                          <TableCell className="font-medium">{g.groupLabel}</TableCell>
                          {data.service.operationalTimesComparisons.segments.map(s => {
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
                      Ranking por {opMetric.toUpperCase()} — {data.service.operationalTimesComparisons.segments.find(s => s.key === opSegment)?.label ?? ''}
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
                          const rows = [...data.service.operationalTimesComparisons.byTechnician]
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
                            ? data.service.operationalTimesComparisons.byServiceOrderType
                            : opDim === 'CUSTOMER'
                              ? data.service.operationalTimesComparisons.byCustomer
                              : data.service.operationalTimesComparisons.byLocation;

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
                          <TableHead className="text-right">Utilización</TableHead>
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
                        <TableCell className="text-right">{r.totalWorkHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.avgWorkHoursPerSO == null ? '—' : r.avgWorkHoursPerSO.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.utilizationPct == null ? '—' : `${r.utilizationPct}%`}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.avgCycleHours == null ? '—' : r.avgCycleHours.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.avgResponseHours == null ? '—' : r.avgResponseHours.toFixed(1)}
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
                        <Bar yAxisId="left" dataKey="closed" name="OS cerradas" fill="#64748b" radius={[6, 6, 0, 0]} />
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Alertas recientes</CardTitle>
          <Button asChild variant="secondary" size="sm">
            <Link href="/alerts">Ver todo</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {!data?.alerts.recent?.length ? (
            <div className="text-sm text-neutral-500">Sin alertas</div>
          ) : (
            <ul className="space-y-2">
              {data.alerts.recent.map(a => (
                <li key={a.id} className="p-3 rounded border">
                  <div className="text-sm">
                    <span className="font-mono">[{a.kind}]</span>{' '}
                    <span className="font-semibold">{a.assetCode}/{a.sensor}</span> – {a.message}
                  </div>
                  <div className="text-xs text-neutral-500">{new Date(a.createdAt).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
