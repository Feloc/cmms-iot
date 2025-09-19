'use client';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';

export default function WorkPanel({ wo }: { wo: any }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const [note, setNote] = useState('');

  const allowed = wo.status === 'OPEN' || wo.status === 'IN_PROGRESS' || wo.status === 'ON_HOLD'; // ajusta según tus ALLOWED

  const call = async (action: 'start'|'pause'|'stop') => {
    try {
      await apiFetch(`/work-orders/${wo.id}/work/${action}`, {
        method: 'POST',
        token, tenantSlug,
        body: { note },
      });
      location.reload();
    } catch (e:any) {
      alert(e.message || `Error en ${action}`);
    }
  };

  const totalMin = (wo.workLogs ?? []).reduce((acc:number, wl:any) => {
    const end = wl.endedAt ? new Date(wl.endedAt).getTime() : Date.now();
    const ms = end - new Date(wl.startedAt).getTime();
    return acc + Math.max(0, Math.round(ms/60000));
  }, 0);

  return (
    <div className="border rounded-2xl p-4">
      <h2 className="font-semibold mb-3">Trabajo</h2>
      <div className="flex gap-2 mb-3">
        <input className="border rounded px-3 py-2 flex-1" placeholder="Nota (opcional)" value={note} onChange={e=>setNote(e.target.value)}/>
        <button
            onClick={()=>call("start")}
            className="px-3 py-2 border rounded disabled:opacity-50"
            disabled={!allowed}
            title={allowed ? "Iniciar" : "No permitido en este estado"}
        >
            Iniciar
        </button>
        <button onClick={()=>call('pause')} className="px-3 py-2 border rounded">Pausar</button>
        <button onClick={()=>call('stop')} className="px-3 py-2 rounded bg-black text-white">Detener</button>
      </div>

      <div className="text-sm text-gray-600 mb-2">Tiempo total: {totalMin} min</div>

      <div className="space-y-2">
        {(wo.workLogs ?? []).sort((a:any,b:any)=>a.startedAt<b.startedAt?1:-1).map((wl:any)=>(
          <div key={wl.id} className="border rounded p-2">
            <div className="text-sm">{wl.user?.name ?? wl.user?.email ?? wl.userId} — {wl.source}</div>
            <div className="text-xs text-gray-500">
              {new Date(wl.startedAt).toLocaleString()} — {wl.endedAt ? new Date(wl.endedAt).toLocaleString() : 'EN CURSO'}
            </div>
            {wl.note && <div className="text-sm mt-1">{wl.note}</div>}
          </div>
        ))}
        {(!wo.workLogs || wo.workLogs.length===0) && <div className="text-sm text-gray-500">Aún no hay registros</div>}
      </div>
    </div>
  );
}
