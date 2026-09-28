'use client';
import { useState } from 'react';
import { useApiSWR } from '@/lib/swr';
import { taskError, taskInput } from '@/lib/tasks';
export default function TaskReferencePicker({ type, label, value, currentLabel, auth, onChange }: { type: string; label: string; value: string; currentLabel?: string; auth: { token?: string; tenantSlug?: string }; onChange: (id: string) => void }) {
  const [q, setQ] = useState('');
  const query = new URLSearchParams({ type, q });
  const { data, error } = useApiSWR<{ id: string; label: string }[]>('/tasks/references?' + query, auth.token, auth.tenantSlug);
  return <div className="space-y-2"><label className="grid gap-1 text-sm">Buscar {label.toLowerCase()}<input className={taskInput} value={q} onChange={e => setQ(e.target.value)} /></label><label className="grid gap-1 text-sm">{label}<select className={taskInput} value={value} onChange={e => onChange(e.target.value)}><option value="">Sin relación</option>{value && !data?.some(r => r.id === value) && <option value={value}>{currentLabel || 'Referencia seleccionada'}</option>}{!error && data?.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>{error && <p role="alert" className="text-xs text-red-700">{taskError(error)}</p>}</div>;
}
