'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { SignatureCanvas } from '@/components/SignatureCanvas';
import { ServiceOrderImagesGallery } from '@/components/ServiceOrderImagesGallery';
import { ServiceOrderChecklistSection } from '@/components/ServiceOrderChecklistSection';

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

// ---- Fecha/hora helpers (datetime-local) ----
// Evita usar toISOString().slice() porque eso es UTC y desplaza la hora en Colombia.
function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toLocalInput(d: Date) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${y}-${m}-${da}T${h}:${mi}`; // yyyy-MM-ddTHH:mm (local)
}
function isoToLocal(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return toLocalInput(d);
}
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const [date, time] = v.split('T');
  if (!date || !time) return null;
  const [y, mo, da] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const d = new Date(y, (mo ?? 1) - 1, da ?? 1, h ?? 0, mi ?? 0, 0, 0); // local
  return d.toISOString();
}
function nowLocalInputValue() {
  return toLocalInput(new Date());
}

function statusPillClass(status: string) {
  switch ((status || 'OPEN').toUpperCase()) {
    case 'IN_PROGRESS':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'ON_HOLD':
      return 'bg-violet-100 text-violet-900 border-violet-200';
    case 'COMPLETED':
      return 'bg-green-100 text-green-900 border-green-200';
    case 'CANCELED':
      return 'bg-red-100 text-red-900 border-red-200';
    case 'CLOSED':
      return 'bg-gray-100 text-gray-900 border-gray-200';
    case 'OPEN':
    default:
      return 'bg-blue-100 text-blue-900 border-blue-200';
  }
}

type TsKey = 'takenAt' | 'arrivedAt' | 'checkInAt' | 'activityStartedAt' | 'activityFinishedAt' | 'deliveredAt';

const TS_FIELDS: Array<{ key: TsKey; label: string; hint?: string }> = [
  { key: 'takenAt', label: 'Hora toma OS', hint: 'Al registrar este tiempo, la OS pasa a IN_PROGRESS.' },
  { key: 'arrivedAt', label: 'Hora llegada cliente' },
  { key: 'checkInAt', label: 'Hora ingreso' },
  { key: 'activityStartedAt', label: 'Inicio actividad' },
  { key: 'activityFinishedAt', label: 'Fin actividad', hint: 'Al registrar este tiempo, la OS pasa a COMPLETED.' },
  { key: 'deliveredAt', label: 'Hora entrega' },
];

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const { data, error, isLoading, mutate } = useApiSWR<ServiceOrder>(
    id ? `/service-orders/${id}` : null,
    auth.token,
    auth.tenantSlug
  );
  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);

  const [busy, setBusy] = useState(false);
  const [partQ, setPartQ] = useState('');

  // Timestamps controlados (para botón "Ahora")
  const [ts, setTs] = useState<Record<TsKey, string>>({
    takenAt: '',
    arrivedAt: '',
    checkInAt: '',
    activityStartedAt: '',
    activityFinishedAt: '',
    deliveredAt: '',
  });

  useEffect(() => {
    if (!data) return;
    setTs({
      takenAt: isoToLocal(data.takenAt),
      arrivedAt: isoToLocal(data.arrivedAt),
      checkInAt: isoToLocal(data.checkInAt),
      activityStartedAt: isoToLocal(data.activityStartedAt),
      activityFinishedAt: isoToLocal(data.activityFinishedAt),
      deliveredAt: isoToLocal(data.deliveredAt),
    });
  }, [
    data?.id,
    data?.takenAt,
    data?.arrivedAt,
    data?.checkInAt,
    data?.activityStartedAt,
    data?.activityFinishedAt,
    data?.deliveredAt,
  ]);

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

  const tech = data.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;

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
      dueDate: dueLocal ? localInputToIso(dueLocal) : null,
      technicianId: technicianId || undefined,
    });
  }

  async function setTimestamp(key: TsKey, localValue: string) {
    // UI inmediato
    setTs((s) => ({ ...s, [key]: localValue }));

    const iso = localInputToIso(localValue);

    setBusy(true);
    try {
      // 1) guardar timestamp
      await apiFetch(`/service-orders/${id}/timestamps`, {
        method: 'PATCH',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: { [key]: iso },
      });

      // 2) reglas simples de estado (solo las que pediste)
      const currentStatus = (data.status || 'OPEN').toUpperCase();

      if (key === 'takenAt' && iso) {
        // no forzar si ya está finalizada/cancelada/cerrada
        if (!['COMPLETED', 'CLOSED', 'CANCELED'].includes(currentStatus)) {
          await apiFetch(`/service-orders/${id}`, {
            method: 'PATCH',
            token: auth.token!,
            tenantSlug: auth.tenantSlug!,
            body: { status: 'IN_PROGRESS' },
          });
        }
      }

      if (key === 'activityFinishedAt' && iso) {
        if (!['CLOSED', 'CANCELED'].includes(currentStatus)) {
          await apiFetch(`/service-orders/${id}`, {
            method: 'PATCH',
            token: auth.token!,
            tenantSlug: auth.tenantSlug!,
            body: { status: 'COMPLETED' },
          });
        }
      }

      await mutate();
    } finally {
      setBusy(false);
    }
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

  const fd = data.formData ?? {};
  const showChecklist = data.serviceOrderType === 'ALISTAMIENTO' || data.serviceOrderType === 'PREVENTIVO';

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <span className={`px-2 py-1 text-xs border rounded ${statusPillClass(data.status)}`}>{data.status}</span>
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Activo:</span> {data.assetCode} · {data.asset?.name ?? ''}
        </div>
        <div className="text-sm text-gray-700">
          Cliente: {data.asset?.customer ?? '-'} · Marca: {data.asset?.brand ?? '-'} · Modelo: {data.asset?.model ?? '-'} · Serie:{' '}
          {data.asset?.serialNumber ?? '-'}
        </div>
      </div>

      {/* Programación */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Programación</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <div className="text-sm">{data.serviceOrderType ?? '-'}</div>
          </div>
          <div>
            <label className="text-sm font-medium">Estado</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={data.status}
              disabled={busy}
              onChange={(e) => patch(`/service-orders/${id}`, { status: e.target.value })}
            >
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
            <p className="text-xs text-gray-500">El calendario colorea eventos por estado.</p>
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
              {(techs ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Timestamps */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Tiempos (timestamps)</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TS_FIELDS.map(({ key, label, hint }) => (
            <div key={key} className="border rounded p-2">
              <label className="text-sm font-medium">{label}</label>

              <div className="mt-1 flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="border rounded px-3 py-2 w-full"
                  value={ts[key]}
                  onChange={(e) => setTs((s) => ({ ...s, [key]: e.target.value }))}
                  onBlur={(e) => setTimestamp(key, e.target.value)}
                />

                {/* Evitamos doble guardado: click en botón no dispara blur del input */}
                <button
                  type="button"
                  className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
                  disabled={busy}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTimestamp(key, nowLocalInputValue())}
                  title="Registrar hora actual"
                >
                  Ahora
                </button>

                <button
                  type="button"
                  className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
                  disabled={busy || !ts[key]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTimestamp(key, '')}
                  title="Limpiar"
                >
                  ✕
                </button>
              </div>

              {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {/* Formulario técnico */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Formulario técnico</h2>

        {/* Checklist + Observaciones/Resultado para ALISTAMIENTO y PREVENTIVO */}
        {showChecklist ? (
          <ServiceOrderChecklistSection
            soId={data.id}
            soType={(data.serviceOrderType ?? '') as any}
            asset={{ brand: data.asset?.brand, model: data.asset?.model }}
            pmChecklist={data.pmPlan?.checklist}
            initialFormData={data.formData}
            onSaved={() => mutate()}
          />
        ) : (
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
                  {(invMatches ?? []).map((it) => (
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
              {(data.serviceOrderParts ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between border rounded px-3 py-2">
                  <div className="text-sm">
                    {p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? ''}
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

      {/* Galería (miniaturas compactas) - antes de Firmas */}
      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Galería</h2>
        </div>
        <ServiceOrderImagesGallery serviceOrderId={id} />
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
