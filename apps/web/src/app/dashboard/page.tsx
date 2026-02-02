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
    recent: Array<{
      id: string;
      kind: string;
      assetCode: string;
      sensor: string;
      message: string;
      status: string;
      createdAt: string;
    }>;
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
      workedOrdersInRange: number;
      totalWorkHours: number;
      avgWorkHoursPerSO: number | null;
      availableHours: number;
      utilizationPct: number | null;
      avgCycleHours: number | null;
      avgResponseHours: number | null;
      onTimeRate: number | null;
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

    // Paso 2: efectivo vs pausas
    technicianEffectiveVsPauses: Array<{
      userId: string;
      name: string;
      osWorkedInRange: number;
      workLogsCount: number;
      pauseCount: number;
      effectiveHours: number;
      spanHours: number;
      pauseHours: number;
      effectivePct: number | null;
      avgEffectiveHoursPerOS: number | null;
      avgPauseHoursPerOS: number | null;
    }>;

    workTimeByServiceOrderType: Array<{
      serviceOrderType: string;
      osWorkedInRange: number;
      workLogsCount: number;
      pauseCount: number;
      effectiveHours: number;
      spanHours: number;
      pauseHours: number;
      effectivePct: number | null;
      avgEffectiveHoursPerOS: number | null;
      avgPauseHoursPerOS: number | null;
    }>;

    operationalTimes: Array<{
      key: string;
      label: string;
      count: number;
      avgHours: number | null;
      p50Hours: number | null;
      p90Hours: number | null;
    }>;
  };
};

function fmtHours(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center justify-center ml-1 w-4 h-4 rounded-full border text-[10px] leading-none text-neutral-500 cursor-help"
      title={text}
      aria-label={text}
    >
      ?
    </span>
  );
}

