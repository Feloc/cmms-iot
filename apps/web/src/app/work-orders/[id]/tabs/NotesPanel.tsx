'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

type Note = { id: string; note: string; addedByUserId: string; addedAt: string };

export default function NotesPanel({ woId }: { woId: string }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const { data, error, isLoading, mutate } = useApiSWR<Note[]>(
    token && tenantSlug ? `/work-orders/${woId}/notes` : null,
    token, tenantSlug
  );

  const [text, setText] = useState('');

  const add = async () => {
    if (!text.trim()) return;
    try {
      await apiFetch(`/work-orders/${woId}/notes`, { method:'POST', token, tenantSlug, body: { note: text } });
      setText('');
      mutate();
    } catch (e:any) { alert(e.message || 'Error agregando nota'); }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar nota?')) return;
    try {
      await apiFetch(`/work-orders/${woId}/notes/${id}`, { method:'DELETE', token, tenantSlug });
      mutate();
    } catch (e:any) { alert(e.message || 'Error eliminando nota'); }
  };

  if (isLoading) return <div>Cargando…</div>;
  if (error) return <div className="text-red-600">Error: {(error as any).message}</div>;

  const notes = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Añadir nota técnica…"
          value={text}
          onChange={e=>setText(e.target.value)}
        />
        <button onClick={add} className="px-3 py-2 rounded bg-black text-white">Agregar</button>
      </div>

      <div className="space-y-2">
        {notes.map(n => (
          <div key={n.id} className="border rounded p-2 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">{new Date(n.addedAt).toLocaleString()}</div>
              <div className="text-gray-700 whitespace-pre-wrap">{n.note}</div>
            </div>
            <button onClick={()=>remove(n.id)} className="px-2 py-1 border rounded">Eliminar</button>
          </div>
        ))}
        {notes.length===0 && <div className="text-sm text-gray-500">Sin notas</div>}
      </div>
    </div>
  );
}
