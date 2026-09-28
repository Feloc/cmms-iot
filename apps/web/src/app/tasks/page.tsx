'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { TaskList, TaskUser, taskStatuses, taskVisibility, taskPriorities, taskInput, taskError, taskDate } from '@/lib/tasks';
import TaskForm from '@/components/tasks/TaskForm';
export default function TasksPage() {
  const { data: session, status } = useSession(); const auth = getAuthFromSession(session); const router = useRouter();
  const user = (session as any)?.user;
  const [creating, setCreating] = useState(false), [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ scope: 'assigned', q: '', status: '', priority: '', visibility: '', responsibleUserId: '', archived: 'false', condition: '' });
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(page) });
  const { data, error, isLoading, mutate } = useApiSWR<TaskList>('/tasks?' + query, auth.token, auth.tenantSlug);
  const { data: users } = useApiSWR<TaskUser[]>('/users', auth.token, auth.tenantSlug);
  const filter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };
  if (status === 'loading') return <p className="p-6">Cargando…</p>;
  if (!auth.token) return <p className="p-6">Inicia sesión.</p>;
  return <div className="space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Tareas</h1><p className="text-sm text-gray-500">Responsables, compromisos y seguimiento de ejecución.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => mutate()}>Actualizar</Button>{['ADMIN', 'TECH'].includes(user?.role) && <Button onClick={() => setCreating(true)}>Nueva tarea</Button>}</div></div>
    {creating && users && <TaskForm users={users} auth={auth} userId={user?.id} onClose={() => setCreating(false)} onSaved={r => router.push('/tasks/' + r.id)} />}
    <div className="flex flex-wrap gap-2">{Object.entries({ assigned: 'Asignadas a mí', created: 'Creadas por mí', shared: 'Compartidas conmigo', all: 'Todas las visibles' }).map(([key, label]) => <Button key={key} variant={filters.scope === key ? 'default' : 'outline'} onClick={() => filter('scope', key)}>{label}</Button>)}</div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['pending', 'Por terminar'], ['overdue', 'Vencidas'], ['blocked', 'Bloqueadas'], ['stale', 'Sin avances en 7 días']].map(([key, label]) => <div key={key} className="rounded-lg border bg-gray-50 p-3"><div className="text-sm text-gray-600">{label}</div><div className="text-2xl font-semibold">{data?.stats[key as keyof TaskList['stats']] ?? '—'}</div></div>)}</div>
    <p className="text-xs text-gray-500">Los indicadores corresponden a las tareas visibles con los filtros actuales.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm">Buscar<input className={taskInput} value={filters.q} onChange={e => filter('q', e.target.value)} placeholder="Título, descripción o etiqueta" /></label>
      {([['status', 'Estado', taskStatuses], ['priority', 'Prioridad', taskPriorities], ['visibility', 'Visibilidad', taskVisibility], ['condition', 'Seguimiento', { overdue: 'Vencidas', blocked: 'Bloqueadas', stale: 'Sin avances en 7 días' }]] as [string, string, Record<string, string>][]).map(([key, label, values]) => <label key={key} className="grid gap-1 text-sm">{label}<select className={taskInput} value={filters[key]} onChange={e => filter(key, e.target.value)}><option value="">Todos</option>{Object.entries(values).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>)}
      <label className="grid gap-1 text-sm">Responsable<select className={taskInput} value={filters.responsibleUserId} onChange={e => filter('responsibleUserId', e.target.value)}><option value="">Todos</option>{users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Archivo<select className={taskInput} value={filters.archived} onChange={e => filter('archived', e.target.value)}><option value="false">Sin archivar</option><option value="true">Archivadas</option></select></label>
    </div>
    {error && <p role="alert" className="text-red-700">{taskError(error)}</p>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gray-50"><tr>{['Tarea', 'Responsable', 'Estado', 'Prioridad', 'Avance', 'Vencimiento', 'Visibilidad'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{!error && data?.items.map(t => <tr key={t.id} className="border-t"><td className="max-w-xs p-3"><Link className="font-medium text-emerald-700 underline" href={'/tasks/' + t.id}>{t.title}</Link><div className="text-xs text-gray-500">{t.tags.join(' · ')}</div></td><td className="p-3">{users?.find(u => u.id === t.responsibleUserId)?.name || 'Sin asignar'}</td><td className="p-3">{taskStatuses[t.status]}{t.blocked && <div className="text-xs text-amber-700">Dependencias pendientes</div>}</td><td className="p-3">{taskPriorities[t.priority]}</td><td className="p-3"><progress aria-label={`Avance de ${t.title}`} max={100} value={t.progressPercent} className="w-20 accent-emerald-700" /><div>{t.progressPercent} %</div></td><td className={`p-3 ${t.overdue ? 'text-red-700' : ''}`}>{taskDate(t.dueAt)}{t.overdue && <div>Vencida</div>}</td><td className="p-3">{taskVisibility[t.visibility]}</td></tr>)}</tbody></table>{isLoading && <p role="status" className="p-5">Cargando tareas…</p>}{!isLoading && !error && !data?.items.length && <p className="p-5 text-gray-500">No hay tareas para estos filtros.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>{data?.total || 0} tareas</span><div className="flex items-center gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page} / {Math.max(1, data?.pages || 1)}</span><Button variant="outline" disabled={!data || page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></div>
  </div>;
}