function StatCard(props: { title: string; value: ReactNode; hint?: string; help?: string; href?: string }) {
  const inner = (
    <Card className={props.href ? 'hover:shadow-sm transition-shadow' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-600 flex items-center">
          {props.title}
          {props.help ? <InfoTip text={props.help} /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{props.value}</div>
        {props.hint ? <div className="text-xs text-neutral-500 mt-1">{props.hint}</div> : null}
      </CardContent>
    </Card>
  );

  return props.href ? <Link href={props.href}>{inner}</Link> : inner;
}

function MetricLabel({ label, help }: { label: string; help?: string }) {
  return (
    <div className="inline-flex items-center">
      <span>{label}</span>
      {help ? <InfoTip text={help} /> : null}
    </div>
  );
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

  const { data, error, isLoading } = useSWR<Summary, any, DashboardKey>(dashboardKey, fetchSummary, {
    refreshInterval: 15000,
  });

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
    if (!selectedTechId && techOptions.length) setSelectedTechId(techOptions[0].userId);
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
        utilization:
          r.utilizationPct ??
          (r.availableHours ? Math.round(((r.workHours ?? 0) / r.availableHours) * 1000) / 10 : null),
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

  const effVsPauseRows = useMemo(() => {
    return (data?.service.technicianEffectiveVsPauses ?? []).slice().sort((a, b) => {
      // prioridad: más horas efectivas
      return (b.effectiveHours ?? 0) - (a.effectiveHours ?? 0);
    });
  }, [data?.service.technicianEffectiveVsPauses]);

  const typeEffVsPauseRows = useMemo(() => {
    return (data?.service.workTimeByServiceOrderType ?? []).slice().sort((a, b) => {
      return (b.effectiveHours ?? 0) - (a.effectiveHours ?? 0);
    });
  }, [data?.service.workTimeByServiceOrderType]);

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
            <StatCard
              title="Activos totales"
              value={isLoading ? '—' : data?.assets.total ?? 0}
              help="Cantidad total de activos registrados en el tenant."
              href="/assets"
            />
            <StatCard
              title="Activos críticos (HIGH)"
              value={isLoading ? '—' : data?.assets.criticalHigh ?? 0}
              help="Activos con criticidad HIGH. Útil para priorizar inspecciones, preventivos y repuestos críticos."
              hint="Prioriza mantenimiento/inspecciones"
              href="/assets"
            />
            <StatCard
              title="Alertas abiertas"
              value={isLoading ? '—' : data?.alerts.open ?? 0}
              help="Alertas IoT/umbral que aún no están cerradas. Útil para priorizar atención preventiva."
              hint="IoT / reglas / umbrales"
              href="/alerts"
            />
            <StatCard
              title="Activos con OS abiertas"
              value={isLoading ? '—' : data?.assets.withOpenServiceOrders ?? 0}
              help="Activos que tienen al menos una orden de servicio activa (no cerrada)."
              hint="Activos con backlog"
              href="/service-orders"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Top activos con OS abiertas"
                    help="Ranking de activos con más OS activas. Te ayuda a detectar activos problemáticos o con backlog acumulado."
                  />
                </CardTitle>
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
                        <TableHead>
                          <MetricLabel label="Activo" help="Código del activo." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="OS abiertas" help="Cantidad de OS activas asociadas al activo." />
                        </TableHead>
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
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Top activos con alertas abiertas"
                    help="Ranking de activos con más alertas abiertas (IoT). Te ayuda a priorizar inspecciones."
                  />
                </CardTitle>
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
                        <TableHead>
                          <MetricLabel label="Activo" help="Código del activo." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Alertas" help="Cantidad de alertas abiertas asociadas al activo." />
                        </TableHead>
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
            <StatCard
              title="Backlog total"
              value={isLoading ? '—' : data?.service.backlogTotal ?? 0}
              help="OS activas (no cerradas). Es la carga de trabajo actual del área."
              href="/service-orders"
            />
            <StatCard
              title="Vencidas"
              value={isLoading ? '—' : data?.service.overdue ?? 0}
              help="OS activas con dueDate anterior a hoy. Indica riesgo de incumplimiento."
              hint="dueDate < hoy"
              href="/service-orders"
            />
            <StatCard
              title="Sin asignar"
              value={isLoading ? '—' : data?.service.unassigned ?? 0}
              help="OS activas que no tienen un técnico ACTIVE asignado. Indica colas sin dueño."
              hint="Sin técnico activo"
              href="/service-orders"
            />
            <StatCard
              title="Cerradas en rango"
              value={isLoading ? '—' : data?.service.closedInRange ?? 0}
              help="Cantidad de OS que quedaron en estado COMPLETED/CLOSED dentro del rango."
            />
            <StatCard
              title="MTTR (horas)"
              value={isLoading ? '—' : data?.service.mttrHours ?? '—'}
              help="Promedio de tiempo de resolución para OS cerradas en el rango (aprox por timestamps de cierre)."
              hint="Promedio cierre (rango)"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Backlog por estado"
                    help="Distribución del backlog por status. Útil para ver si se acumula en ON_HOLD, IN_PROGRESS, etc."
                  />
                </CardTitle>
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
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Carga por técnico"
                    help="Cantidad de OS activas asignadas por técnico (WOAssignment role=TECHNICIAN, state=ACTIVE)."
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!data?.service.technicianWorkload?.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <MetricLabel label="Técnico" help="Nombre del técnico." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Asignadas" help="Número de OS activas asignadas." />
                        </TableHead>
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
              <CardTitle className="text-base">
                <MetricLabel
                  label="Tiempos operativos"
                  help="Duraciones calculadas usando timestamps de la OS (takenAt, arrivedAt, checkInAt, activityStartedAt, activityFinishedAt, deliveredAt)."
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.service.operationalTimes?.length ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <MetricLabel label="Tramo" help="Segmento del proceso (por timestamps de la OS)." />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricLabel label="Muestras" help="Cantidad de OS en el rango que tienen ambos timestamps para este tramo." />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricLabel label="Avg (h)" help="Promedio (en horas) del tramo." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="Mediana (h)" help="Percentil 50 (mediana). Menos sensible a outliers." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="P90 (h)" help="Percentil 90. Te muestra la cola larga / casos lentos." />
                      </TableHead>
                      <TableHead className="text-right hidden lg:table-cell">
                        <MetricLabel label="Cobertura" help="Muestras / OS cerradas en rango." />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.service.operationalTimes.map(r => {
                      const denom = data?.service.closedInRange ?? 0;
                      const coverage = denom ? Math.round((r.count / denom) * 100) : null;
                      return (
                        <TableRow key={r.key}>
                          <TableCell className="font-medium">{r.label}</TableCell>
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
                Nota: para tramos que usan <span className="font-mono">deliveredAt</span>, si este campo no existe se usa
                <span className="font-mono"> completedAt</span> (o <span className="font-mono">updatedAt</span>) para no perder cierres.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <MetricLabel
                  label="Productividad y utilización por técnico"
                  help="Scoreboard por técnico: throughput (OS cerradas), horas efectivas (WorkLogs) y utilización aproximada vs horas hábiles del rango."
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!data?.service.technicianPerformance?.length ? (
                <div className="text-sm text-neutral-500">Sin datos</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <MetricLabel label="Técnico" help="Nombre del técnico." />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricLabel label="OS cerradas" help="OS COMPLETED/CLOSED en el rango (por asignación TECHNICIAN)." />
                      </TableHead>
                      <TableHead className="text-right">
                        <MetricLabel label="Horas efectivas" help="Suma de WorkLogs del técnico en el rango (en horas)." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="Hrs/OS" help="Horas efectivas / OS cerradas. Aproxima esfuerzo por OS." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="Utilización" help="Horas efectivas / horas hábiles del rango (8h por día hábil). Aproximación." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="Ciclo (h)" help="Promedio: cierre - creación (OS cerradas en rango)." />
                      </TableHead>
                      <TableHead className="text-right hidden md:table-cell">
                        <MetricLabel label="Respuesta (h)" help="Promedio: startedAt - createdAt (si startedAt existe)." />
                      </TableHead>
                      <TableHead className="text-right hidden lg:table-cell">
                        <MetricLabel label="% a tiempo" help="OS con dueDate cumplido / OS con dueDate (en el rango)." />
                      </TableHead>
                      <TableHead className="text-right hidden lg:table-cell">
                        <MetricLabel label="WIP" help="OS activas asignadas actualmente." />
                      </TableHead>
                      <TableHead className="text-right hidden lg:table-cell">
                        <MetricLabel label="Vencidas" help="OS activas asignadas con dueDate < hoy." />
                      </TableHead>
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
                          {r.overdueOpenAssigned ? <Badge variant="destructive">{r.overdueOpenAssigned}</Badge> : <Badge variant="secondary">0</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Paso 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Efectivo vs pausas por técnico"
                    help="Para cada técnico, se calcula el 'span' (desde el primer inicio hasta el último fin por OS) y se compara contra la suma de WorkLogs (tiempo efectivo). Las pausas son los huecos entre WorkLogs. La cantidad de pausas es la suma de (workLogs - 1) por OS."
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!effVsPauseRows.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <MetricLabel label="Técnico" help="Nombre del técnico." />
                        </TableHead>
                        <TableHead className="text-right hidden md:table-cell">
                          <MetricLabel label="OS" help="Cantidad de OS en las que registró WorkLogs dentro del rango." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Efectivo (h)" help="Horas efectivas: suma de duración de WorkLogs (clipeado al rango)." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Pausas (h)" help="Horas en pausas: span - efectivo." />
                        </TableHead>
                        <TableHead className="text-right hidden md:table-cell">
                          <MetricLabel label="# pausas" help="Conteo aproximado de pausas: por OS (workLogs - 1)." />
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          <MetricLabel label="% efectivo" help="Efectivo / span. Entre más alto, menos tiempo muerto entre WorkLogs." />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {effVsPauseRows.map(r => {
                        const pct = r.effectivePct ?? (r.spanHours ? Math.round((r.effectiveHours / r.spanHours) * 100) : null);
                        return (
                          <TableRow key={r.userId}>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell className="text-right hidden md:table-cell">
                              <Badge variant="secondary">{r.osWorkedInRange}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{fmtHours(r.effectiveHours, 1)}</TableCell>
                            <TableCell className="text-right">{fmtHours(r.pauseHours, 1)}</TableCell>
                            <TableCell className="text-right hidden md:table-cell">
                              <Badge variant="secondary">{r.pauseCount}</Badge>
                            </TableCell>
                            <TableCell className="text-right hidden lg:table-cell">{pct == null ? '—' : `${pct}%`}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}

                <div className="text-xs text-neutral-500 mt-2">
                  Recomendación: si ves muchas pausas, cruza esto con estados ON_HOLD, falta de repuestos o esperas por autorización. Más adelante podemos separar pausas “justificadas” vs “no justificadas”.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  <MetricLabel
                    label="Efectivo vs pausas por tipo de OS"
                    help="Mismo cálculo, pero agrupado por serviceOrderType. Útil para ver qué tipo de OS consume más tiempo efectivo y dónde hay más pausas."
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!typeEffVsPauseRows.length ? (
                  <div className="text-sm text-neutral-500">Sin datos</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <MetricLabel label="Tipo" help="serviceOrderType de la OS (o UNSPECIFIED si no está definido)." />
                        </TableHead>
                        <TableHead className="text-right hidden md:table-cell">
                          <MetricLabel label="OS" help="Cantidad de OS (con WorkLogs) en el rango." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Efectivo (h)" help="Horas efectivas: suma de WorkLogs dentro del rango." />
                        </TableHead>
                        <TableHead className="text-right">
                          <MetricLabel label="Pausas (h)" help="Horas en pausas: span - efectivo." />
                        </TableHead>
                        <TableHead className="text-right hidden md:table-cell">
                          <MetricLabel label="# pausas" help="Conteo aproximado de pausas por OS (workLogs - 1)." />
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          <MetricLabel label="Prom. ef/OS" help="Horas efectivas promedio por OS del tipo." />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeEffVsPauseRows.map(r => (
                        <TableRow key={r.serviceOrderType}>
                          <TableCell className="font-medium">{r.serviceOrderType}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">
                            <Badge variant="secondary">{r.osWorkedInRange}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{fmtHours(r.effectiveHours, 1)}</TableCell>
                          <TableCell className="text-right">{fmtHours(r.pauseHours, 1)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell">
                            <Badge variant="secondary">{r.pauseCount}</Badge>
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            {r.avgEffectiveHoursPerOS == null ? '—' : r.avgEffectiveHoursPerOS.toFixed(2)}
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
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-base">
                <MetricLabel
                  label="Productividad semanal por técnico"
                  help="Evolución semanal del técnico seleccionado: OS cerradas (barra), horas efectivas (línea) y utilización (línea %)."
                />
              </CardTitle>
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
                    <StatCard
                      title="OS cerradas (semanal)"
                      value={weeklyTechTotals.closed}
                      help="Total de OS cerradas por el técnico en el rango (sumando semanas)."
                    />
                    <StatCard
                      title="Horas (semanal)"
                      value={weeklyTechTotals.hours.toFixed(1)}
                      help="Horas efectivas (WorkLogs) del técnico en el rango, sumadas por semana."
                    />
                    <StatCard
                      title="Utilización"
                      value={weeklyTechTotals.utilizationPct == null ? '—' : `${weeklyTechTotals.utilizationPct}%`}
                      help="Horas / horas hábiles (8h por día hábil). Aproximación."
                      hint="Horas / horas hábiles (8h/día)"
                    />
                    <StatCard
                      title="Hrs/OS"
                      value={weeklyTechTotals.hrsPerClosed == null ? '—' : weeklyTechTotals.hrsPerClosed.toFixed(2)}
                      help="Horas trabajadas / OS cerradas."
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
                        <YAxis
                          yAxisId="pct"
                          orientation="right"
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip />
                        <Bar yAxisId="left" dataKey="closed" name="OS cerradas" radius={[6, 6, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="hours" name="Horas" strokeWidth={2} />
                        <Line yAxisId="pct" type="monotone" dataKey="utilization" name="Utilización" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div>
                    <div className="text-sm font-medium mb-2">
                      <MetricLabel label="Detalle por semana" help="Tabla semanal del técnico seleccionado." />
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <MetricLabel label="Semana" help="Inicio de la semana (formato dd MMM)." />
                          </TableHead>
                          <TableHead className="text-right">
                            <MetricLabel label="OS cerradas" help="OS cerradas esa semana." />
                          </TableHead>
                          <TableHead className="text-right">
                            <MetricLabel label="Horas" help="Horas efectivas esa semana." />
                          </TableHead>
                          <TableHead className="text-right">
                            <MetricLabel label="Utilización" help="Horas / horas hábiles (8h por día hábil) esa semana." />
                          </TableHead>
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
          <CardTitle className="text-base">
            <MetricLabel label="Alertas recientes" help="Últimas alertas creadas (ordenadas por fecha). Útil para monitoreo." />
          </CardTitle>
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
