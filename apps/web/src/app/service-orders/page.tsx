'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

type User = { id: string; name: string; email: string; role: string };

type ServiceOrder = {
  id: string;
  title: string;
  status: string;
  serviceOrderType?: string | null;
  dueDate?: string | null;
  assetCode: string;
  asset?: {
    id: string;
    name?: string | null;
    brand?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    customer?: string | null;
  } | null;
  assignments?: Array<{
    id: string;
    role: string;
    state: string;
    user?: { id: string; name: string } | null;
  }> | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number };
type EditRow = { dueLocal: string; technicianId: string };

const EMPTY_ITEMS: ServiceOrder[] = [];

export default function ServiceOrdersPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [techId, setTechId] = useState('');
  const [edits, setEdits] = useState<Record<string, EditRow>>({});

  const listPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug) return null;
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (type) qs.set('type', type);
    if (status) qs.set('status', status);
    if (techId) qs.set('technicianId', techId);
    qs.set('page', '1');
    qs.set('size', '50');
    return `/service-orders?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, q, type, status, techId]);

  const { data, error, isLoading, mutate } = useApiSWR<Paginated<ServiceOrder>>(listPath, auth.token, auth.tenantSlug);
  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);

  const items = data?.items ?? EMPTY_ITEMS;

  // Inicializa state de edición cuando llegan items nuevos
  useEffect(() => {
    if (items.length === 0) return;

    setEdits((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const so of items) {
        // Solo inicializa si aún no existe la fila en edits (no pisa cambios del usuario)
        if (next[so.id]) continue;

        const dueLocal = so.dueDate ? new Date(so.dueDate).toISOString().slice(0, 16) : '';
        const tech = so.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;
        next[so.id] = { dueLocal, technicianId: tech?.id ?? '' };
        changed = true;
      }

      // Evita loops: si no hubo cambios reales, no actualices el state
      return changed ? next : prev;
    });
  }, [items]);

  async function saveSchedule(id: string) {
    const row = edits[id];
    if (!row) return;
    await apiFetch(`/service-orders/${id}/schedule`, {
      method: 'PATCH',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: {
        dueDate: row.dueLocal ? new Date(row.dueLocal).toISOString() : null,
        technicianId: row.technicianId || undefined,
      },
    });
    mutate();
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error cargando órdenes.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Órdenes de servicio</div>
          <div className="text-sm text-gray-600">Crea, filtra y programa la ejecución.</div>
        </div>
        <div className="flex items-center gap-3">
          <Link className="px-3 py-2 border rounded" href="/calendar">
            Calendario
          </Link>
          <Link className="px-3 py-2 border rounded bg-black text-white" href="/service-orders/new">
            Nueva OS
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Buscar</label>
          <input
            className="border rounded px-2 py-1"
            value={q}
            placeholder="Activo, cliente, serie, código..."
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Tipo</label>
          <select className="border rounded px-2 py-1" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">(todos)</option>
            <option value="ALISTAMIENTO">Alistamiento</option>
            <option value="DIAGNOSTICO">Diagnóstico</option>
            <option value="PREVENTIVO">Mtto Preventivo</option>
            <option value="CORRECTIVO">Mtto Correctivo</option>
            <option value="ENTREGA">Entrega</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Estado</label>
          <select className="border rounded px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">(todos)</option>
            <option value="OPEN">OPEN</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Técnico</label>
          <select className="border rounded px-2 py-1" value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">(todos)</option>
            {(techs ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2">Fecha ejecución</th>
              <th className="p-2">Activo</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Estado</th>
              <th className="p-2">Técnico</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={6}>
                  No hay órdenes.
                </td>
              </tr>
            ) : (
              items.map((so) => {
                const row = edits[so.id] ?? { dueLocal: '', technicianId: '' };
                return (
                  <tr key={so.id} className="border-t">
                    <td className="p-2">
                      <input
                        type="datetime-local"
                        className="border rounded px-2 py-1"
                        value={row.dueLocal}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [so.id]: { ...row, dueLocal: e.target.value } }))
                        }
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{so.assetCode}</div>
                      <div className="text-xs text-gray-600">
                        {so.asset?.customer ? `Cliente: ${so.asset.customer} · ` : ''}
                        {so.asset?.name ?? ''}
                        {so.asset?.serialNumber ? ` · Serie: ${so.asset.serialNumber}` : ''}
                      </div>
                    </td>
                    <td className="p-2">{so.serviceOrderType ?? '-'}</td>
                    <td className="p-2">{so.status}</td>
                    <td className="p-2">
                      <select
                        className="border rounded px-2 py-1"
                        value={row.technicianId}
                        onChange={(e) =>
                          setEdits((prev) => ({ ...prev, [so.id]: { ...row, technicianId: e.target.value } }))
                        }
                      >
                        <option value="">(sin asignar)</option>
                        {(techs ?? []).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 space-x-2">
                      <button className="px-2 py-1 border rounded" onClick={() => saveSchedule(so.id)}>
                        Guardar
                      </button>
                      <Link className="underline text-blue-600" href={`/service-orders/${so.id}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-600">
        Mostrando {items.length} / {data?.total ?? 0}
      </div>
    </div>
  );
}
