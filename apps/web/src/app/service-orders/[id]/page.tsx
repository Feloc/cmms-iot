'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiBase, apiFetch } from '@/lib/api';
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

type CommercialNote = {
  id: string;
  commercialStatus?: CommercialStatus | null;
  comment: string;
  eventAt?: string | null;
  addedByUserId?: string | null;
  createdAt?: string | null;
  user?: User | null;
};

type AuditEntry = {
  at: string;
  byUserId: string;
  field: string;
  part?: string | null;
  from?: any;
  to?: any;
  user?: User | null;
};

type WorkOrderReportRow = {
  id: string;
  audience: 'CUSTOMER' | 'INTERNAL';
  version: number;
  createdAt: string;
  createdByUserId?: string;
};



type OpenWorkLogElsewhere = {
  workOrderId: string;
  workOrderTitle?: string | null;
  workLogId: string;
  startedAt: string;
};

type PmPlan = { id: string; name: string; intervalHours?: number | null; defaultDurationMin?: number | null };
type HourmeterReading = {
  id: string;
  reading: number;
  readingAt?: string | null;
  phase?: 'BEFORE' | 'AFTER' | 'OTHER' | string | null;
  source?: string | null;
  note?: string | null;
  deltaFromPrevious?: number | null;
  workOrderId?: string | null;
  createdAt?: string | null;
  createdByUser?: User | null;
};
type HourmeterResponse = {
  serviceOrder: { id: string; status: string; serviceOrderType?: string | null };
  asset: { id: string; code: string; name?: string | null };
  latest?: HourmeterReading | null;
  byOrder?: HourmeterReading[];
  recent?: HourmeterReading[];
};
type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'RESOLVED' | 'VERIFIED' | 'CANCELED';
type ServiceOrderIssueTracking = {
  id: string;
  status: IssueStatus;
  openedAt?: string | null;
  openedByUserId?: string | null;
  openedByUser?: User | null;
  ownerUserId?: string | null;
  ownerUser?: User | null;
  targetResolutionAt?: string | null;
  lastFollowUpAt?: string | null;
  followUpNote?: string | null;
  resolutionSummary?: string | null;
  resolutionWorkOrderId?: string | null;
  resolutionWorkOrder?: { id: string; title?: string | null; status?: string | null; serviceOrderType?: string | null; dueDate?: string | null } | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
  resolvedByUser?: User | null;
  verifiedAt?: string | null;
  verifiedByUserId?: string | null;
  verifiedByUser?: User | null;
  verificationNotes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isUnresolved?: boolean;
  isClosed?: boolean;
};
type IssueResponse = {
  workOrder: { id: string; hasIssue: boolean; status?: string | null; serviceOrderType?: string | null };
  issue?: ServiceOrderIssueTracking | null;
};
type QuoteSummary = {
  id: string;
  version: number;
  status?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  total?: number | null;
  createdAt?: string | null;
  createdByUserId?: string | null;
  missingPriceItems?: number | null;
};
type QuotesResponse = {
  items: QuoteSummary[];
};
type CommercialStatus =
  | 'NO_MANAGEMENT'
  | 'PENDING_QUOTE'
  | 'PENDING_APPROVAL'
  | 'NOT_APPROVED'
  | 'APPROVED'
  | 'PROGRAMMED'
  | 'CONFIRMED'
  | 'COMPLETED';

type ServiceOrder = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  serviceOrderType?: string | null;
  commercialStatus?: CommercialStatus | null;
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
  serviceOrderIssue?: ServiceOrderIssueTracking | null;
  _meta?: { openWorkLogElsewhere?: OpenWorkLogElsewhere | null };
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

function commercialStatusMeta(status?: string | null) {
  switch (String(status || '').toUpperCase()) {
    case 'NO_MANAGEMENT':
      return { code: 'NG', label: 'No gestión', className: 'bg-slate-100 text-slate-900 border-slate-200' };
    case 'PENDING_QUOTE':
      return { code: 'PC', label: 'Pendiente cotizar', className: 'bg-orange-100 text-orange-900 border-orange-200' };
    case 'PENDING_APPROVAL':
      return { code: 'PA', label: 'Pendiente aprobación', className: 'bg-amber-100 text-amber-900 border-amber-200' };
    case 'NOT_APPROVED':
      return { code: 'NA', label: 'No aprobado', className: 'bg-rose-100 text-rose-900 border-rose-200' };
    case 'APPROVED':
      return { code: 'AP', label: 'Aprobado', className: 'bg-sky-100 text-sky-900 border-sky-200' };
    case 'PROGRAMMED':
      return { code: 'PR', label: 'Programado', className: 'bg-violet-100 text-violet-900 border-violet-200' };
    case 'CONFIRMED':
      return { code: 'CF', label: 'Confirmado', className: 'bg-emerald-100 text-emerald-900 border-emerald-200' };
    case 'COMPLETED':
      return { code: 'CP', label: 'Completado', className: 'bg-green-100 text-green-900 border-green-200' };
    default:
      return null;
  }
}

type TsKey = 'takenAt' | 'arrivedAt' | 'checkInAt' | 'activityStartedAt' | 'activityFinishedAt' | 'deliveredAt';
type VisitMode = 'PRIMARY' | 'FOLLOW_UP';

const TS_FIELDS: Array<{ key: TsKey; label: string; hint?: string }> = [
  { key: 'takenAt', label: 'Hora toma OS', hint: 'Al registrar este tiempo, la OS pasa a IN_PROGRESS.' },
  { key: 'arrivedAt', label: 'Hora llegada cliente' },
  { key: 'checkInAt', label: 'Hora ingreso' },
  { key: 'activityStartedAt', label: 'Inicio actividad' },
  { key: 'activityFinishedAt', label: 'Fin actividad', hint: 'Al registrar este tiempo, la OS pasa a COMPLETED.' },
  { key: 'deliveredAt', label: 'Hora entrega' },
];


const TS_ORDER: TsKey[] = ['takenAt', 'arrivedAt', 'checkInAt', 'activityStartedAt', 'activityFinishedAt', 'deliveredAt'];

function getVisitModeFromFormData(formData: any): VisitMode {
  const raw = String(formData?.visitMode ?? '').trim().toUpperCase();
  return raw === 'FOLLOW_UP' ? 'FOLLOW_UP' : 'PRIMARY';
}

function parseLocalToDate(v: string): Date | null {
  const iso = localInputToIso(v);
  return iso ? new Date(iso) : null;
}

