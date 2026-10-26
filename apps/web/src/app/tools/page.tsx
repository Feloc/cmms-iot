'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import ToolForm from '@/components/tools/ToolForm';
import ToolImport from '@/components/tools/ToolImport';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { ToolList, ToolUser, toolError, toolInput } from '@/lib/tools';

export default function ToolsPage() {
  const { data: session, status } = useSession(); const auth = getAuthFromSession(session); const router = useRouter();
  const [creating, setCreating] = useState(false), [importing, setImporting] = useState(false), [message, setMessage] = useState('');
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [q, setQ] = useState('');
  const [filters, setFilters] = useState({ status: '', tracking: '', location: '', category: '', responsibleUserId: '' });
  useEffect(() => { const timer = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const query = new URLSearchParams(Object.fromEntries(Object.entries({ ...filters, q, page: String(page) }).filter(([, v]) => v)));
  const { data, error, isLoading, mutate } = useApiSWR<ToolList>('/tools?' + query, auth.token, auth.tenantSlug);
  const { data: users, error: usersError } = useApiSWR<ToolUser[]>('/users', auth.token, auth.tenantSlug);
  const filter = (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };
  if (status === 'loading') return <p className="p-6">Cargando…</p>;
  if (!auth.token) return <p className="p-6">Inicia sesión.</p>;
  return <div className="space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Herramientas</h1><p className="text-sm text-gray-500">Registro, ubicación y control de entregas de la compañía.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void mutate()}>Actualizar</Button>{data?.permissions.manage && <><Button variant="outline" onClick={() => setImporting(true)}>Cargar CSV</Button><Button onClick={() => setCreating(true)}>Nueva herramienta</Button></>}</div></div>
    {message && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">{message}</p>}
    {creating && <ToolForm auth={auth} users={users || []} onClose={() => setCreating(false)} onSaved={tool => router.push('/tools/' + tool.id)} />}
    {importing && <ToolImport auth={auth} onClose={() => setImporting(false)} onSaved={count => { setImporting(false); setMessage(`Se registraron ${count} herramientas.`); void mutate(); }} />}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{([['quantity', 'Unidades registradas'], ['availableQty', 'Disponibles'], ['loanedQty', 'Prestadas'], ['maintenanceQty', 'En mantenimiento'], ['damagedQty', 'Dañadas'], ['retiredQty', 'Dadas de baja']] as const).map(([key, label]) => <div key={key} className="rounded-lg border bg-gray-50 p-3"><div className="text-sm text-gray-600">{label}</div><div className="text-2xl font-semibold">{error ? '—' : data?.stats[key] ?? '—'}</div></div>)}</div>
    <p className="text-xs text-gray-500">Los indicadores cuentan unidades y corresponden a los filtros actuales. Un grupo puede tener unidades en distintas condiciones.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-sm">Buscar<input className={toolInput} placeholder="Código, nombre, marca, modelo o serial" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Disponibilidad / condición<select className={toolInput} value={filters.status} onChange={e => filter('status', e.target.value)}><option value="">Todas</option><option value="AVAILABLE">Disponibles</option><option value="LOANED">Prestadas</option><option value="MAINTENANCE">En mantenimiento</option><option value="DAMAGED">Dañadas</option><option value="RETIRED">Dadas de baja</option></select></label>
      <label className="grid gap-1 text-sm">Control<select className={toolInput} value={filters.tracking} onChange={e => filter('tracking', e.target.value)}><option value="">Todos</option><option value="UNIT">Individual</option><option value="QUANTITY">Por cantidad</option></select></label>
      <label className="grid gap-1 text-sm">Responsable o receptor<select className={toolInput} value={filters.responsibleUserId} onChange={e => filter('responsibleUserId', e.target.value)}><option value="">Todos</option>{users?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Ubicación de almacenamiento<input className={toolInput} maxLength={200} value={filters.location} onChange={e => filter('location', e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Categoría<input className={toolInput} maxLength={100} value={filters.category} onChange={e => filter('category', e.target.value)} /></label>
    </div>
    {(error || usersError) && <p role="alert" className="text-red-700">{toolError(error || usersError)}</p>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-gray-50"><tr>{['Herramienta', 'Ubicación de almacenamiento', 'Responsable habitual', 'Total', 'Disponible', 'Prestada', 'Mantenimiento', 'Dañada', 'Baja'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{!error && data?.items.map(tool => <tr key={tool.id} className="border-t"><td className="p-3"><Link href={'/tools/' + tool.id} className="font-medium text-emerald-700 underline">{tool.name}</Link><div className="text-xs text-gray-500">{tool.code} · {tool.tracking === 'UNIT' ? 'Individual' : 'Por cantidad'}</div><div className="text-xs text-gray-500">{[tool.category, tool.brand, tool.model].filter(Boolean).join(' · ')}</div></td><td className="p-3">{tool.location}</td><td className="p-3">{users?.find(u => u.id === tool.responsibleUserId)?.name || 'Sin asignar'}</td>{(['quantity', 'availableQty', 'loanedQty', 'maintenanceQty', 'damagedQty', 'retiredQty'] as const).map(key => <td key={key} className="p-3 tabular-nums">{tool[key]}</td>)}</tr>)}</tbody></table>{isLoading && <p role="status" className="p-5">Cargando herramientas…</p>}{!isLoading && !error && !data?.items.length && <p className="p-5 text-gray-500">No hay herramientas para estos filtros.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>{data?.total || 0} registros</span><div className="flex items-center gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page} / {Math.max(1, data?.pages || 1)}</span><Button variant="outline" disabled={!data || page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div></div>
  </div>;
}
