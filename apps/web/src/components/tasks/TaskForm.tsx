'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import TaskReferencePicker from './TaskReferencePicker';
import { Task, TaskFields, TaskUser, taskInput, taskPriorities, taskVisibility, taskError, localDateValue } from '@/lib/tasks';
export default function TaskForm({ task, users, auth, userId, onSaved, onClose }: { task?: Task; users: TaskUser[]; auth: { token?: string; tenantSlug?: string }; userId: string; onSaved: (task: Task) => void; onClose: () => void }) {
  const [fields, setFields] = useState<TaskFields>(task ? { title: task.title, description: task.description, expectedResult: task.expectedResult, priority: task.priority, visibility: task.visibility, responsibleUserId: task.responsibleUserId, plannedStart: localDateValue(task.plannedStart), dueAt: localDateValue(task.dueAt), tags: task.tags, participants: task.participants.map(p => ({ userId: p.userId, role: p.role })), assetId: task.assetId, workOrderId: task.workOrderId, manufacturingOrderId: task.manufacturingOrderId } : { title: '', description: '', expectedResult: '', priority: 'NORMAL', visibility: 'PRIVATE', responsibleUserId: userId, plannedStart: '', dueAt: '', tags: [], participants: [] });
  const [baseVersion] = useState(task?.version);
  const [tags, setTags] = useState(fields.tags.join(', '));
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key: keyof TaskFields, value: any) => setFields(f => ({ ...f, [key]: value }));
  return <form className="space-y-4 rounded-lg border bg-white p-5" onSubmit={async e => {
    e.preventDefault(); setError(''); setSaving(true);
    try {
      const result = await apiFetch<Task>(task ? `/tasks/${task.id}` : '/tasks', { ...auth, method: task ? 'PATCH' : 'POST', body: { ...fields, tags: [...new Set(tags.split(',').map(s => s.trim()).filter(Boolean))], plannedStart: fields.plannedStart ? new Date(fields.plannedStart).toISOString() : null, dueAt: fields.dueAt ? new Date(fields.dueAt).toISOString() : null, ...(task ? { version: baseVersion } : {}) } });
      onSaved(result);
    } catch (err) { setError(taskError(err)); } finally { setSaving(false); }
  }}>
    <h2 className="text-lg font-semibold">{task ? 'Editar tarea' : 'Nueva tarea'}</h2>
    <fieldset disabled={saving} className="space-y-4">
      <label className="grid gap-1 text-sm">Título<input required maxLength={200} className={taskInput} value={fields.title} onChange={e => set('title', e.target.value)} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Descripción<textarea maxLength={10000} rows={3} className={taskInput} value={fields.description} onChange={e => set('description', e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Resultado esperado<textarea maxLength={10000} rows={3} className={taskInput} value={fields.expectedResult} onChange={e => set('expectedResult', e.target.value)} placeholder="¿Cómo sabremos que está terminada?" /></label>
        <label className="grid gap-1 text-sm">Visibilidad<select className={taskInput} value={fields.visibility} onChange={e => set('visibility', e.target.value)}>{Object.entries(taskVisibility).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Responsable<select className={taskInput} value={fields.responsibleUserId || ''} onChange={e => set('responsibleUserId', e.target.value || null)}><option value="">Sin asignar</option>{users.filter(u => u.role !== 'VIEWER').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Prioridad<select className={taskInput} value={fields.priority} onChange={e => set('priority', e.target.value)}>{Object.entries(taskPriorities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Etiquetas, separadas por coma<input className={taskInput} value={tags} onChange={e => setTags(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Inicio previsto<input type="datetime-local" className={taskInput} value={fields.plannedStart || ''} onChange={e => set('plannedStart', e.target.value)} /></label>
        <label className="grid gap-1 text-sm">Vencimiento<input type="datetime-local" className={taskInput} value={fields.dueAt || ''} onChange={e => set('dueAt', e.target.value)} /></label>
      </div>
      <p className="rounded bg-emerald-50 p-3 text-sm">{fields.visibility === 'PRIVATE' ? 'Solo tú podrás verla, incluso frente a otros administradores. Para asignarla a otra persona o conservar participantes, cambia a selectiva.' : fields.visibility === 'PUBLIC' ? 'Todos los usuarios de tu empresa podrán verla. Solo los participantes autorizados podrán registrar avances.' : 'Solo el creador, el responsable y las personas seleccionadas podrán verla.'}</p>
      {(fields.visibility !== 'PRIVATE' || fields.participants.length > 0) && <div className="space-y-2"><h3 className="font-medium">Participantes</h3><label className="grid gap-1 text-sm">Buscar personas<input className={taskInput} value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="max-h-52 overflow-auto rounded border">{users.filter(u => u.id !== (task?.createdByUserId || userId) && u.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(u => {
          const participant = fields.participants.find(p => p.userId === u.id);
          return <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-b p-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={!!participant} onChange={e => set('participants', e.target.checked ? [...fields.participants, { userId: u.id, role: 'OBSERVER' }] : fields.participants.filter(p => p.userId !== u.id))} />{u.name}</label>{participant && <select aria-label={`Permiso de ${u.name}`} className="rounded border p-1" value={participant.role} onChange={e => set('participants', fields.participants.map(p => p.userId === u.id ? { ...p, role: e.target.value } : p))}><option value="OBSERVER">Observador</option>{u.role !== 'VIEWER' && <option value="COLLABORATOR">Colaborador</option>}</select>}</div>;
        })}</div>
      </div>}
      <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Relacionar con un activo u orden (opcional)</summary><div className="mt-3 grid gap-4 md:grid-cols-3">{([['asset', 'assetId', 'Activo'], ['workOrder', 'workOrderId', 'Orden de trabajo o servicio'], ['manufacturingOrder', 'manufacturingOrderId', 'Fabricación']] as const).map(([type, key, label]) => <TaskReferencePicker key={key} type={type} label={label} value={fields[key] || ''} currentLabel={task?.related?.find(r => r.type === type)?.label} auth={auth} onChange={id => set(key, id || null)} />)}</div></details>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex gap-2"><Button disabled={saving} type="submit">{saving ? 'Guardando…' : 'Guardar tarea'}</Button><Button disabled={saving} type="button" variant="outline" onClick={onClose}>Cerrar formulario</Button></div>
  </form>;
}
