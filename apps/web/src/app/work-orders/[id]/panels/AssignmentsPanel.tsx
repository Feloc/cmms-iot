'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function AssignmentsPanel({ wo }: { wo: any }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<'TECHNICIAN'|'SUPERVISOR'>('TECHNICIAN');

  const add = async () => {
    try {
      await apiFetch(`/work-orders/${wo.id}/assignments`, {
        method: 'POST',
        token, tenantSlug,
        body: { userId, role },
      });
      location.reload();
    } catch (e:any) {
      alert(e.message || 'Error asignando');
    }
  };

  const remove = async (assignmentId: string) => {
    try {
      await apiFetch(`/work-orders/${wo.id}/assignments/${assignmentId}`, {
        method: 'PATCH',
        token, tenantSlug,
        body: { state: 'REMOVED' },
      });
      location.reload();
    } catch (e:any) {
      alert(e.message || 'Error actualizando assignment');
    }
  };

  return (
    <div className="border rounded-2xl p-4">
      <h2 className="font-semibold mb-3">Equipo</h2>
      <div className="space-y-2">
        {(wo.assignments ?? []).filter((a:any)=>a.state==='ACTIVE').map((a:any)=>(
          <div key={a.id} className="flex items-center justify-between border rounded p-2">
            <div>{a.user?.name ?? a.user?.email ?? a.userId} — {a.role}</div>
            <button onClick={()=>remove(a.id)} className="text-sm px-2 py-1 border rounded">Quitar</button>
          </div>
        ))}
        {(!wo.assignments || wo.assignments.filter((a:any)=>a.state==='ACTIVE').length===0) &&
          <div className="text-sm text-gray-500">Sin asignaciones activas</div>}
      </div>

      <div className="mt-3 flex gap-2">
        <input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UserId" className="border rounded px-3 py-2"/>
        <select value={role} onChange={e=>setRole(e.target.value as any)} className="border rounded px-3 py-2">
          <option value="TECHNICIAN">TECHNICIAN</option>
          <option value="SUPERVISOR">SUPERVISOR</option>
        </select>
        <button onClick={add} className="px-3 py-2 rounded bg-black text-white">Agregar</button>
      </div>
    </div>
  );
}