function validateTsChange(
  current: Record<TsKey, string>,
  key: TsKey,
  nextLocal: string,
  visitMode: VisitMode,
): string | null {
  const allowMissingPrelude = visitMode === 'FOLLOW_UP';
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
      if (allowMissingPrelude && key === 'checkInAt' && later === 'activityStartedAt') continue;
      if (next[later]) return `No puedes borrar ${key} mientras ${later} esté registrado. Borra primero los timestamps posteriores.`;
    }
    return null;
  }

  // Debe existir el anterior
  if (idx > 0) {
    const prevK = TS_ORDER[idx - 1];
    const prev = next[prevK];
    const canSkipPrev = allowMissingPrelude && key === 'activityStartedAt';
    if (!prev && !canSkipPrev) return `Debes registrar ${prevK} antes de registrar/modificar ${key}.`;
    if (prev && proposed.getTime() < prev.getTime()) return `${key} no puede ser más temprano que ${prevK}.`;
  }

  // Consistencia global (por si editaste un timestamp anterior)
  for (let i = 1; i < TS_ORDER.length; i++) {
    const prevK = TS_ORDER[i - 1];
    const currK = TS_ORDER[i];
    const a = next[prevK];
    const b = next[currK];
    const canSkipPrev = allowMissingPrelude && currK === 'activityStartedAt';
    if (b && !a && !canSkipPrev) return `Debes registrar ${prevK} antes de ${currK}.`;
    if (a && b && b.getTime() < a.getTime()) return `${currK} no puede ser más temprano que ${prevK}.`;
  }

  return null;
}

export default function ServiceOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';
  const isTech = role === 'TECH';
  const currentUserId = (session as any)?.user?.id as string | undefined;

  const [busy, setBusy] = useState(false);
  const [uiErr, setUiErr] = useState<string>('');
  const [uiInfo, setUiInfo] = useState<string>('');
  const [openElsewhere, setOpenElsewhere] = useState<OpenWorkLogElsewhere | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('OPEN');
  const [editCommercialStatus, setEditCommercialStatus] = useState('');
  const [editType, setEditType] = useState<string>('');
  const [editAssetCode, setEditAssetCode] = useState('');
  const [editPmPlanId, setEditPmPlanId] = useState('');
  const [editingWorkLogId, setEditingWorkLogId] = useState<string | null>(null);
  const [workLogDraft, setWorkLogDraft] = useState<{ startedAt: string; endedAt: string }>({ startedAt: '', endedAt: '' });
  const [partQ, setPartQ] = useState('');
  const [partQty, setPartQty] = useState<number>(1);
  const [hourmeterReading, setHourmeterReading] = useState<string>('');
  const [hourmeterPhase, setHourmeterPhase] = useState<'BEFORE' | 'AFTER' | 'OTHER'>('OTHER');
  const [hourmeterNote, setHourmeterNote] = useState<string>('');
  const [hourmeterAllowDecrease, setHourmeterAllowDecrease] = useState(false);
  const [issueStatus, setIssueStatus] = useState<IssueStatus>('OPEN');
  const [issueOwnerUserId, setIssueOwnerUserId] = useState<string>('');
  const [issueTargetResolutionAt, setIssueTargetResolutionAt] = useState<string>('');
  const [issueFollowUpNote, setIssueFollowUpNote] = useState<string>('');
  const [issueResolutionSummary, setIssueResolutionSummary] = useState<string>('');
  const [issueVerificationNotes, setIssueVerificationNotes] = useState<string>('');
  const [commercialNoteAt, setCommercialNoteAt] = useState<string>(nowLocalInputValue());
  const [commercialNoteComment, setCommercialNoteComment] = useState<string>('');
  const [commercialNoteBusy, setCommercialNoteBusy] = useState(false);

  const { data, error, isLoading, mutate } = useApiSWR<ServiceOrder>(
    id ? `/service-orders/${id}` : null,
    auth.token,
    auth.tenantSlug
  );
  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);
  const { data: pmPlans } = useApiSWR<PmPlan[]>(`/pm-plans`, auth.token, auth.tenantSlug);
  const { data: hourmeterData, mutate: mutateHourmeter } = useApiSWR<HourmeterResponse>(
    id ? `/service-orders/${id}/hourmeter?limit=30` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: issueData, mutate: mutateIssue } = useApiSWR<IssueResponse>(
    id && isAdmin ? `/service-orders/${id}/issue` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: quotesData, mutate: mutateQuotes } = useApiSWR<QuotesResponse>(
    id && isAdmin ? `/service-orders/${id}/quotes` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: reportsData, mutate: mutateReports } = useApiSWR<{ items: WorkOrderReportRow[] }>(
    id ? `/service-orders/${id}/reports` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: commercialNotesData, mutate: mutateCommercialNotes } = useApiSWR<CommercialNote[]>(
    id ? `/service-orders/${id}/commercial-notes` : null,
    auth.token,
    auth.tenantSlug,
  );

  useEffect(() => {
    const ow = (data as any)?._meta?.openWorkLogElsewhere as OpenWorkLogElsewhere | null | undefined;
    if (ow && ow.workOrderId && ow.workOrderId !== id) setOpenElsewhere(ow);
    else setOpenElsewhere(null);
  }, [
    id,
    (data as any)?._meta?.openWorkLogElsewhere?.workOrderId,
    (data as any)?._meta?.openWorkLogElsewhere?.workLogId,
  ]);

  useEffect(() => {
    setCommercialNoteAt(nowLocalInputValue());
    setCommercialNoteComment('');
  }, [id]);

  useEffect(() => {
    if (!isAdmin) return;
    const issue = issueData?.issue;
    if (!issue) {
      setIssueStatus((data?.hasIssue ? 'OPEN' : 'RESOLVED') as IssueStatus);
      setIssueOwnerUserId('');
      setIssueTargetResolutionAt('');
      setIssueFollowUpNote('');
      setIssueResolutionSummary('');
      setIssueVerificationNotes('');
      return;
    }
    setIssueStatus((String(issue.status || 'OPEN').toUpperCase() as IssueStatus) || 'OPEN');
    setIssueOwnerUserId(String(issue.ownerUserId || ''));
    setIssueTargetResolutionAt(isoToLocal(issue.targetResolutionAt));
    setIssueFollowUpNote(String(issue.followUpNote || ''));
    setIssueResolutionSummary(String(issue.resolutionSummary || ''));
    setIssueVerificationNotes(String(issue.verificationNotes || ''));
  }, [isAdmin, issueData?.issue?.id, issueData?.issue?.updatedAt, data?.hasIssue]);

  const techBlocked = isTech && !!openElsewhere?.workOrderId && openElsewhere.workOrderId !== id;

  const statusUpper = (data?.status ?? 'OPEN').toUpperCase();
  const isClosedStatus = ['COMPLETED', 'CLOSED', 'CANCELED'].includes(statusUpper);

  const myOpenLog = useMemo(() => {
    if (!currentUserId) return null;
    const logs = data?.workLogs ?? [];
    return logs.find((w) => w.userId === currentUserId && !w.endedAt) ?? null;
  }, [data?.workLogs, currentUserId]);

  const auditTrail = useMemo(() => {
    const fd = (data?.formData ?? {}) as any;
    const raw = Array.isArray(fd?._audit) ? (fd._audit as AuditEntry[]) : [];
    // Mostrar los últimos 8 (más recientes primero)
    return raw.slice(-8).reverse();
  }, [data?.formData]);

  function parseApiError(e: any): { status?: number; message: string; payload?: any } {
    const raw = String(e?.message ?? e ?? '');
    const m = raw.match(/->\s(\d{3})\s([\s\S]+)$/);
    if (!m) return { message: raw || 'Error' };
    const status = Number(m[1]);
    const tail = m[2];
    try {
      const j = JSON.parse(tail);
      const msg = Array.isArray(j?.message) ? j.message.join('\n') : (j?.message ?? tail);
      return { status, message: String(msg), payload: j };
    } catch {
      return { status, message: tail };
    }
  }


