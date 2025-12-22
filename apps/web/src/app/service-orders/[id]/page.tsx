'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { SignatureCanvas } from '@/components/SignatureCanvas';

type User = { id: string; name: string; email: string; role: string };
type InventoryItem = { id: string; sku: string; name: string; model?: string | null };
type Part = { id: string; qty: number; notes?: string | null; freeText?: string | null; inventoryItem?: InventoryItem | null };

type ServiceOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  serviceOrderType?: string | null;
  dueDate?: string | null;
  hasIssue: boolean;
  assetCode: string;
  asset?: { customer?: string | null; name?: string | null; brand?: string | null; model?: string | null; serialNumber?: string | null } | null;
  assignments?: Array<{ id: string; userId: string; user?: User | null; role: string; state: string }>;
  pmPlan?: { id: string; name: string; checklist?: any };
  formData?: any;
  takenAt?: string | null;
  arrivedAt?: string | null;
  checkInAt?: string | null;
  activityStartedAt?: string | null;
  activityFinishedAt?: string | null;
  deliveredAt?: string | null;
  technicianSignature?: string | null;
  receiverSignature?: string | null;
  serviceOrderParts?: Part[];
};

function isoToLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const { data, error, isLoading, mutate } = useApiSWR<ServiceOrder>(id ? `/service-orders/${id}` : null, auth.token, auth.tenantSlug);
  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);

  const [busy, setBusy] = useState(false);
  const [partQ, setPartQ] = useState('');
  const invPath = useMemo(() => {
    const q = partQ.trim();
    if (!q) return null;
    const qs = new URLSearchParams({ q });
    return `/inventory/search?${qs.toString()}`;
  }, [partQ]);
  const { data: invMatches } = useApiSWR<InventoryItem[]>(invPath, auth.token, auth.tenantSlug);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {(error as any).message}</div>;
  if (!data) return <div className="p-6">No encontrado.</div>;

  const tech = data.assignments?.find(a => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;

  async function patch(path: string, body: any) {
    setBusy(true);
    try {
      await apiFetch(path, { method: 'PATCH', token: auth.token!, tenantSlug: auth.tenantSlug!, body });
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  async function patchSchedule(dueLocal: string, technicianId: string) {
    await patch(`/service-orders/${id}/schedule`, {
      dueDate: dueLocal ? new Date(dueLocal).toISOString() : null,
      technicianId: technicianId || undefined,
    });
  }

  async function addPart(item?: InventoryItem) {
    await apiFetch(`/service-orders/${id}/parts`, {
      method: 'POST',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: item ? { inventoryItemId: item.id, qty: 1 } : { freeText: partQ.trim(), qty: 1 },
    });
    setPartQ('');
    mutate();
  }

  async function removePart(partId: string) {
    await apiFetch(`/service-orders/${id}/parts/${partId}`, {
      method: 'DELETE',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
    });
    mutate();
  }

  // Formularios dinámicos (simple v1)
  const fd = data.formData ?? {};
  const checklist = Array.isArray(data.pmPlan?.checklist) ? data.pmPlan!.checklist : [];
  const checked: Record<string, boolean> = fd.checked ?? {};

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{data.title}</h1>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Activo:</span> {data.assetCode} · {data.asset?.name ?? ''}
        </div>
        <div className="text-sm text-gray-700">
          Cliente: {data.asset?.customer ?? '-'} · Marca: {data.asset?.brand ?? '-'} · Modelo: {data.asset?.model ?? '-'} · Serie: {data.asset?.serialNumber ?? '-'}
        </div>
      </div>

      {/* Programación */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Programación</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <div className="text-sm">{data.serviceOrderType ?? '-'}</div>
          </div>
          <div>
            <label className="text-sm font-medium">Fecha/hora ejecución</label>
            <input
              type="datetime-local"
              className="border rounded px-3 py-2 w-full"
              defaultValue={isoToLocal(data.dueDate)}
              onBlur={(e) => patchSchedule(e.target.value, tech?.id ?? '')}
            />
            <p className="text-xs text-gray-500">Cambia el valor y sal del campo para guardar.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Técnico</label>
            <select
              className="border rounded px-3 py-2 w-full"
              defaultValue={tech?.id ?? ''}
              onChange={(e) => patchSchedule(isoToLocal(data.dueDate), e.target.value)}
            >
              <option value="">(sin asignar)</option>
              {(techs ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* Timestamps */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Tiempos (timestamps)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[
            ['takenAt','Hora toma OS'],
            ['arrivedAt','Hora llegada cliente'],
            ['checkInAt','Hora ingreso'],
            ['activityStartedAt','Inicio actividad'],
            ['activityFinishedAt','Fin actividad'],
            ['deliveredAt','Hora entrega'],
          ].map(([k,label]) => (
            <div key={k}>
              <label className="text-sm font-medium">{label}</label>
              <input
                type="datetime-local"
                className="border rounded px-3 py-2 w-full"
                defaultValue={isoToLocal((data as any)[k])}
                onBlur={(e) => patch(`/service-orders/${id}/timestamps`, { [k]: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Formulario dinámico */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Formulario técnico</h2>

        {data.serviceOrderType === 'PREVENTIVO' && (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">
              Plan: <span className="font-medium">{data.pmPlan?.name ?? '(sin plan)'}</span>
            </div>
            {checklist.length > 0 ? (
              <div className="space-y-1">
                {checklist.map((it: any, idx: number) => {
                  const key = typeof it === 'string' ? it : (it?.label ?? `item-${idx}`);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        defaultChecked={!!checked[key]}
                        onChange={(e) => {
                          const next = { ...checked, [key]: e.target.checked };
                          patch(`/service-orders/${id}/form`, { formData: { ...fd, checked: next } });
                        }}
                      />
                      <span>{key}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-600">Este PM Plan no tiene checklist aún.</div>
            )}
          </div>
        )}

        {data.serviceOrderType !== 'PREVENTIVO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Observaciones</label>
              <textarea
                className="border rounded px-3 py-2 w-full"
                rows={4}
                defaultValue={fd.notes ?? ''}
                onBlur={(e) => patch(`/service-orders/${id}/form`, { formData: { ...fd, notes: e.target.value } })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Resultado</label>
              <textarea
                className="border rounded px-3 py-2 w-full"
                rows={4}
                defaultValue={fd.result ?? ''}
                onBlur={(e) => patch(`/service-orders/${id}/form`, { formData: { ...fd, result: e.target.value } })}
              />
            </div>
          </div>
        )}
      </section>

      {/* Novedad / Repuestos necesarios */}
      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Novedad y repuestos necesarios</h2>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              defaultChecked={data.hasIssue}
              onChange={(e) => patch(`/service-orders/${id}`, { hasIssue: e.target.checked })}
            />
            Tiene novedad
          </label>
        </div>

        {data.hasIssue && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Buscar repuesto (sku / nombre / modelo)</label>
              <input className="border rounded px-3 py-2 w-full" value={partQ} onChange={(e) => setPartQ(e.target.value)} />
              {partQ.trim() && (invMatches ?? []).length > 0 && (
                <div className="border rounded mt-1">
                  {(invMatches ?? []).map(it => (
                    <button
                      key={it.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                      onClick={() => addPart(it)}
                    >
                      <div className="font-medium">{it.sku} — {it.name}</div>
                      <div className="text-xs text-gray-600">{it.model ?? ''}</div>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className="px-3 py-2 border rounded" onClick={() => addPart(undefined)} disabled={!partQ.trim()}>
                Agregar como texto libre
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Listado de repuestos necesarios</div>
              {(data.serviceOrderParts ?? []).map(p => (
                <div key={p.id} className="flex items-center justify-between border rounded px-3 py-2">
                  <div className="text-sm">
                    {p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : (p.freeText ?? '')}
                    <span className="text-gray-600"> · Qty: {p.qty}</span>
                  </div>
                  <button className="text-sm underline" onClick={() => removePart(p.id)}>Quitar</button>
                </div>
              ))}
              {(data.serviceOrderParts ?? []).length === 0 && <div className="text-sm text-gray-600">Sin repuestos.</div>}
            </div>
          </div>
        )}
      </section>

      {/* Firmas */}
      <section className="border rounded p-4 space-y-4">
        <h2 className="font-semibold">Firmas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignatureCanvas
            label="Firma técnico"
            initialDataUrl={data.technicianSignature ?? null}
            onChange={(sig) => patch(`/service-orders/${id}/signatures`, { technicianSignature: sig })}
          />
          <SignatureCanvas
            label="Firma quien recibe"
            initialDataUrl={data.receiverSignature ?? null}
            onChange={(sig) => patch(`/service-orders/${id}/signatures`, { receiverSignature: sig })}
          />
        </div>
      </section>

      {busy && <div className="text-sm text-gray-600">Guardando...</div>}
    </div>
  );
}
