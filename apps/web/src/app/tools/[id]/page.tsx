'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import ToolForm from '@/components/tools/ToolForm';
import ToolOperation, { ToolOperationKind } from '@/components/tools/ToolOperation';
import ToolPhoto from '@/components/tools/ToolPhoto';
import ToolHistory from '@/components/tools/ToolHistory';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { ToolDetail, ToolLoan, ToolUser, toolDate, toolError, toolOverdue } from '@/lib/tools';

export default function ToolDetailPage({ params }: { params: { id: string } }) {
  const { data: session, status } = useSession(); const auth = getAuthFromSession(session);
  const { data: tool, error, isLoading, mutate } = useApiSWR<ToolDetail>(`/tools/${params.id}`, auth.token, auth.tenantSlug);
  const { data: users, error: usersError } = useApiSWR<ToolUser[]>('/users', auth.token, auth.tenantSlug);
  const [editing, setEditing] = useState(false), [operation, setOperation] = useState<{ kind: ToolOperationKind; loan?: ToolLoan } | null>(null), [message, setMessage] = useState('');
  function saved(row: ToolDetail) { setEditing(false); setOperation(null); setMessage('Cambios guardados.'); void mutate(row); }
  if (status === 'loading' || isLoading) return <p role="status" className="p-6">Cargando herramienta…</p>;
  if (!auth.token) return <p className="p-6">Inicia sesión.</p>;
  if (error || !tool) return <div className="space-y-3 p-6"><Link href="/tools" className="underline">Volver a herramientas</Link><p role="alert" className="text-red-700">{error ? toolError(error) : 'Herramienta no encontrada'}</p><Button variant="outline" onClick={() => void mutate()}>Actualizar</Button></div>;
  return <div className="space-y-5 p-4 md:p-6">
    <Link href="/tools" className="text-sm text-emerald-700 underline">← Herramientas</Link>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{tool.name}</h1><p className="text-sm text-gray-500">{tool.code} · {tool.tracking === 'UNIT' ? 'Control individual' : 'Control por cantidad'}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void mutate()}>Actualizar</Button>{tool.permissions.manage && <Button variant="outline" onClick={() => setEditing(true)}>Editar ficha</Button>}{tool.permissions.operate && <Button disabled={!tool.availableQty} onClick={() => setOperation({ kind: 'lend' })}>Entregar herramienta</Button>}</div></div>
    {message && <p role="status" className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}{usersError && <p role="alert" className="text-red-700">{toolError(usersError)}</p>}
    {editing && <ToolForm tool={tool} users={users || []} auth={auth} onClose={() => setEditing(false)} onSaved={saved} />}
    {operation && <ToolOperation kind={operation.kind} loan={operation.loan} tool={tool} users={users || []} auth={auth} onClose={() => setOperation(null)} onSaved={saved} />}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{([['quantity', 'Unidades registradas'], ['availableQty', 'Disponibles'], ['loanedQty', 'Prestadas'], ['maintenanceQty', 'En mantenimiento'], ['damagedQty', 'Dañadas'], ['retiredQty', 'Dadas de baja']] as const).map(([key, label]) => <div key={key} className="rounded-lg border bg-gray-50 p-3"><div className="text-sm text-gray-600">{label}</div><div className="text-2xl font-semibold">{tool[key]}</div></div>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]"><section className="space-y-4 rounded-lg border p-4"><h2 className="font-semibold">Ficha de la herramienta</h2><dl className="grid gap-4 text-sm sm:grid-cols-2">{[['Categoría', tool.category], ['Marca / modelo', [tool.brand, tool.model].filter(Boolean).join(' · ')], ['Serial', tool.serialNumber], ['Ubicación de almacenamiento', tool.location], ['Responsable habitual', tool.responsible?.name], ['Fecha de compra', toolDate(tool.acquiredOn)]].map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd className="mt-1 font-medium">{value || 'Sin asignar'}</dd></div>)}</dl>{tool.notes && <div className="text-sm"><p className="text-gray-500">Observaciones</p><p className="mt-1 whitespace-pre-wrap">{tool.notes}</p></div>}{tool.permissions.manage && <div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={tool.availableQty + tool.maintenanceQty + tool.damagedQty === 0} onClick={() => setOperation({ kind: 'condition' })}>Cambiar condición / dar de baja</Button>{tool.tracking === 'QUANTITY' && <Button variant="outline" onClick={() => setOperation({ kind: 'receive' })}>Ingresar unidades</Button>}</div>}</section><ToolPhoto tool={tool} auth={auth} onSaved={saved} /></div>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Entregas pendientes de devolución</h2><p className="text-xs text-gray-500">El destino y la persona que tiene cada herramienta aparecen en estas entregas.</p>{!tool.loans.length && <p className="text-sm text-gray-500">No hay entregas pendientes.</p>}<div className="grid gap-3 lg:grid-cols-2">{tool.loans.map(loan => <article key={loan.id} className="space-y-2 rounded border p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-medium">{loan.recipientName}</h3><span className="text-sm">{loan.quantity - loan.returnedQty} pendiente(s)</span></div><p className="text-sm">Destino: {loan.destination}</p><p className="text-xs text-gray-500">Entregó {loan.deliveredByName} · {toolDate(loan.createdAt, true)} · {loan.quantity} unidad(es)</p><p className={`text-sm ${toolOverdue(loan) ? 'font-medium text-red-700' : 'text-gray-600'}`}>Devolución prevista: {toolDate(loan.expectedReturnOn)}{toolOverdue(loan) ? ' · Vencida' : ''}</p>{loan.note && <p className="whitespace-pre-wrap text-sm">{loan.note}</p>}{tool.permissions.operate && <Button variant="outline" onClick={() => setOperation({ kind: 'return', loan })}>Registrar devolución</Button>}</article>)}</div></section>
    {!!tool.closedLoans.length && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Últimas entregas devueltas</summary><ul className="mt-3 divide-y text-sm">{tool.closedLoans.map(loan => <li key={loan.id} className="py-2">{loan.recipientName} · {loan.destination} · {loan.quantity} unidad(es) · Devuelta el {toolDate(loan.returnedAt, true)}</li>)}</ul></details>}
    <ToolHistory id={tool.id} version={tool.version} auth={auth} users={users || []} />
  </div>;
}