function applyWorkLogBlockIfPresent(parsed: { status?: number; message: string; payload?: any }) {
  if (parsed.status !== 409) return false;
  const p = parsed.payload;
  if (p?.code !== 'WORKLOG_OPEN_OTHER_OS') return false;
  const ow = p?.openWorkLog as OpenWorkLogElsewhere | undefined;
  if (ow?.workOrderId) setOpenElsewhere(ow);
  setUiInfo(String(p?.message ?? parsed.message));
  return true;
}

  async function startMyWorkLog() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setUiErr('');
    setUiInfo('');
    setBusy(true);
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/worklogs/start`, {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      if (resp?._info) setUiInfo(String(resp._info));
      await mutate();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeWorkLog(workLogId: string) {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setUiErr('');
    setUiInfo('');
    setBusy(true);
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/worklogs/${workLogId}/close`, {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      if (resp?._info) setUiInfo(String(resp._info));
      await mutate();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message);
    } finally {
      setBusy(false);
    }
  }

  function beginEditWorkLog(wl: WorkLog) {
    if (!isAdmin) return;
    setUiErr('');
    setUiInfo('');
    setEditingWorkLogId(wl.id);
    setWorkLogDraft({
      startedAt: isoToLocal(wl.startedAt),
      endedAt: isoToLocal(wl.endedAt),
    });
  }

  function cancelEditWorkLog() {
    setEditingWorkLogId(null);
    setWorkLogDraft({ startedAt: '', endedAt: '' });
  }

  async function saveWorkLogEdit(workLogId: string) {
    if (!isAdmin || !id || !auth.token || !auth.tenantSlug) return;

    const startedAtIso = localInputToIso(workLogDraft.startedAt);
    const endedAtIso = workLogDraft.endedAt ? localInputToIso(workLogDraft.endedAt) : null;

    if (!startedAtIso) {
      setUiErr('Debes indicar una fecha/hora de inicio válida.');
      return;
    }
    if (workLogDraft.endedAt && !endedAtIso) {
      setUiErr('La fecha/hora de fin no es válida.');
      return;
    }
    if (endedAtIso && new Date(endedAtIso).getTime() < new Date(startedAtIso).getTime()) {
      setUiErr('La fecha/hora de fin no puede ser anterior al inicio.');
      return;
    }

    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/worklogs/${workLogId}`, {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          startedAt: startedAtIso,
          endedAt: endedAtIso,
        },
      });
      if (resp?._info) setUiInfo(String(resp._info));
      await mutate();
      cancelEditWorkLog();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error actualizando WorkLog');
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkLog(workLogId: string) {
    if (!isAdmin || !id || !auth.token || !auth.tenantSlug) return;

    const ok = window.confirm('¿Eliminar este WorkLog? Esta acción no se puede deshacer.');
    if (!ok) return;

    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/worklogs/${workLogId}`, {
        method: 'DELETE',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });
      if (resp?._info) setUiInfo(String(resp._info));
      await mutate();
      if (editingWorkLogId === workLogId) cancelEditWorkLog();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error eliminando WorkLog');
    } finally {
      setBusy(false);
    }
  }

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
  setEditCommercialStatus(String(data.commercialStatus || ''));
  setEditType(String(data.serviceOrderType || ''));
  setEditAssetCode(String(data.assetCode || ''));
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
    if (!isAdmin && !isTech) return null;
    const q = partQ.trim();
    if (!q) return null;
    const qs = new URLSearchParams({ q });
    return `/inventory/search?${qs.toString()}`;
  }, [partQ, isAdmin, isTech]);
  const { data: invMatches } = useApiSWR<InventoryItem[]>(invPath, auth.token, auth.tenantSlug);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {(error as any).message}</div>;
  if (!data) return <div className="p-6">No encontrado.</div>;

  const tech = data.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;

