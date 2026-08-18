'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { type Assembly, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';
import { useMemo, useState } from 'react';
import { OperationalAlertQueue } from './OperationalAlertQueue';

type AlertFilter = 'ALL' | 'CRITICAL' | 'BLOCKED' | 'OVERDUE' | 'DUE_SOON' | 'BUDGET' | 'PENDING_SIGNATURE';

function isOverdue(item: Assembly) {
  return item.metrics.overdueActivities > 0;
}

function hasBudgetRisk(item: Assembly) {
  return item.metrics.laborRisk;
}

function signal(item: Assembly) {
  if (item.metrics.riskLevel === 'CRITICAL') return 'bg-red-100 text-red-800';
  if (item.metrics.riskLevel === 'WARNING') return 'bg-amber-100 text-amber-800';
  if (item.metrics.riskLevel === 'DONE') return 'bg-emerald-100 text-emerald-800';
  return 'bg-sky-100 text-sky-800';
}

const riskLabel = { CRITICAL: 'Atención inmediata', WARNING: 'En riesgo', ON_TRACK: 'En curso normal', DONE: 'Sin pendientes' };
const riskOrder = { CRITICAL: 0, WARNING: 1, ON_TRACK: 2, DONE: 3 };

export default function AssembliesPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role;
  const { data, error, isLoading, mutate } = useApiSWR<Assembly[]>('/assemblies', auth.token, auth.tenantSlug, { refreshInterval: 60_000 });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('ALL');
  const [search, setSearch] = useState('');

  const rows = data || [];
  const stats = useMemo(() => ({
    total: rows.length,
    critical: rows.filter((item) => item.metrics.riskLevel === 'CRITICAL').length,
    blocked: rows.filter((item) => item.metrics.blockedActivities > 0).length,
    overdue: rows.filter(isOverdue).length,
    dueSoon: rows.filter((item) => item.metrics.dueSoonActivities > 0).length,
    budgetRisk: rows.filter(hasBudgetRisk).length,
    pendingSignature: rows.filter((item) => item.status === 'COMPLETED' && !item.workOrder.receiverSignature).length,
  }), [rows]);

  const filtered = useMemo(() => rows.filter((item) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (alertFilter === 'CRITICAL' && item.metrics.riskLevel !== 'CRITICAL') return false;
    if (alertFilter === 'BLOCKED' && !item.metrics.blockedActivities) return false;
    if (alertFilter === 'OVERDUE' && !isOverdue(item)) return false;
    if (alertFilter === 'DUE_SOON' && !item.metrics.dueSoonActivities) return false;
    if (alertFilter === 'BUDGET' && !hasBudgetRisk(item)) return false;
    if (alertFilter === 'PENDING_SIGNATURE' && !(item.status === 'COMPLETED' && !item.workOrder.receiverSignature)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [item.workOrder.title, item.workOrder.assetCode, item.asset?.name, item.asset?.customer, item.asset?.serialNumber].some((value) => String(value || '').toLowerCase().includes(q));
  }).sort((a, b) => riskOrder[a.metrics.riskLevel] - riskOrder[b.metrics.riskLevel] || new Date(a.metrics.nextActivityDueAt || '9999-12-31').getTime() - new Date(b.metrics.nextActivityDueAt || '9999-12-31').getTime()), [rows, statusFilter, alertFilter, search]);

  const priorityRows = rows.filter((item) => ['CRITICAL', 'WARNING'].includes(item.metrics.riskLevel)).sort((a, b) => riskOrder[a.metrics.riskLevel] - riskOrder[b.metrics.riskLevel]).slice(0, 4);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Montajes</h1>
          <p className="text-sm text-gray-600">Seguimiento del avance físico y las horas presupuestadas.</p>
        </div>
        {role === 'ADMIN' ? (
          <div className="flex gap-2">
            <Link className="border rounded px-3 py-2 text-sm" href="/assemblies/templates">Plantillas</Link>
            <Link className="rounded px-3 py-2 text-sm bg-black text-white" href="/assemblies/new">Nuevo montaje</Link>
          </div>
        ) : null}
      </div>

      {error ? <div className="border border-red-200 bg-red-50 text-red-700 rounded p-3">No se pudieron cargar los montajes.</div> : null}
      {isLoading ? <div className="text-gray-500">Cargando…</div> : null}
      {!isLoading && !data?.length ? <div className="border rounded p-8 text-center text-gray-500">Todavía no hay montajes registrados.</div> : null}

      {rows.length ? <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Stat label="Total" value={stats.total} active={alertFilter === 'ALL'} onClick={() => setAlertFilter('ALL')} />
          <Stat label="Prioridad crítica" value={stats.critical} tone="red" active={alertFilter === 'CRITICAL'} onClick={() => setAlertFilter('CRITICAL')} />
          <Stat label="Bloqueados" value={stats.blocked} tone="red" active={alertFilter === 'BLOCKED'} onClick={() => setAlertFilter('BLOCKED')} />
          <Stat label="Atrasados" value={stats.overdue} tone="amber" active={alertFilter === 'OVERDUE'} onClick={() => setAlertFilter('OVERDUE')} />
          <Stat label="Próximos a vencer" value={stats.dueSoon} tone="amber" active={alertFilter === 'DUE_SOON'} onClick={() => setAlertFilter('DUE_SOON')} />
          <Stat label="Riesgo de horas" value={stats.budgetRisk} tone="amber" active={alertFilter === 'BUDGET'} onClick={() => setAlertFilter('BUDGET')} />
          <Stat label="Pendiente recibido" value={stats.pendingSignature} tone="sky" active={alertFilter === 'PENDING_SIGNATURE'} onClick={() => setAlertFilter('PENDING_SIGNATURE')} />
        </div>

        <div className="border rounded-lg p-3 grid md:grid-cols-3 gap-3">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Buscar equipo, cliente o serie…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="border rounded px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">Todos los estados</option><option value="PLANNED">Planificados</option><option value="IN_PROGRESS">En ejecución</option><option value="ON_HOLD">En pausa</option><option value="COMPLETED">Completados</option></select>
          <select className="border rounded px-3 py-2 text-sm" value={alertFilter} onChange={(e) => setAlertFilter(e.target.value as AlertFilter)}><option value="ALL">Todas las alertas</option><option value="CRITICAL">Prioridad crítica</option><option value="BLOCKED">Con bloqueos</option><option value="OVERDUE">Atrasados</option><option value="DUE_SOON">Próximos a vencer</option><option value="BUDGET">Riesgo de horas</option><option value="PENDING_SIGNATURE">Pendiente recibido</option></select>
        </div>

        {priorityRows.length ? <section className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-3"><div><h2 className="font-semibold">Prioridades de atención</h2><p className="text-xs text-gray-600">Actualización automática cada minuto.</p></div><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2">{priorityRows.map((item) => <Link key={item.id} href={`/assemblies/${item.id}`} className="border rounded bg-white p-3 hover:shadow-sm"><div className="flex justify-between gap-2"><span className="font-medium text-sm truncate">{item.workOrder.title}</span><span className={`w-3 h-3 mt-1 rounded-full shrink-0 ${item.metrics.riskLevel === 'CRITICAL' ? 'bg-red-500' : 'bg-amber-500'}`} /></div><div className="text-xs text-gray-500 mt-1">{item.operationalAlerts[0]?.message}</div></Link>)}</div></section> : null}
        <OperationalAlertQueue assemblies={rows} token={auth.token} tenantSlug={auth.tenantSlug} role={String(role || '')} onChanged={() => mutate()} />
      </> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {filtered.map((item) => {
          const blocked = item.metrics.blockedActivities;
          return (
            <div key={item.id} className={`border rounded-lg p-4 hover:shadow-sm space-y-3 ${item.metrics.riskLevel === 'CRITICAL' ? 'border-red-300' : item.metrics.riskLevel === 'WARNING' ? 'border-amber-300' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/assemblies/${item.id}`} className="font-semibold hover:underline">{item.workOrder.title}</Link>
                  <div className="text-sm text-gray-600">
                    {item.asset?.code || item.workOrder.assetCode} · {item.asset?.name || 'Equipo'}
                    {item.asset?.customer ? ` · ${item.asset.customer}` : ''}
                  </div>
                </div>
                <div className="text-right"><span className={`text-xs px-2 py-1 rounded-full ${signal(item)}`}>{riskLabel[item.metrics.riskLevel]}</span><div className="text-[11px] text-gray-500 mt-1">{assemblyStatusLabel[item.status] || item.status}</div></div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Avance {item.metrics.progressPercent}%</span>
                  <span>Presupuesto consumido {item.metrics.budgetConsumedPercent}%</span>
                </div>
                <div className="h-2 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, item.metrics.progressPercent)}%` }} />
                </div>
              </div>

              {item.operationalAlerts.length ? <div className="flex flex-wrap gap-1 text-xs">{item.operationalAlerts.map((alert) => <span key={alert.code} className={`rounded px-2 py-1 ${alert.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{alert.message}</span>)}</div> : null}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div><div className="text-xs text-gray-500">Presupuestado</div>{minutesLabel(item.plannedLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Real</div>{minutesLabel(item.metrics.actualLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Pronóstico</div>{minutesLabel(item.metrics.forecastLaborMinutes)}</div>
                <div><div className="text-xs text-gray-500">Bloqueos</div><span className={blocked ? 'text-red-700 font-medium' : ''}>{blocked}</span></div>
              </div>
              {item.metrics.nextActivityDueAt ? <div className="text-xs text-gray-500">Próximo vencimiento: <strong>{new Date(item.metrics.nextActivityDueAt).toLocaleString()}</strong></div> : null}
              <div className="flex justify-end gap-2 pt-1"><Link className="border rounded px-3 py-1.5 text-sm" href={`/assemblies/${item.id}/gantt`}>Gantt</Link><Link className="rounded px-3 py-1.5 text-sm bg-black text-white" href={`/assemblies/${item.id}`}>Abrir montaje</Link></div>
            </div>
          );
        })}
      </div>
      {rows.length && !filtered.length ? <div className="border rounded p-8 text-center text-gray-500">No hay montajes que coincidan con los filtros.</div> : null}
    </div>
  );
}

function Stat({ label, value, tone = 'gray', active = false, onClick }: { label: string; value: number; tone?: 'gray' | 'red' | 'amber' | 'sky'; active?: boolean; onClick?: () => void }) {
  const tones = { gray: 'text-gray-900', red: 'text-red-700', amber: 'text-amber-700', sky: 'text-sky-700' };
  return <button type="button" onClick={onClick} disabled={!onClick} className={`border rounded-lg p-3 text-left bg-white ${active && onClick ? 'ring-2 ring-gray-300' : ''} ${onClick ? 'hover:bg-gray-50' : ''}`}><div className="text-xs text-gray-500">{label}</div><div className={`text-2xl font-semibold ${tones[tone]}`}>{value}</div></button>;
}
