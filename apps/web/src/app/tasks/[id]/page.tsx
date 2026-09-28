'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { apiBase, apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { Task, TaskList, TaskUser, taskActions, taskStatuses, taskPriorities, taskVisibility, taskInput, taskError, taskDate } from '@/lib/tasks';
import TaskForm from '@/components/tasks/TaskForm';

export default function TaskDetail({ params }: { params: { id: string } }) {
  const { data: session } = useSession(); const auth = getAuthFromSession(session);
  const { data: task, error: loadError, mutate } = useApiSWR<Task>('/tasks/' + params.id, auth.token, auth.tenantSlug);
  const { data: users } = useApiSWR<TaskUser[]>('/users', auth.token, auth.tenantSlug);
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [action, setAction] = useState(''), [reason, setReason] = useState('');
  const [kind, setKind] = useState('PROGRESS'), [note, setNote] = useState(''), [progress, setProgress] = useState(''), [minutes, setMinutes] = useState('');
  const [search, setSearch] = useState(''), [predecessor, setPredecessor] = useState('');
  const [file, setFile] = useState<File | null>(null), [updateId, setUpdateId] = useState(''), [fileKey, setFileKey] = useState(0);
  const candidateQuery = new URLSearchParams({ scope: 'all', q: search });
  const { data: candidates, error: candidatesError } = useApiSWR<TaskList>(task?.permissions.manage && !task.archivedAt && task.status === 'PENDING' ? '/tasks?' + candidateQuery : null, auth.token, auth.tenantSlug);
  async function post(path: string, body: any) {
    if (!task || busy) return false;
    setBusy(true); setError('');
    try { const result = await apiFetch<Task>(`/tasks/${task.id}/${path}`, { ...auth, method: 'POST', body: { ...body, version: task.version } }); await mutate(result, false); return true; }
    catch (err) { setError(taskError(err)); return false; } finally { setBusy(false); }
  }
  if (loadError) return <div className="space-y-3 p-6"><Link href="/tasks" className="underline">Volver a tareas</Link><p role="alert" className="text-red-700">{taskError(loadError)}</p><Button onClick={() => mutate()}>Reintentar</Button></div>;
  if (!task) return <p role="status" className="p-6">Cargando tarea…</p>;
  const name = (id?: string | null) => users?.find(u => u.id === id)?.name || 'Sin asignar';
  const editable = !task.archivedAt && !['COMPLETED', 'CANCELED'].includes(task.status);
  const actions: string[] = [];
  if (!task.archivedAt && task.permissions.execute) {
    if (['PENDING', 'PAUSED'].includes(task.status)) actions.push('start');
    if (task.status === 'IN_PROGRESS') actions.push('pause', 'complete');
  }
  if (task.permissions.manage) {
    if (task.archivedAt) actions.push('restore');
    else if (['COMPLETED', 'CANCELED'].includes(task.status)) actions.push('reopen', 'archive');
    else actions.push('cancel');
  }
  const timeline = [
    ...(task.updates || []).map(u => ({ id: u.id, at: u.createdAt, actor: u.actorName, title: u.kind === 'PROGRESS' ? `Avance: ${u.progressPercent} %` : 'Comentario', note: u.note, minutes: u.minutesSpent, details: undefined as Task['events'][number]['details'] })),
    ...(task.events || []).map(e => ({ id: e.id, at: e.createdAt, actor: e.actorName, title: ({ start: 'Ejecución iniciada', pause: 'Tarea pausada', complete: 'Tarea completada', cancel: 'Tarea cancelada', reopen: 'Tarea reabierta', archive: 'Tarea archivada', restore: 'Tarea restaurada' } as Record<string, string>)[e.action] || taskActions[e.action] || e.action, note: e.note, minutes: 0, details: e.details })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const fieldNames: Record<string, string> = { title: 'Título', description: 'Descripción', expectedResult: 'Resultado esperado', visibility: 'Visibilidad', priority: 'Prioridad', responsibleUserId: 'Responsable', plannedStart: 'Inicio previsto', dueAt: 'Vencimiento', tags: 'Etiquetas', participants: 'Participantes', assetId: 'Activo', workOrderId: 'Orden', manufacturingOrderId: 'Fabricación' };
  const display = (key: string, value: any): string => {
    if (value == null || value === '') return '—';
    if (key === 'responsibleUserId') return name(value);
    if (key === 'participants') return value.map((p: any) => `${name(p.userId)} (${p.role === 'COLLABORATOR' ? 'Colaborador' : 'Observador'})`).join(', ') || 'Ninguno';
    if (key === 'visibility') return taskVisibility[value];
    if (key === 'priority') return taskPriorities[value];
    if (key === 'dueAt' || key === 'plannedStart') return taskDate(value);
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };
  return <div className="space-y-5 p-4 md:p-6">
    <Link href="/tasks" className="text-sm text-emerald-700 underline">← Volver a tareas</Link>
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold break-words">{task.title}</h1><p className="mt-1 text-sm text-gray-600">{taskStatuses[task.status]} · {taskVisibility[task.visibility]} · Prioridad {taskPriorities[task.priority].toLowerCase()}{task.archivedAt ? ' · Archivada' : ''}</p></div><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => mutate()}>Actualizar</Button>{task.permissions.manage && editable && <Button variant="outline" disabled={busy} onClick={() => setEditing(!editing)}>Editar</Button>}</div></div>
    {task.blocked && <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Hay tareas predecesoras pendientes. No se puede iniciar ni completar esta tarea hasta que terminen.</p>}
    {task.overdue && <p className="text-sm font-medium text-red-700">Esta tarea está vencida.</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {editing && users && <TaskForm key={task.id} task={task} users={users} auth={auth} userId={(session as any)?.user?.id} onClose={() => setEditing(false)} onSaved={async r => { await mutate(r, false); setEditing(false); }} />}
    <div className="grid gap-5 lg:grid-cols-3"><section className="space-y-4 rounded-lg border p-4 lg:col-span-2">
      <h2 className="font-semibold">Descripción y resultado</h2><p className="whitespace-pre-wrap break-words text-sm">{task.description || 'Sin descripción.'}</p><p className="whitespace-pre-wrap break-words text-sm"><strong>Resultado esperado: </strong>{task.expectedResult || 'Sin especificar.'}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Responsable', name(task.responsibleUserId)], ['Creador', name(task.createdByUserId)], ['Inicio previsto', taskDate(task.plannedStart)], ['Vencimiento', taskDate(task.dueAt)], ['Inicio real', taskDate(task.startedAt)], ['Finalización', taskDate(task.completedAt)]].map(([label, value]) => <div key={label}><dt className="text-gray-500">{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="text-sm"><strong>Avance: {task.progressPercent} %</strong><progress aria-label="Avance de la tarea" max={100} value={task.progressPercent} className="mt-2 block w-full accent-emerald-700" /><p className="mt-2 text-gray-500">Tiempo registrado: {(task.updates || []).reduce((sum, u) => sum + u.minutesSpent, 0)} minutos.</p></div>
      {!!task.related?.length && <div className="space-y-1 text-sm"><strong>Referencias</strong>{task.related.map(r => <Link key={r.type} href={r.href} className="block text-emerald-700 underline">{r.label}</Link>)}</div>}
      {!!task.tags.length && <p className="text-sm">Etiquetas: {task.tags.join(' · ')}</p>}
      <div className="flex flex-wrap gap-2">{actions.map(a => <Button key={a} variant={a === 'start' || a === 'complete' ? 'default' : 'outline'} disabled={busy || ((a === 'start' || a === 'complete') && (task.blocked || !task.responsibleUserId))} onClick={() => { setAction(a); setReason(''); }}>{taskActions[a]}</Button>)}</div>
      {action && <form className="space-y-2 rounded bg-gray-50 p-3" onSubmit={async e => { e.preventDefault(); if (await post('actions', { action, note: reason })) setAction(''); }}><h3 className="text-sm font-semibold">{taskActions[action]}</h3><label className="grid gap-1 text-sm">{['pause', 'cancel', 'reopen'].includes(action) ? 'Motivo obligatorio' : 'Nota opcional'}<textarea required={['pause', 'cancel', 'reopen'].includes(action)} maxLength={10000} className={taskInput} value={reason} onChange={e => setReason(e.target.value)} /></label>{action === 'reopen' && <p className="text-xs">Se reiniciará el avance al 0 %. La bitácora anterior se conserva.</p>}<div className="flex gap-2"><Button disabled={busy} type="submit">Confirmar</Button><Button disabled={busy} type="button" variant="outline" onClick={() => setAction('')}>Volver</Button></div></form>}
    </section><aside className="space-y-4 rounded-lg border p-4"><h2 className="font-semibold">Participantes</h2><p className="text-sm">{task.visibility === 'PUBLIC' ? 'Visible para toda la empresa.' : task.visibility === 'PRIVATE' ? 'Visible únicamente para su creador.' : 'Visible para el creador, el responsable y los participantes.'}</p><ul className="space-y-2 text-sm">{task.participants.map(p => <li key={p.userId}>{name(p.userId)} · {p.role === 'COLLABORATOR' ? 'Colaborador' : 'Observador'}</li>)}</ul><p className="text-xs text-gray-500">Los observadores pueden consultar. Los colaboradores pueden registrar avances. El responsable puede ejecutar y completar.</p></aside></div>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Debe completarse antes</h2>{!task.dependencies.length && <p className="text-sm text-gray-500">Esta tarea no tiene dependencias.</p>}{task.dependencies.map(d => <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"><div>{d.restricted ? <span>Dependencia restringida</span> : <Link className="text-emerald-700 underline" href={'/tasks/' + d.predecessorId}>{d.title}</Link>}<span className="ml-2">{d.completed ? '✓ Completada' : 'Pendiente de completar'}</span></div>{task.permissions.manage && !task.archivedAt && <Button variant="outline" disabled={busy} onClick={() => post(`dependencies/${d.id}/remove`, {})}>Retirar dependencia</Button>}</div>)}
      {task.permissions.manage && task.status === 'PENDING' && !task.archivedAt && <form className="grid items-end gap-3 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); if (await post('dependencies', { predecessorId: predecessor })) setPredecessor(''); }}><label className="grid gap-1 text-sm">Buscar tarea predecesora<input className={taskInput} value={search} onChange={e => { setSearch(e.target.value); setPredecessor(''); }} /></label><label className="grid gap-1 text-sm">Tarea<select required className={taskInput} value={predecessor} onChange={e => setPredecessor(e.target.value)}><option value="">Seleccionar entre las visibles</option>{!candidatesError && candidates?.items.filter(t => t.id !== task.id && t.status !== 'CANCELED' && !task.dependencies.some(d => d.predecessorId === t.id)).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label><Button disabled={busy || !predecessor} type="submit">Agregar dependencia</Button>{candidatesError && <p role="alert" className="text-sm text-red-700">{taskError(candidatesError)}</p>}<p className="text-xs text-gray-500 sm:col-span-3">Se muestran hasta 30 coincidencias. Usa el buscador para encontrar otra tarea.</p></form>}
    </section>
    {task.permissions.contribute && !task.archivedAt && <section className="grid gap-5 lg:grid-cols-2"><form className="space-y-3 rounded-lg border p-4" onSubmit={async e => { e.preventDefault(); if (await post('updates', { kind, note, ...(kind === 'PROGRESS' ? { progressPercent: Number(progress || task.progressPercent), ...(minutes ? { minutesSpent: Number(minutes) } : {}) } : {}) })) { setNote(''); setProgress(''); setMinutes(''); } }}><h2 className="font-semibold">Registrar seguimiento</h2><label className="grid gap-1 text-sm">Tipo<select className={taskInput} value={kind} onChange={e => setKind(e.target.value)}><option value="PROGRESS">Avance</option><option value="COMMENT">Comentario</option></select></label><label className="grid gap-1 text-sm">Descripción / motivo de corrección<textarea required maxLength={10000} rows={3} className={taskInput} value={note} onChange={e => setNote(e.target.value)} /></label>{kind === 'PROGRESS' && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Avance total (%)<input type="number" min={0} max={99} step={1} className={taskInput} value={progress} placeholder={String(task.progressPercent)} onChange={e => setProgress(e.target.value)} /></label><label className="grid gap-1 text-sm">Tiempo invertido (minutos)<input type="number" min={0} max={100000} step={1} className={taskInput} value={minutes} onChange={e => setMinutes(e.target.value)} /></label></div>}{kind === 'PROGRESS' && <p className="text-xs text-gray-500">El porcentaje reemplaza al anterior. El 100 % se registra al completar. Para reducirlo, explica el motivo en la descripción.</p>}<Button disabled={busy || (kind === 'PROGRESS' && task.status !== 'IN_PROGRESS')} type="submit">Registrar {kind === 'PROGRESS' ? 'avance' : 'comentario'}</Button>{kind === 'PROGRESS' && task.status !== 'IN_PROGRESS' && <p className="text-xs text-amber-700">La tarea debe estar en ejecución para registrar avances.</p>}</form>
      <form className="space-y-3 rounded-lg border p-4" onSubmit={async e => {
        e.preventDefault(); if (!file || busy) return; setBusy(true); setError('');
        try { if (file.size > 30 * 1024 * 1024) throw new Error('{"message":"El archivo supera los 30 MB"}');
          const body = new FormData(); body.append('file', file); body.append('version', String(task.version)); if (updateId) body.append('updateId', updateId);
          const response = await fetch(`${apiBase}/tasks/${task.id}/attachments`, { method: 'POST', body }); if (!response.ok) throw new Error(await response.text());
          await mutate(await response.json(), false); setFile(null); setFileKey(k => k + 1); setUpdateId('');
        } catch (err) { setError(taskError(err)); } finally { setBusy(false); }
      }}><h2 className="font-semibold">Adjuntar evidencia</h2><label className="grid gap-1 text-sm">Archivo (máximo 30 MB)<input key={fileKey} required type="file" className={taskInput} onChange={e => setFile(e.target.files?.[0] || null)} /></label><label className="grid gap-1 text-sm">Relacionar con<select className={taskInput} value={updateId} onChange={e => setUpdateId(e.target.value)}><option value="">La tarea</option>{task.updates.map(u => <option key={u.id} value={u.id}>{taskDate(u.createdAt)} — {u.note.slice(0, 70)}</option>)}</select></label><p className="text-xs text-gray-500">Solo podrán descargar el archivo quienes tengan acceso a la tarea.</p><Button disabled={busy || !file} type="submit">Subir evidencia</Button></form>
    </section>}
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Evidencias</h2>{!task.attachments.length && <p className="text-sm text-gray-500">No hay archivos adjuntos.</p>}<ul className="space-y-2">{task.attachments.map(f => <li key={f.id} className="text-sm"><a className="text-emerald-700 underline" href={`${apiBase}/tasks/${task.id}/attachments/${f.id}/download`}>{f.filename}</a><span className="ml-2 text-xs text-gray-500">{Math.ceil(f.size / 1024)} KB · {taskDate(f.createdAt)}{f.updateId ? ' · Vinculada a una entrada de seguimiento' : ''}</span></li>)}</ul></section>
    <section className="space-y-4 rounded-lg border p-4"><h2 className="font-semibold">Bitácora e historial</h2>{timeline.map(item => <article key={item.id} className="space-y-2 border-l-2 border-emerald-200 pl-4"><div className="text-sm font-medium">{item.title}</div><div className="text-xs text-gray-500">{item.actor} · {taskDate(item.at)}{item.minutes ? ` · ${item.minutes} minutos` : ''}</div>{item.note && <p className="whitespace-pre-wrap break-words text-sm">{item.note}</p>}{item.details?.before && item.details.after && <details className="text-sm"><summary className="cursor-pointer text-emerald-700">Ver cambios</summary><ul className="mt-2 space-y-2">{Object.keys(item.details.after).filter(key => JSON.stringify(item.details?.before?.[key]) !== JSON.stringify(item.details?.after?.[key])).map(key => <li key={key} className="break-words"><strong>{fieldNames[key] || key}: </strong>{display(key, item.details?.before?.[key])} → {display(key, item.details?.after?.[key])}</li>)}</ul></details>}{task.attachments.filter(f => f.updateId === item.id).map(f => <a key={f.id} className="block text-sm text-emerald-700 underline" href={`${apiBase}/tasks/${task.id}/attachments/${f.id}/download`}>{f.filename}</a>)}</article>)}</section>
  </div>;
}