const myUserId = (session as any)?.user?.id as string | undefined;
const isAssignedTech = !!myUserId && (data.assignments ?? []).some((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE' && a.userId === myUserId);
const canChangeStatus = isAdmin || (role === 'TECH' && isAssignedTech);
  const commercialMeta = commercialStatusMeta(data.commercialStatus);
  const canEditCommercialStatus = isAdmin && !['OPEN', 'CANCELED'].includes(String(data.status || '').toUpperCase());
  const commercialNotes = commercialNotesData ?? [];

  const canGenerateReport = ['COMPLETED', 'CLOSED'].includes(String(data.status || '').toUpperCase());
  const reports = (reportsData?.items ?? []) as WorkOrderReportRow[];

  function audienceLabel(aud: WorkOrderReportRow['audience']) {
    return aud === 'CUSTOMER' ? 'Cliente' : 'Interno';
  }

  async function generateReport(audience: WorkOrderReportRow['audience']) {
    if (!canGenerateReport) {
      setUiErr('Solo puedes generar el resumen cuando la OS está COMPLETED o CLOSED.');
      return;
    }
    setBusy(true);
    setUiErr('');
    try {
      const created = await apiFetch<{ id: string }>(`/service-orders/${id}/reports`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: { audience },
      });
      await mutateReports();
      if (created?.id) {
        if (audience === 'CUSTOMER') {
          await downloadReportPdf(created.id);
        } else {
          window.open(`/service-orders/${id}/reports/${created.id}`, '_blank');
        }
      }
    } catch (e: any) {
      setUiErr(e?.message ?? 'No se pudo generar/descargar el reporte');
    } finally {
      setBusy(false);
    }
  }

  async function downloadReportPdf(reportId: string) {
    if (!auth.token || !auth.tenantSlug) {
      setUiErr('No hay credenciales disponibles. Inicia sesión.');
      return;
    }
    setUiErr('');
    const url = `${apiBase}/service-orders/${id}/reports/${reportId}/pdf`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'x-tenant': auth.tenantSlug,
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`No se pudo descargar PDF (${res.status}) ${text}`);
    }

    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const m = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
    const filename = m?.[1] ? decodeURIComponent(m[1].replace(/\"/g, '').trim()) : `reporte-os-${id}-${reportId}.pdf`;

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  }


  async function patch(path: string, body: any) {
    if (techBlocked) {
      setUiErr('');
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setBusy(true);
    setUiErr('');
    setUiInfo('');

    // Validación (solo cuando el patch incluye PREVENTIVO en el payload)
    if (body && body.serviceOrderType === 'PREVENTIVO' && !body.pmPlanId) {
      setUiErr('Debes seleccionar un PM Plan para órdenes PREVENTIVO.');
      setBusy(false);
      return;
    }

    try {
      const resp: any = await apiFetch(path, {
        method: 'PATCH',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body,
      });
      if (resp?._info) setUiInfo(String(resp._info));
      await mutate();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message);
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

  async function addCommercialNote() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    const comment = commercialNoteComment.trim();
    if (!comment) {
      setUiErr('Debes escribir un comentario para el seguimiento comercial.');
      return;
    }

    const eventAtIso = commercialNoteAt ? localInputToIso(commercialNoteAt) : null;
    if (commercialNoteAt && !eventAtIso) {
      setUiErr('La fecha del seguimiento comercial no es válida.');
      return;
    }

    setCommercialNoteBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      await apiFetch(`/service-orders/${id}/commercial-notes`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: { eventAt: eventAtIso || undefined, comment },
      });
      setCommercialNoteAt(nowLocalInputValue());
      setCommercialNoteComment('');
      await mutateCommercialNotes();
      await mutate();
    } catch (e: any) {
      setUiErr(e?.message ?? 'Error agregando seguimiento comercial');
    } finally {
      setCommercialNoteBusy(false);
    }
  }

  async function removeCommercialNote(noteId: string) {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (!confirm('¿Eliminar este seguimiento comercial?')) return;

    setCommercialNoteBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      await apiFetch(`/service-orders/${id}/commercial-notes/${noteId}`, {
        method: 'DELETE',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
      });
      await mutateCommercialNotes();
    } catch (e: any) {
      setUiErr(e?.message ?? 'Error eliminando seguimiento comercial');
    } finally {
      setCommercialNoteBusy(false);
    }
  }

  async function setVisitMode(mode: VisitMode) {
    if (!id || !auth.token || !auth.tenantSlug || !data) return;
    const currentFd = data.formData && typeof data.formData === 'object' ? (data.formData as any) : {};
    const currentMode = getVisitModeFromFormData(currentFd);
    if (currentMode === mode) return;

    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }

    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      await apiFetch(`/service-orders/${id}/form`, {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: { formData: { ...currentFd, visitMode: mode } },
      });

      // En FOLLOW_UP dejamos explícitamente vacíos los tiempos previos al inicio de actividad.
      if (mode === 'FOLLOW_UP') {
        await apiFetch(`/service-orders/${id}/timestamps`, {
          method: 'PATCH',
          token: auth.token,
          tenantSlug: auth.tenantSlug,
          body: { takenAt: null, arrivedAt: null, checkInAt: null },
        });
      }

      await mutate();
      if (mode === 'FOLLOW_UP') {
        setUiInfo('OS marcada como subsecuente en la visita. Se omiten toma/llegada/ingreso.');
      } else {
        setUiInfo('OS marcada como primera de visita. Se habilita la secuencia completa de timestamps.');
      }
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error actualizando modo de visita');
      await mutate();
    } finally {
      setBusy(false);
    }
  }

