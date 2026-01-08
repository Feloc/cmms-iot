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
    technicianPerformance: Array<{ userId: string; name: string; closedInRange: number; workedOrdersInRange: number; totalWorkHours: number; avgWorkHoursPerSO: number | null; avgCycleHours: number | null; avgResponseHours: number | null; onTimeRate: number | null; openAssigned: number; overdueOpenAssigned: number; }>;
    technicianWeeklyProductivity: Array<{ weekStart: string; userId: string; name: string; closedCount: number; workHours: number }>;
  };
};

function StatCard(props: { title: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <Card className={props.href ? 'hover:shadow-sm transition-shadow' : ''}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-neutral-600">{props.title}</CardTitle>
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

  const { data, error, isLoading } = useSWR<Summary>(
    token && tenantSlug ? [`/dashboard/summary?days=${days}`, token, tenantSlug] : null,
    ([url, t, slug]) => apiFetch(url, { token: t, tenantSlug: slug }),
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
      };
    });
  }, [data?.service.technicianWeeklyProductivity, selectedTechId]);

  const weeklyTechTotals = useMemo(() => {
    const rows = (data?.service.technicianWeeklyProductivity ?? []).filter(r => r.userId === selectedTechId);
    const closed = rows.reduce((a, b) => a + (b.closedCount ?? 0), 0);
    const hours = rows.reduce((a, b) => a + (b.workHours ?? 0), 0);
    const hrsPerClosed = closed ? Math.round((hours / closed) * 100) / 100 : null;
    return { closed, hours, hrsPerClosed };
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
                      <TableHead className="text-right hidden md:table-cell">Hrs/OS</TableHead>
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
                          <Link href={`/service-orders?technicianId=${r.userId}`}>{r.name}</Link>
                        </TableCell>
                        <TableCell className="text-right">{r.closedInRange}</TableCell>
                        <TableCell className="text-right">{r.totalWorkHours.toFixed(1)}</TableCell>
                        <TableCell className="text-right hidden md:table-cell">
                          {r.avgWorkHoursPerSO == null ? '—' : r.avgWorkHoursPerSO.toFixed(2)}
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard title="OS cerradas (semanal)" value={weeklyTechTotals.closed} />
                    <StatCard title="Horas (semanal)" value={weeklyTechTotals.hours.toFixed(1)} />
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
                        <Tooltip />
                        <Bar yAxisId="left" dataKey="closed" name="OS cerradas" fill="#64748b" radius={[6, 6, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="hours" name="Horas" stroke="#0f172a" strokeWidth={2} />
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
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {weeklyChartData.map(r => (
                          <TableRow key={r.week}>
                            <TableCell>{r.week}</TableCell>
                            <TableCell className="text-right">{r.closed}</TableCell>
                            <TableCell className="text-right">{Number(r.hours).toFixed(1)}</TableCell>
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
