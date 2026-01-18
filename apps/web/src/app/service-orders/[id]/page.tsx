'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { SignatureCanvas } from '@/components/SignatureCanvas';
import { ServiceOrderImagesGallery } from '@/components/ServiceOrderImagesGallery';
import { ServiceOrderFilesSection } from '@/components/ServiceOrderFilesSection';
import { ServiceOrderChecklistSection } from '@/components/ServiceOrderChecklistSection';
import { AssetSearchSelect } from '@/components/AssetSearchSelect';

type User = { id: string; name: string; email: string; role: string };
type InventoryItem = { id: string; sku: string; name: string; model?: string | null };
type Part = {
  id: string;
  qty: number;
  stage?: 'REQUIRED' | 'REPLACED';
  replacedAt?: string | null;
  replacedByUser?: User | null;
  notes?: string | null;
  freeText?: string | null;
  inventoryItem?: InventoryItem | null;
};

type WorkLog = {
  id: string;
  userId: string;
  startedAt: string;
  endedAt?: string | null;
  note?: string | null;
  source?: string | null;
  user?: User | null;
};


type PmPlan = { id: string; name: string; intervalHours?: number | null; defaultDurationMin?: number | null };

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
  workLogs?: WorkLog[];
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


function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtDuration(startIso?: string | null, endIso?: string | null) {
  if (!startIso) return '-';
  const a = new Date(startIso);
  const b = endIso ? new Date(endIso) : new Date();
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return '-';
  const ms = Math.max(0, b.getTime() - a.getTime());
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m} min`;
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


const TS_ORDER: TsKey[] = ['takenAt', 'arrivedAt', 'checkInAt', 'activityStartedAt', 'activityFinishedAt', 'deliveredAt'];

function parseLocalToDate(v: string): Date | null {
  const iso = localInputToIso(v);
  return iso ? new Date(iso) : null;
}

function validateTsChange(current: Record<TsKey, string>, key: TsKey, nextLocal: string): string | null {
  const next: Record<TsKey, Date | null> = {
    takenAt: current.takenAt ? parseLocalToDate(current.takenAt) : null,
    arrivedAt: current.arrivedAt ? parseLocalToDate(current.arrivedAt) : null,
    checkInAt: current.checkInAt ? parseLocalToDate(current.checkInAt) : null,
    activityStartedAt: current.activityStartedAt ? parseLocalToDate(current.activityStartedAt) : null,
    activityFinishedAt: current.activityFinishedAt ? parseLocalToDate(current.activityFinishedAt) : null,
    deliveredAt: current.deliveredAt ? parseLocalToDate(current.deliveredAt) : null,
  };

  const proposed = nextLocal ? parseLocalToDate(nextLocal) : null;
  next[key] = proposed;

  const idx = TS_ORDER.indexOf(key);

  // Si se intenta borrar, no permitir si hay posteriores registrados
  if (proposed === null) {
    for (const later of TS_ORDER.slice(idx + 1)) {
      if (next[later]) return `No puedes borrar ${key} mientras ${later} esté registrado. Borra primero los timestamps posteriores.`;
    }
    return null;
  }

  // Debe existir el anterior
  if (idx > 0) {
    const prevK = TS_ORDER[idx - 1];
    const prev = next[prevK];
    if (!prev) return `Debes registrar ${prevK} antes de registrar/modificar ${key}.`;
    if (proposed.getTime() < prev.getTime()) return `${key} no puede ser más temprano que ${prevK}.`;
  }

  // Consistencia global (por si editaste un timestamp anterior)
  for (let i = 1; i < TS_ORDER.length; i++) {
    const a = next[TS_ORDER[i - 1]];
    const b = next[TS_ORDER[i]];
    if (b && !a) return `Debes registrar ${TS_ORDER[i - 1]} antes de ${TS_ORDER[i]}.`;
    if (a && b && b.getTime() < a.getTime()) return `${TS_ORDER[i]} no puede ser más temprano que ${TS_ORDER[i - 1]}.`;
  }

  return null;
}

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const { data, error, isLoading, mutate } = useApiSWR<ServiceOrder>(
    id ? `/service-orders/${id}` : null,
    auth.token,
    auth.tenantSlug
  );
  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);
  const { data: pmPlans } = useApiSWR<PmPlan[]>(`/pm-plans`, auth.token, auth.tenantSlug);

  const [busy, setBusy] = useState(false);
  const [uiErr, setUiErr] = useState<string>('');
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('OPEN');
  const [editType, setEditType] = useState<string>('');
  const [editAssetCode, setEditAssetCode] = useState('');
  const [editPmPlanId, setEditPmPlanId] = useState('');
  const [partQ, setPartQ] = useState('');
  const [partQty, setPartQty] = useState<number>(1);

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

  
// Inicializa campos de edición (ADMIN) sin pisar cambios mientras editas
useEffect(() => {
  if (!data) return;
  if (editMode) return;
  setEditTitle(data.title || '');
  setEditDescription(data.description ?? '');
  setEditStatus(String(data.status || 'OPEN'));
  setEditType(String(data.serviceOrderType || ''));
  setEditAssetCode(String(data.assetCode || ''));
              setEditPmPlanId(String(data.pmPlan?.id || ''));
  setEditPmPlanId(String(data.pmPlan?.id || ''));
}, [data?.id, editMode]);

// Si vienes con #edit desde el listado, abre el panel
useEffect(() => {
  if (typeof window === 'undefined') return;
  if (window.location.hash === '#edit') {
    setEditMode(true);
    setTimeout(() => document.getElementById('edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }
}, []);
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

const myUserId = (session as any)?.user?.id as string | undefined;
const isAssignedTech = !!myUserId && (data.assignments ?? []).some((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE' && a.userId === myUserId);
const canChangeStatus = isAdmin || (role === 'TECH' && isAssignedTech);


  async function patch(path: string, body: any) {
    setBusy(true);
    setUiErr('');
              if (editType === 'PREVENTIVO' && !editPmPlanId) {
                setUiErr('Debes seleccionar un PM Plan para órdenes PREVENTIVO.');
                setBusy(false);
                return;
              }
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
  const msg = validateTsChange(ts, key, localValue);
  if (msg) {
    setUiErr(msg);
    // revert a valor del backend
    setTs((s) => ({ ...s, [key]: isoToLocal((data as any)[key]) }));
    return;
  }

  setTs((s) => ({ ...s, [key]: localValue }));
  const iso = localInputToIso(localValue); // '' => null (borrar)

  setBusy(true);
  setUiErr('');
  try {
    // Backend aplica validaciones + cambios de estado automáticamente
    await apiFetch(`/service-orders/${id}/timestamps`, {
      method: 'PATCH',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: { [key]: iso },
    });

    await mutate();
  } catch (e: any) {
    setUiErr(e?.message ?? 'Error guardando tiempo');
    await mutate(); // resync
    throw e;
  } finally {
    setBusy(false);
  }
}


  async function addPart(item?: InventoryItem) {
    const qty = Number(partQty ?? 1);
    if (!isFinite(qty) || qty <= 0) {
      setUiErr('La cantidad debe ser mayor a 0');
      return;
    }
    await apiFetch(`/service-orders/${id}/parts`, {
      method: 'POST',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: item ? { inventoryItemId: item.id, qty } : { freeText: partQ.trim(), qty },
    });
    setPartQ('');
    setPartQty(1);
    mutate();
  }

  async function markPartReplaced(part: Part) {
    if (!canChangeStatus) {
      setUiErr('No tienes permisos para marcar repuestos como cambiados');
      return;
    }
    const max = Number(part.qty ?? 0);
    if (!isFinite(max) || max <= 0) return;

    const raw = window.prompt(`Cantidad a marcar como cambiada (max ${max}):`, String(max));
    if (raw === null) return;
    const qtyReplaced = Number(raw);
    if (!isFinite(qtyReplaced) || qtyReplaced <= 0 || qtyReplaced > max) {
      setUiErr('Cantidad inválida');
      return;
    }

    setBusy(true);
    setUiErr('');
    try {
      await apiFetch(`/service-orders/${id}/parts/${part.id}/mark-replaced`, {
        method: 'PATCH',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: { qtyReplaced },
      });
      await mutate();
    } catch (e: any) {
      setUiErr(e?.message ?? 'Error marcando repuesto como cambiado');
    } finally {
      setBusy(false);
    }
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
  const requiredParts = (data.serviceOrderParts ?? []).filter((p) => (p as any).stage !== 'REPLACED');
  const replacedParts = (data.serviceOrderParts ?? []).filter((p) => (p as any).stage === 'REPLACED');

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      {uiErr ? (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{uiErr}</div>
      ) : null}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-semibold">{data.title}</h1>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                className="px-3 py-2 border rounded text-sm"
                onClick={() => setEditMode((v) => !v)}
              >
                {editMode ? 'Cerrar edición' : 'Editar'}
              </button>
            ) : null}
            <span className={`px-2 py-1 text-xs border rounded ${statusPillClass(data.status)}`}>{data.status}</span>
          </div>
        </div>
        <div className="text-sm text-gray-700">
          <span className="font-medium">Activo:</span> {data.assetCode} · {data.asset?.name ?? ''}
        </div>
        <div className="text-sm text-gray-700">
          Cliente: {data.asset?.customer ?? '-'} · Marca: {data.asset?.brand ?? '-'} · Modelo: {data.asset?.model ?? '-'} · Serie:{' '}
          {data.asset?.serialNumber ?? '-'}
        </div>
      </div>
{/* Edición OS (ADMIN) */}
{isAdmin ? (
  <section id="edit-panel" className="border rounded p-4 space-y-3">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <h2 className="font-semibold">Edición (ADMIN)</h2>
      <button
        type="button"
        className="px-3 py-2 border rounded text-sm"
        onClick={() => setEditMode((v) => !v)}
      >
        {editMode ? 'Cerrar' : 'Editar'}
      </button>
    </div>

    {editMode ? (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Activo</label>
            <AssetSearchSelect value={editAssetCode} onChange={(code) => setEditAssetCode(code)} />
            <p className="text-xs text-gray-500">Busca por serial/cliente/nombre y asigna el activo a la OS.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Estado</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            >
              <option value="OPEN">OPEN</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="ON_HOLD">ON_HOLD</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Tipo OS</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={editType}
              onChange={(e) => setEditType(e.target.value)}
            >
              <option value="">(sin tipo)</option>
              <option value="ALISTAMIENTO">ALISTAMIENTO</option>
              <option value="DIAGNOSTICO">DIAGNOSTICO</option>
              <option value="PREVENTIVO">PREVENTIVO</option>
              <option value="CORRECTIVO">CORRECTIVO</option>
              <option value="ENTREGA">ENTREGA</option>
              <option value="OTRO">OTRO</option>
            </select>
          </div>
{editType === 'PREVENTIVO' ? (
  <div className="space-y-1">
    <label className="text-sm font-medium">Plan preventivo (PM Plan)</label>
    <select
      className="border rounded px-3 py-2 w-full"
      value={editPmPlanId}
      onChange={(e) => setEditPmPlanId(e.target.value)}
    >
      <option value="">(seleccionar)</option>
      {(pmPlans ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.intervalHours ? `PM ${p.intervalHours}h` : p.name}
        </option>
      ))}
    </select>
    <p className="text-xs text-gray-500">Obligatorio para órdenes PREVENTIVO.</p>
  </div>
) : null}

          <div className="space-y-1">
            <label className="text-sm font-medium">Título</label>
            <input
              className="border rounded px-3 py-2 w-full"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Descripción</label>
          <textarea
            className="border rounded px-3 py-2 w-full"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 border rounded bg-black text-white text-sm disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setUiErr('');
              try {
                await apiFetch(`/service-orders/${id}`, {
                  method: 'PATCH',
                  token: auth.token!,
                  tenantSlug: auth.tenantSlug!,
                  body: {
                    assetCode: editAssetCode || undefined,
                    title: editTitle || undefined,
                    description: editDescription,
                    status: editStatus || undefined,
                    serviceOrderType: editType || undefined,
                    pmPlanId: editType === 'PREVENTIVO' ? (editPmPlanId || null) : null,
},
                });
                await mutate();
                setEditMode(false);
              } catch (e: any) {
                setUiErr(e?.message ?? 'Error guardando edición');
              } finally {
                setBusy(false);
              }
            }}
          >
            Guardar cambios
          </button>

          <button
            type="button"
            className="px-3 py-2 border rounded text-sm"
            disabled={busy}
            onClick={() => {
              setEditMode(false);
              setEditTitle(data.title || '');
              setEditDescription(data.description ?? '');
              setEditStatus(String(data.status || 'OPEN'));
              setEditType(String(data.serviceOrderType || ''));
              setEditAssetCode(String(data.assetCode || ''));
              setEditPmPlanId(String(data.pmPlan?.id || ''));
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    ) : (
      <p className="text-sm text-gray-600">Activa “Editar” para modificar campos de la orden.</p>
    )}
  </section>
) : null}


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

{/* WorkLogs */}
<section className="border rounded p-4 space-y-3">
  <h2 className="font-semibold">Work Logs (tiempos por técnico)</h2>

  {(data.workLogs ?? []).length > 0 ? (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Técnico</th>
            <th className="py-2 pr-4">Inicio</th>
            <th className="py-2 pr-4">Fin</th>
            <th className="py-2 pr-4">Duración</th>
          </tr>
        </thead>
        <tbody>
          {(data.workLogs ?? []).map((wl) => (
            <tr key={wl.id} className="border-b last:border-b-0">
              <td className="py-2 pr-4">{wl.user?.name ?? wl.userId}</td>
              <td className="py-2 pr-4">{fmtDateTime(wl.startedAt)}</td>
              <td className="py-2 pr-4">
                {wl.endedAt ? fmtDateTime(wl.endedAt) : <span className="text-amber-700">En curso</span>}
              </td>
              <td className="py-2 pr-4">{fmtDuration(wl.startedAt, wl.endedAt ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="text-sm text-gray-600">Sin registros todavía.</div>
  )}
</section>
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
	              <div className="flex gap-2 items-center">
	                <input
	                  className="border rounded px-3 py-2 w-full"
	                  value={partQ}
	                  onChange={(e) => setPartQ(e.target.value)}
	                  placeholder="Ej: SKF 6204 / filtro / etc."
	                />
	                <input
	                  type="number"
	                  min={1}
	                  step={1}
	                  className="border rounded px-3 py-2 w-28"
	                  value={String(partQty)}
	                  onChange={(e) => setPartQty(Number(e.target.value))}
	                  title="Cantidad"
	                />
	              </div>
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
	              <div className="text-sm font-medium">Repuestos necesarios (diagnóstico)</div>
	              {requiredParts.map((p) => (
	                <div key={p.id} className="flex items-center justify-between border rounded px-3 py-2">
	                  <div className="text-sm">
	                    {p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? ''}
	                    <span className="text-gray-600"> · Qty: {p.qty}</span>
	                  </div>
	                  <div className="flex items-center gap-3">
	                    {(canChangeStatus) ? (
	                      <button className="text-sm underline" onClick={() => markPartReplaced(p)}>Marcar como cambiado</button>
	                    ) : null}
	                    <button className="text-sm underline" onClick={() => removePart(p.id)}>Quitar</button>
	                  </div>
	                </div>
	              ))}
	              {requiredParts.length === 0 && <div className="text-sm text-gray-600">Sin repuestos necesarios.</div>}
	            </div>

	            <div className="space-y-2">
	              <div className="text-sm font-medium">Repuestos cambiados (historial)</div>
	              {replacedParts.map((p) => (
	                <div key={p.id} className="flex items-center justify-between border rounded px-3 py-2">
	                  <div className="text-sm">
	                    {p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? ''}
	                    <span className="text-gray-600"> · Qty: {p.qty}</span>
	                    {p.replacedAt ? <span className="text-gray-600"> · {String(p.replacedAt).slice(0, 10)}</span> : null}
	                  </div>
	                  {isAdmin ? <button className="text-sm underline" onClick={() => removePart(p.id)}>Quitar</button> : null}
	                </div>
	              ))}
	              {replacedParts.length === 0 && <div className="text-sm text-gray-600">Sin repuestos cambiados.</div>}
	            </div>
          </div>
        )}
      </section>

      {/* Adjuntos adicionales */}
      <ServiceOrderFilesSection serviceOrderId={id} type="VIDEO" title="Videos" />
      <ServiceOrderFilesSection serviceOrderId={id} type="DOCUMENT" title="Documentos" />

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