async function setTimestamp(key: TsKey, localValue: string) {
  const visitMode = getVisitModeFromFormData((data as any)?.formData);
  const msg = validateTsChange(ts, key, localValue, visitMode);
  if (msg) {
    setUiErr(msg);
    // revert a valor del backend
    setTs((s) => ({ ...s, [key]: isoToLocal((data as any)[key]) }));
    return;
  }

  if (techBlocked) {
    setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
    // revert a valor del backend
    setTs((s) => ({ ...s, [key]: isoToLocal((data as any)[key]) }));
    return;
  }

  setTs((s) => ({ ...s, [key]: localValue }));
  const iso = localInputToIso(localValue); // '' => null (borrar)

  setBusy(true);
  setUiErr('');
  setUiInfo('');
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
    const parsed = parseApiError(e);
    if (applyWorkLogBlockIfPresent(parsed)) return;
    if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
    else setUiErr(parsed.message || 'Error guardando tiempo');
    await mutate(); // resync
  } finally {
    setBusy(false);
  }
}


  async function addPart(item?: InventoryItem) {
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    const qty = Number(partQty ?? 1);
    if (!isFinite(qty) || qty <= 0) {
      setUiErr('La cantidad debe ser mayor a 0');
      return;
    }
    try {
  await apiFetch(`/service-orders/${id}/parts`, {
    method: 'POST',
    token: auth.token!,
    tenantSlug: auth.tenantSlug!,
    body: item ? { inventoryItemId: item.id, qty } : { freeText: partQ.trim(), qty },
  });
  setPartQ('');
  setPartQty(1);
  mutate();
} catch (e: any) {
  const parsed = parseApiError(e);
  if (applyWorkLogBlockIfPresent(parsed)) return;
  if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
  else setUiErr(parsed.message || 'Error agregando repuesto');
}
  }

  async function markPartReplaced(part: Part) {
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
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
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error marcando repuesto como cambiado');
    } finally {
      setBusy(false);
    }
  }

  async function removePart(partId: string) {
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    try {
  await apiFetch(`/service-orders/${id}/parts/${partId}`, {
    method: 'DELETE',
    token: auth.token!,
    tenantSlug: auth.tenantSlug!,
  });
  mutate();
} catch (e: any) {
  const parsed = parseApiError(e);
  if (applyWorkLogBlockIfPresent(parsed)) return;
  if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
  else setUiErr(parsed.message || 'Error eliminando repuesto');
}
  }

  async function saveHourmeter() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }

    const reading = Number(hourmeterReading);
    if (!Number.isFinite(reading) || reading < 0) {
      setUiErr('Ingresa un valor de horómetro válido (>= 0).');
      return;
    }

    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      const body: any = { reading };
      if (!isTech) {
        body.phase = hourmeterPhase;
        body.note = hourmeterNote.trim() || undefined;
        body.allowDecrease = hourmeterAllowDecrease || undefined;
      }

      await apiFetch(`/service-orders/${id}/hourmeter`, {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body,
      });
      setHourmeterReading('');
      setHourmeterNote('');
      setHourmeterAllowDecrease(false);
      setUiInfo('Lectura de horómetro registrada.');
      await mutateHourmeter();
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error registrando horómetro');
    } finally {
      setBusy(false);
    }
  }

  async function toggleHasIssue(next: boolean) {
    await patch(`/service-orders/${id}`, { hasIssue: next });
    await mutateIssue();
  }

  async function saveIssueTracking() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      await apiFetch(`/service-orders/${id}/issue`, {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          status: issueStatus,
          ownerUserId: issueOwnerUserId || null,
          targetResolutionAt: issueTargetResolutionAt ? localInputToIso(issueTargetResolutionAt) : null,
          followUpNote: issueFollowUpNote.trim() || null,
          resolutionSummary: issueResolutionSummary.trim() || null,
          verificationNotes: issueVerificationNotes.trim() || null,
        },
      });
      await Promise.all([mutate(), mutateIssue()]);
      setUiInfo('Seguimiento de novedad actualizado.');
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error guardando seguimiento de novedad');
    } finally {
      setBusy(false);
    }
  }

  async function createCorrectiveFromIssue() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/issue/create-corrective`, {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          dueDate: issueTargetResolutionAt ? localInputToIso(issueTargetResolutionAt) : undefined,
          technicianId: issueOwnerUserId || undefined,
        },
      });
      await Promise.all([mutate(), mutateIssue()]);
      const correctiveId = String(resp?.correctiveWorkOrder?.id || '');
      if (correctiveId) {
        setUiInfo(`OS correctiva creada: ${correctiveId}`);
      } else {
        setUiInfo('OS correctiva creada.');
      }
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error creando OS correctiva');
    } finally {
      setBusy(false);
    }
  }

  async function generateQuoteFromRequiredParts() {
    if (!id || !auth.token || !auth.tenantSlug) return;
    if (techBlocked) {
      setUiInfo('Tienes un WorkLog abierto en otra OS. Debes cerrarlo antes de modificar esta OS.');
      return;
    }
    setBusy(true);
    setUiErr('');
    setUiInfo('');
    try {
      const resp: any = await apiFetch(`/service-orders/${id}/quotes/from-required-parts`, {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {},
      });
      await mutateQuotes();
      const quoteId = String(resp?.quote?.id || '');
      const quoteVersion = Number(resp?.quote?.version || 0);
      if (quoteId) {
        setUiInfo(`Cotización ${quoteVersion ? `v${quoteVersion} ` : ''}generada: ${quoteId}`);
      } else {
        setUiInfo('Cotización generada.');
      }
    } catch (e: any) {
      const parsed = parseApiError(e);
      if (applyWorkLogBlockIfPresent(parsed)) return;
      if (parsed.status === 403 || parsed.status === 409) setUiInfo(parsed.message);
      else setUiErr(parsed.message || 'Error generando cotización');
    } finally {
      setBusy(false);
    }
  }

  const fd = data.formData ?? {};
  const visitMode = getVisitModeFromFormData(fd);
  const isFollowUpVisit = visitMode === 'FOLLOW_UP';
  const showChecklist = data.serviceOrderType === 'ALISTAMIENTO' || data.serviceOrderType === 'PREVENTIVO';
  const requiredParts = (data.serviceOrderParts ?? []).filter((p) => (p as any).stage !== 'REPLACED');
  const replacedParts = (data.serviceOrderParts ?? []).filter((p) => (p as any).stage === 'REPLACED');
  const hourmeterLatest = hourmeterData?.latest ?? null;
  const hourmeterByOrder = hourmeterData?.byOrder ?? [];
  const hourmeterRecent = hourmeterData?.recent ?? [];
  const issue = issueData?.issue ?? null;
  const hasIssueOpen = !!data.hasIssue || !!issue;
  const linkedCorrectiveId = String(issue?.resolutionWorkOrderId || '');
  const quoteItems = (quotesData?.items ?? []) as QuoteSummary[];

  return (
    <div className="p-4 space-y-6 max-w-4xl">
      {uiErr ? (
        <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{uiErr}</div>
      ) : null}

      {uiInfo ? (
        <div className="p-3 border rounded bg-blue-50 text-blue-700 text-sm whitespace-pre-wrap">{uiInfo}</div>
      ) : null}


{techBlocked ? (
  <div className="p-3 border rounded bg-amber-50 text-amber-900 text-sm">
    <div className="font-medium">Tienes un WorkLog abierto en otra OS.</div>
    <div className="mt-1">
      <a className="underline" href={`/service-orders/${openElsewhere?.workOrderId}`}>
        Ir a la OS donde tienes el WorkLog abierto
      </a>
      {openElsewhere?.workOrderTitle ? <span className="ml-2">· {openElsewhere.workOrderTitle}</span> : null}
      {openElsewhere?.startedAt ? <span className="ml-2 text-amber-800">· Inicio: {fmtDateTime(openElsewhere.startedAt)}</span> : null}
    </div>
  </div>
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
            {commercialMeta ? (
              <span className={`px-2 py-1 text-xs border rounded ${commercialMeta.className}`} title={commercialMeta.label}>
                {commercialMeta.code}
              </span>
            ) : null}
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
            <label className="text-sm font-medium">Estado negociación</label>
            <select
              className="border rounded px-3 py-2 w-full"
              value={editCommercialStatus}
              onChange={(e) => setEditCommercialStatus(e.target.value)}
            >
              <option value="">(sin definir)</option>
              <option value="NO_MANAGEMENT">NG · No gestión</option>
              <option value="PENDING_QUOTE">PC · Pendiente cotizar</option>
              <option value="PENDING_APPROVAL">PA · Pendiente aprobación</option>
              <option value="NOT_APPROVED">NA · No aprobado</option>
              <option value="APPROVED">AP · Aprobado</option>
              <option value="PROGRAMMED">PR · Programado</option>
              <option value="CONFIRMED">CF · Confirmado</option>
              <option value="COMPLETED">CP · Completado</option>
            </select>
            <p className="text-xs text-gray-500">Seguimiento comercial de la OS con el cliente.</p>
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
                    commercialStatus: editCommercialStatus || null,
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
              setEditCommercialStatus(String(data.commercialStatus || ''));
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
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
            <label className="text-sm font-medium">Estado negociación</label>
            {isAdmin ? (
              <>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={data.commercialStatus ?? ''}
                  disabled={busy || !canEditCommercialStatus}
                  onChange={(e) => patch(`/service-orders/${id}`, { commercialStatus: e.target.value || null })}
                >
                  <option value="">(sin definir)</option>
                  <option value="NO_MANAGEMENT">NG · No gestión</option>
                  <option value="PENDING_QUOTE">PC · Pendiente cotizar</option>
                  <option value="PENDING_APPROVAL">PA · Pendiente aprobación</option>
                  <option value="NOT_APPROVED">NA · No aprobado</option>
                  <option value="APPROVED">AP · Aprobado</option>
                  <option value="PROGRAMMED">PR · Programado</option>
                  <option value="CONFIRMED">CF · Confirmado</option>
                  <option value="COMPLETED">CP · Completado</option>
                </select>
                <p className="text-xs text-gray-500">
                  {!canEditCommercialStatus ? 'Disponible cuando la OS está programada o en ejecución.' : 'Seguimiento comercial con el cliente.'}
                </p>
              </>
            ) : (
              <div className="pt-2">
                {commercialMeta ? (
                  <span className={`px-2 py-1 text-xs border rounded ${commercialMeta.className}`} title={commercialMeta.label}>
                    {commercialMeta.code} · {commercialMeta.label}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">—</span>
                )}
              </div>
            )}
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

      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Seguimiento comercial</h2>
            <p className="text-xs text-gray-500">
              Registra fecha y comentario del proceso comercial. Cada entrada conserva el estado de negociación vigente al momento del registro.
            </p>
          </div>
          <div className="text-sm">
            {commercialMeta ? (
              <span className={`px-2 py-1 text-xs border rounded ${commercialMeta.className}`} title={commercialMeta.label}>
                Estado actual: {commercialMeta.code} · {commercialMeta.label}
              </span>
            ) : (
              <span className="text-gray-500">Estado actual: Sin definir</span>
            )}
          </div>
        </div>

        {isAdmin ? (
          <div className="grid grid-cols-1 md:grid-cols-[220px,1fr,auto] gap-2 items-start">
            <div className="space-y-1">
              <label className="text-sm font-medium">Fecha seguimiento</label>
              <input
                type="datetime-local"
                className="border rounded px-3 py-2 w-full"
                value={commercialNoteAt}
                disabled={commercialNoteBusy}
                onChange={(e) => setCommercialNoteAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Comentario</label>
              <textarea
                className="border rounded px-3 py-2 w-full min-h-[88px]"
                placeholder="Ej. Se envió cotización, cliente pidió ajuste, quedó pendiente aprobación..."
                value={commercialNoteComment}
                disabled={commercialNoteBusy}
                onChange={(e) => setCommercialNoteComment(e.target.value)}
              />
            </div>
            <div className="pt-6">
              <button
                type="button"
                className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                disabled={commercialNoteBusy}
                onClick={addCommercialNote}
              >
                Agregar
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {commercialNotes.map((note) => {
            const noteMeta = commercialStatusMeta(note.commercialStatus);
            return (
              <div key={note.id} className="border rounded p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{fmtDateTime(note.eventAt)}</span>
                      {noteMeta ? (
                        <span className={`px-2 py-0.5 text-xs border rounded ${noteMeta.className}`} title={noteMeta.label}>
                          {noteMeta.code} · {noteMeta.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">Sin estado definido</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      Registrado por {note.user?.name || note.addedByUserId || 'usuario'}{note.createdAt ? ` · ${fmtDateTime(note.createdAt)}` : ''}
                    </div>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="px-2 py-1 border rounded text-sm disabled:opacity-50"
                      disabled={commercialNoteBusy}
                      onClick={() => removeCommercialNote(note.id)}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
                <div className="text-sm whitespace-pre-wrap text-gray-700">{note.comment}</div>
              </div>
            );
          })}
          {commercialNotes.length === 0 ? (
            <div className="text-sm text-gray-500">Aún no hay seguimientos comerciales registrados.</div>
          ) : null}
        </div>
      </section>

      {/* Timestamps */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Tiempos (timestamps)</h2>

        <div className="border rounded p-3 bg-gray-50 space-y-2">
          <div className="text-sm font-medium">Modo de visita</div>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm flex items-center gap-2">
              <input
                type="radio"
                name="visitMode"
                checked={visitMode === 'PRIMARY'}
                disabled={busy}
                onChange={() => setVisitMode('PRIMARY')}
              />
              Primera OS de la visita
            </label>
            <label className="text-sm flex items-center gap-2">
              <input
                type="radio"
                name="visitMode"
                checked={visitMode === 'FOLLOW_UP'}
                disabled={busy}
                onChange={() => setVisitMode('FOLLOW_UP')}
              />
              OS subsecuente en la misma visita
            </label>
          </div>
          <p className="text-xs text-gray-600">
            En modo subsecuente no aplican <span className="font-mono">toma/llegada/ingreso</span>; el dashboard excluye esos tramos para esta OS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {TS_FIELDS.map(({ key, label, hint }) => {
            const isPreludeField = key === 'takenAt' || key === 'arrivedAt' || key === 'checkInAt';
            const disabledByVisitMode = isFollowUpVisit && isPreludeField;
            const hintText = disabledByVisitMode ? 'No aplica para OS subsecuente en la visita.' : hint;

            return (
            <div key={key} className={`border rounded p-2 ${disabledByVisitMode ? 'bg-gray-50' : ''}`}>
              <label className="text-sm font-medium">{label}</label>

              <div className="mt-1 flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="border rounded px-3 py-2 w-full"
                  value={ts[key]}
                  disabled={busy || disabledByVisitMode}
                  onChange={(e) => setTs((s) => ({ ...s, [key]: e.target.value }))}
                  onBlur={(e) => setTimestamp(key, e.target.value)}
                />

                {/* Evitamos doble guardado: click en botón no dispara blur del input */}
                <button
                  type="button"
                  className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
                  disabled={busy || disabledByVisitMode}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTimestamp(key, nowLocalInputValue())}
                  title="Registrar hora actual"
                >
                  Ahora
                </button>

                <button
                  type="button"
                  className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
                  disabled={busy || disabledByVisitMode || !ts[key]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setTimestamp(key, '')}
                  title="Limpiar"
                >
                  ✕
                </button>
              </div>

              {hintText ? <p className="text-xs text-gray-500 mt-1">{hintText}</p> : null}
            </div>
          )})}
        </div>

{/* WorkLogs */}
<section className="border rounded p-4 space-y-3">
  <div className="flex items-center justify-between gap-2">
    <h2 className="font-semibold">Work Logs (tiempos por técnico)</h2>

    <div className="flex items-center gap-2">
      {/* Iniciar mi WorkLog (técnico auxiliar o técnico principal) */}
      {(isTech || isAdmin) && !isClosedStatus && !myOpenLog ? (
        <button
          type="button"
          className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
          disabled={busy}
          onClick={startMyWorkLog}
          title="Iniciar mi WorkLog"
        >
          Iniciar mi WorkLog
        </button>
      ) : null}

      {/* Cerrar mi WorkLog si está en curso */}
      {(isTech || isAdmin) && myOpenLog ? (
        <button
          type="button"
          className="px-3 py-2 border rounded whitespace-nowrap disabled:opacity-50"
          disabled={busy}
          onClick={() => closeWorkLog(myOpenLog.id)}
          title="Cerrar mi WorkLog"
        >
          Cerrar mi WorkLog
        </button>
      ) : null}
    </div>
  </div>

  {myOpenLog ? (
    <div className="text-sm text-amber-800">
      Tienes un WorkLog en curso desde <span className="font-medium">{fmtDateTime(myOpenLog.startedAt)}</span>.
    </div>
  ) : null}

  {(data.workLogs ?? []).length > 0 ? (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Técnico</th>
            <th className="py-2 pr-4">Inicio</th>
            <th className="py-2 pr-4">Fin</th>
            <th className="py-2 pr-4">Duración</th>
            <th className="py-2 pr-4">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(data.workLogs ?? []).map((wl) => {
            const canClose = !wl.endedAt && (isAdmin || (currentUserId && wl.userId === currentUserId));
            const isEditing = isAdmin && editingWorkLogId === wl.id;
            const draftStartIso = isEditing ? localInputToIso(workLogDraft.startedAt) : wl.startedAt;
            const draftEndIso = isEditing ? (workLogDraft.endedAt ? localInputToIso(workLogDraft.endedAt) : null) : (wl.endedAt ?? null);
            return (
              <tr key={wl.id} className="border-b last:border-b-0">
                <td className="py-2 pr-4">{wl.user?.name ?? wl.userId}</td>
                <td className="py-2 pr-4">
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      className="border rounded px-2 py-1 w-full min-w-[220px]"
                      value={workLogDraft.startedAt}
                      disabled={busy}
                      onChange={(e) => setWorkLogDraft((s) => ({ ...s, startedAt: e.target.value }))}
                    />
                  ) : (
                    fmtDateTime(wl.startedAt)
                  )}
                </td>
                <td className="py-2 pr-4">
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      className="border rounded px-2 py-1 w-full min-w-[220px]"
                      value={workLogDraft.endedAt}
                      disabled={busy}
                      onChange={(e) => setWorkLogDraft((s) => ({ ...s, endedAt: e.target.value }))}
                    />
                  ) : wl.endedAt ? (
                    fmtDateTime(wl.endedAt)
                  ) : (
                    <span className="text-amber-700">En curso</span>
                  )}
                </td>
                <td className="py-2 pr-4">{fmtDuration(draftStartIso, draftEndIso)}</td>
                <td className="py-2 pr-4">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 border rounded bg-black text-white disabled:opacity-50"
                        disabled={busy}
                        onClick={() => saveWorkLogEdit(wl.id)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 border rounded disabled:opacity-50"
                        disabled={busy}
                        onClick={cancelEditWorkLog}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {canClose ? (
                        <button
                          type="button"
                          className="px-3 py-1 border rounded disabled:opacity-50"
                          disabled={busy}
                          onClick={() => closeWorkLog(wl.id)}
                        >
                          Cerrar
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="px-3 py-1 border rounded disabled:opacity-50"
                          disabled={busy}
                          onClick={() => beginEditWorkLog(wl)}
                        >
                          Editar
                        </button>
                      ) : null}
                      {isAdmin ? (
                        <button
                          type="button"
                          className="px-3 py-1 border rounded text-red-700 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => removeWorkLog(wl.id)}
                        >
                          Eliminar
                        </button>
                      ) : null}
                      {!canClose && !isAdmin ? <span className="text-gray-400">—</span> : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
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

      {/* Horómetro */}
      <section className="border rounded p-4 space-y-3">
        <h2 className="font-semibold">Horómetro</h2>

        {!isTech ? (
          <div className="text-sm text-gray-700">
            Última lectura registrada:{' '}
            {hourmeterLatest?.reading != null ? (
              <b>
                {hourmeterLatest.reading} h · {fmtDateTime(hourmeterLatest.readingAt)}
              </b>
            ) : (
              <span className="text-gray-500">Sin lecturas.</span>
            )}
          </div>
        ) : null}

        {isTech ? (
          <label className="space-y-1 block">
            <span className="text-sm font-medium">Lectura (horas acumuladas)</span>
            <input
              type="number"
              min={0}
              step="0.1"
              className="border rounded px-3 py-2 w-full"
              value={hourmeterReading}
              onChange={(e) => setHourmeterReading(e.target.value)}
              placeholder="Ej: 1234.5"
            />
          </label>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_1fr] gap-2 items-end">
              <label className="space-y-1">
                <span className="text-sm font-medium">Lectura (horas acumuladas)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  className="border rounded px-3 py-2 w-full"
                  value={hourmeterReading}
                  onChange={(e) => setHourmeterReading(e.target.value)}
                  placeholder="Ej: 1234.5"
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium">Fase</span>
                <select
                  className="border rounded px-3 py-2 w-full"
                  value={hourmeterPhase}
                  onChange={(e) => setHourmeterPhase(e.target.value as 'BEFORE' | 'AFTER' | 'OTHER')}
                >
                  <option value="BEFORE">BEFORE</option>
                  <option value="AFTER">AFTER</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium">Nota (opcional)</span>
                <input
                  className="border rounded px-3 py-2 w-full"
                  value={hourmeterNote}
                  onChange={(e) => setHourmeterNote(e.target.value)}
                  placeholder="Observación de la lectura"
                />
              </label>
            </div>

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={hourmeterAllowDecrease}
                onChange={(e) => setHourmeterAllowDecrease(e.target.checked)}
              />
              Permitir disminución (ajuste manual, requiere nota)
            </label>
          </>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
            disabled={busy}
            onClick={saveHourmeter}
          >
            Registrar horómetro
          </button>
        </div>

        {isTech ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Historial reciente del activo</div>
            {hourmeterRecent.length === 0 ? (
              <div className="text-sm text-gray-600">Sin historial.</div>
            ) : (
              <ul className="text-sm space-y-1 max-h-56 overflow-auto pr-1">
                {hourmeterRecent.map((r) => (
                  <li key={r.id} className="border rounded px-2 py-1">
                    <b>{r.reading} h</b> · {fmtDateTime(r.readingAt)} · {r.source ?? 'MANUAL_OS'}
                    {r.workOrderId ? (
                      <>
                        {' '}· <a className="underline" href={`/service-orders/${r.workOrderId}`}>OS</a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="text-sm font-medium">Lecturas en esta OS</div>
              {hourmeterByOrder.length === 0 ? (
                <div className="text-sm text-gray-600">Sin lecturas en esta OS.</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {hourmeterByOrder.map((r) => (
                    <li key={r.id} className="border rounded px-2 py-1">
                      <b>{r.reading} h</b> · {r.phase ?? 'OTHER'} · {fmtDateTime(r.readingAt)}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Historial reciente del activo</div>
              {hourmeterRecent.length === 0 ? (
                <div className="text-sm text-gray-600">Sin historial.</div>
              ) : (
                <ul className="text-sm space-y-1 max-h-56 overflow-auto pr-1">
                  {hourmeterRecent.map((r) => (
                    <li key={r.id} className="border rounded px-2 py-1">
                      <b>{r.reading} h</b> · {fmtDateTime(r.readingAt)} · {r.source ?? 'MANUAL_OS'}
                      {r.workOrderId ? (
                        <>
                          {' '}· <a className="underline" href={`/service-orders/${r.workOrderId}`}>OS</a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
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
              checked={!!data.hasIssue}
              onChange={(e) => toggleHasIssue(e.target.checked)}
            />
            Tiene novedad
          </label>
        </div>

        {hasIssueOpen && (
          <div className="space-y-3">
            {isAdmin ? (
              <div className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">Seguimiento de resolución</div>
                  {issue ? (
                    <span className="text-xs px-2 py-0.5 border rounded bg-amber-50 text-amber-800 border-amber-200">
                      Estado: {issue.status}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">Sin registro detallado aún</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium">Estado novedad</span>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={issueStatus}
                      onChange={(e) => setIssueStatus(e.target.value as IssueStatus)}
                    >
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="WAITING_PARTS">WAITING_PARTS</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="VERIFIED">VERIFIED</option>
                      <option value="CANCELED">CANCELED</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">Responsable</span>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={issueOwnerUserId}
                      onChange={(e) => setIssueOwnerUserId(e.target.value)}
                    >
                      <option value="">(sin asignar)</option>
                      {(techs ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm font-medium">Fecha objetivo</span>
                    <input
                      type="datetime-local"
                      className="border rounded px-3 py-2 w-full"
                      value={issueTargetResolutionAt}
                      onChange={(e) => setIssueTargetResolutionAt(e.target.value)}
                    />
                  </label>
                </div>

                <label className="space-y-1 block">
                  <span className="text-sm font-medium">Seguimiento / nota</span>
                  <textarea
                    className="border rounded px-3 py-2 w-full"
                    rows={2}
                    value={issueFollowUpNote}
                    onChange={(e) => setIssueFollowUpNote(e.target.value)}
                    placeholder="Ej: pendiente repuesto, visita reagendada, etc."
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">Resumen de resolución</span>
                    <textarea
                      className="border rounded px-3 py-2 w-full"
                      rows={2}
                      value={issueResolutionSummary}
                      onChange={(e) => setIssueResolutionSummary(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-sm font-medium">Notas de verificación</span>
                    <textarea
                      className="border rounded px-3 py-2 w-full"
                      rows={2}
                      value={issueVerificationNotes}
                      onChange={(e) => setIssueVerificationNotes(e.target.value)}
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={saveIssueTracking}
                  >
                    Guardar seguimiento
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 border rounded disabled:opacity-50"
                    disabled={busy}
                    onClick={createCorrectiveFromIssue}
                  >
                    Generar OS correctiva
                  </button>
                  {linkedCorrectiveId ? (
                    <a className="text-sm underline" href={`/service-orders/${linkedCorrectiveId}`}>
                      Ir a OS correctiva vinculada
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            {isAdmin ? (
              <div className="border rounded p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">Cotización para cliente</div>
                  <button
                    type="button"
                    className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
                    disabled={busy}
                    onClick={generateQuoteFromRequiredParts}
                  >
                    Generar cotización
                  </button>
                </div>

                {quoteItems.length > 0 ? (
                  <ul className="space-y-2">
                    {quoteItems.map((q) => (
                      <li key={q.id} className="border rounded px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-sm">
                          <span className="font-medium">v{q.version}</span>
                          <span className="ml-2 text-gray-700">
                            {q.currency ?? 'COP'} {Number(q.total ?? 0).toFixed(2)}
                          </span>
                          {Number(q.missingPriceItems ?? 0) > 0 ? (
                            <span className="ml-2 text-amber-700">
                              · {Number(q.missingPriceItems)} ítems sin precio
                            </span>
                          ) : null}
                          <span className="ml-2 text-gray-500">· {fmtDateTime(q.createdAt)}</span>
                        </div>
                        <a className="text-sm underline" href={`/service-orders/${id}/quotes/${q.id}`} target="_blank">
                          Ver / imprimir
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-600">
                    No hay cotizaciones generadas todavía.
                  </div>
                )}
              </div>
            ) : null}

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

      {/* Resumen / Reportes (versionados) */}
      <section className="border rounded p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Resumen / Reporte</h2>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="px-3 py-2 border rounded"
              onClick={() => generateReport('CUSTOMER')}
              disabled={!canGenerateReport || busy}
              title={!canGenerateReport ? 'Disponible solo cuando la OS está COMPLETED/CLOSED' : ''}
            >
              Generar reporte cliente
            </button>
            <button
              type="button"
              className="px-3 py-2 border rounded"
              onClick={() => generateReport('INTERNAL')}
              disabled={!canGenerateReport || busy}
              title={!canGenerateReport ? 'Disponible solo cuando la OS está COMPLETED/CLOSED' : ''}
            >
              Generar reporte interno
            </button>
          </div>
        </div>

        {!canGenerateReport ? (
          <div className="text-sm text-gray-600">El resumen se puede generar solo cuando la OS está <b>COMPLETED</b> o <b>CLOSED</b>.</div>
        ) : null}

        {reports.length > 0 ? (
          <div className="border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2">Audiencia</th>
                  <th className="text-left p-2">Versión</th>
                  <th className="text-left p-2">Generado</th>
                  <th className="text-right p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="p-2">{audienceLabel(r.audience)}</td>
                    <td className="p-2">v{r.version}</td>
                    <td className="p-2">{fmtDateTime(r.createdAt)}</td>
                    <td className="p-2 text-right">
                      <a className="underline" href={`/service-orders/${id}/reports/${r.id}`} target="_blank">
                        Ver / imprimir
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Aún no hay reportes generados.</div>
        )}
      </section>

      {/* Nota al pie: quién cambió qué */}
      {auditTrail.length > 0 ? (
        <section className="border rounded p-3 text-xs text-gray-600">
          <div className="font-semibold mb-2">Cambios recientes</div>
          <ul className="space-y-1">
            {auditTrail.map((a, idx) => (
              <li key={idx} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{a.user?.name ?? a.byUserId}</span>
                <span className="text-gray-500">{fmtDateTime(a.at)}</span>
                <span>·</span>
                <span className="font-mono">{a.field}{a.part ? `.${a.part}` : ''}</span>
                {a.from !== undefined || a.to !== undefined ? (
                  <span className="text-gray-500">
                    {a.from !== undefined ? ` ${String(a.from)}` : ''}{a.to !== undefined ? ` → ${String(a.to)}` : ''}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {busy && <div className="text-sm text-gray-600">Guardando...</div>}
    </div>
  );
}
