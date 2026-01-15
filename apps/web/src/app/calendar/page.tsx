'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

import { Calendar as RBCalendar, Views, dateFnsLocalizer, type View } from 'react-big-calendar';
import withDragAndDrop, { type withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  getDay,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';

type User = { id: string; name: string; email: string; role: string };

type ServiceOrder = {
  id: string;
  title?: string | null;
  description?: string | null;
  assetCode: string;
  status: string;
  serviceOrderType?: string | null;
  dueDate?: string | null;
  durationMin?: number | null;
  assignments?: Array<{
    id: string;
    role: string;
    state: string;
    user?: { id: string; name: string } | null;
  }> | null;
  asset?: {
    customer?: string | null;
    name?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
    model?: string | null;
  } | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number };
type Resource = { id: string; title: string };

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string; // technicianId o UNASSIGNED
  so: ServiceOrder;
};

const DragAndDropCalendar = withDragAndDrop<CalEvent, Resource>(RBCalendar as any) as React.ComponentType<
  withDragAndDropProps<CalEvent, Resource>
>;

const locales = { es };

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const UNASSIGNED = 'UNASSIGNED';
const DEFAULT_DURATION_MIN = 60;

// Horario visible (semana/día)
const MIN_TIME = new Date(1970, 0, 1, 7, 30);
const MAX_TIME = new Date(1970, 0, 1, 17, 0);

const messagesEs = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'No hay eventos en este rango',
  showMore: (total: number) => `+ Ver ${total} más`,
};

function addMinutes(d: Date, minutes: number) {
  return new Date(d.getTime() + minutes * 60_000);
}

function statusToStyle(status?: string | null): CSSProperties {
  const s = (status || 'OPEN').toUpperCase();
  switch (s) {
    case 'SCHEDULED':
      return { backgroundColor: '#06b6d4', borderColor: '#06b6d4', color: '#0b1220' };
    case 'IN_PROGRESS':
      return { backgroundColor: '#f59e0b', borderColor: '#f59e0b', color: '#111827' };
    case 'ON_HOLD':
      return { backgroundColor: '#a78bfa', borderColor: '#a78bfa', color: '#111827' };
    case 'COMPLETED':
      return { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#052e16' };
    case 'CLOSED':
      return { backgroundColor: '#9ca3af', borderColor: '#9ca3af', color: '#111827' };
    case 'CANCELED':
      return { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#111827', opacity: 0.75 };
    case 'OPEN':
    default:
      return { backgroundColor: '#3b82f6', borderColor: '#3b82f6', color: '#0b1220' };
  }
}

function getRange(date: Date, view: View) {
  if (view === Views.MONTH) {
    // En MONTH el calendario muestra "relleno" con días de semanas adyacentes.
    // Si consultamos solo start/end del mes, se pierden eventos en esos días visibles.
    const start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
    return { start: startOfDay(start), end: endOfDay(end) };
  }
  if (view === Views.DAY) {
    return { start: startOfDay(date), end: endOfDay(date) };
  }
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = addMinutes(new Date(start.getTime() + 7 * 24 * 60 * 60_000), -1);
  return { start, end };
}

function getActiveTechnicianId(so: ServiceOrder): string | null {
  const tech = so.assignments?.find((a) => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;
  return tech?.id ?? null;
}

function buildCompactTitle(so: ServiceOrder) {
  const bits: string[] = [];
  const assetName = so.asset?.name?.trim() ? so.asset.name.trim() : '';
  const customer = so.asset?.customer?.trim() ? so.asset.customer.trim() : '';

  bits.push(assetName ? `${so.assetCode} - ${assetName}` : so.assetCode);
  if (so.serviceOrderType) bits.push(so.serviceOrderType);
  if (customer) bits.push(`(${customer})`);
  return bits.join(' · ');
}

function buildSidebarTitle(so: ServiceOrder) {
  return so.title?.trim() ? so.title.trim() : buildCompactTitle(so);
}

function clampText(s: string, max: number) {
  const t = (s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function normalizeResourceId(r: any): string {
  if (!r) return '';
  if (typeof r === 'string' || typeof r === 'number') return String(r);
  if (typeof r === 'object' && 'id' in r) return String((r as any).id);
  return '';
}

function bestResourceId(
  raw: any,
  fallback: { hoverResourceId?: string; onlyTechId?: string; currentEventResourceId?: string },
) {
  const direct = normalizeResourceId(raw);
  if (direct) return direct;
  if (fallback.currentEventResourceId) return fallback.currentEventResourceId;
  if (fallback.hoverResourceId) return fallback.hoverResourceId;
  if (fallback.onlyTechId) return fallback.onlyTechId;
  return UNASSIGNED;
}

function resolveTargetResourceIdForExistingEvent(args: {
  rawResourceId: any;
  hoverResourceId: string;
  currentEventResourceId: string;
}) {
  const direct = normalizeResourceId(args.rawResourceId);

  // Ideal case: RBC entrega el id del recurso destino.
  if (direct && direct !== UNASSIGNED) return direct;

  // Caso problemático observado: a veces RBC entrega UNASSIGNED al soltar sobre un técnico.
  // Si estamos "hover" en una columna de técnico, priorizamos ese hover.
  if (direct === UNASSIGNED && args.hoverResourceId && args.hoverResourceId !== UNASSIGNED) return args.hoverResourceId;

  // Si no hay info fiable del destino, NO cambiamos el técnico.
  if (!direct) return args.currentEventResourceId || UNASSIGNED;

  // direct === UNASSIGNED y hover también UNASSIGNED: el usuario realmente soltó en "Sin asignar".
  return direct;
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const router = useRouter();

  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const calendarRootRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [view, setView] = useState<View>(Views.DAY);
  const [date, setDate] = useState<Date>(new Date());
  const [onlyTechId, setOnlyTechId] = useState<string>('');
  const [hoverResourceId, setHoverResourceId] = useState<string>('');
  const hoverResourceIdRef = useRef<string>('');

  const [techs, setTechs] = useState<User[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [unscheduled, setUnscheduled] = useState<ServiceOrder[]>([]);
  const [unscheduledQ, setUnscheduledQ] = useState<string>('');
  const [dragSo, setDragSo] = useState<ServiceOrder | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const eventsReqSeq = useRef(0);
  const unscheduledReqSeq = useRef(0);

  const resources: Resource[] = useMemo(() => {
    const list: Resource[] = [{ id: UNASSIGNED, title: 'Sin asignar' }, ...techs.map((t) => ({ id: t.id, title: t.name }))];
    return onlyTechId ? list.filter((r) => r.id === onlyTechId) : list;
  }, [techs, onlyTechId]);

  function setHoverResource(id: string) {
    hoverResourceIdRef.current = id;
    setHoverResourceId(id);
  }

  // Mejora UX: en drag desde "Sin programación", a veces RBC entrega resourceId incorrecto.
  // Usamos la posición del puntero para inferir la columna (técnico) sobre la que se está soltando.
  function updateHoverResourceFromPointerEvent(e: any) {
    const root = calendarRootRef.current;
    if (!root) return;
    const x = Number(e?.clientX);
    const y = Number(e?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const slot = el?.closest?.('.rbc-time-content .rbc-day-slot') as HTMLElement | null;
    if (!slot) return;

    const slots = Array.from(root.querySelectorAll('.rbc-time-content .rbc-day-slot')) as HTMLElement[];
    const idx = slots.indexOf(slot);
    if (idx < 0) return;

    const resId = resources[idx]?.id;
    if (resId) setHoverResource(resId);
  }

  async function loadTechs() {
    if (!auth.token || !auth.tenantSlug) return;
    const data = await apiFetch<User[]>('/users?role=TECH', { token: auth.token, tenantSlug: auth.tenantSlug });
    setTechs(Array.isArray(data) ? data : []);
  }

  async function loadEvents() {
    if (!auth.token || !auth.tenantSlug) return;
    const rid = ++eventsReqSeq.current;
    setLoading(true);
    setErr('');

    try {
      const { start, end } = getRange(date, view);

      const qs = new URLSearchParams();
      qs.set('start', start.toISOString());
      qs.set('end', end.toISOString());
      if (onlyTechId) qs.set('technicianId', onlyTechId);

      const items = await apiFetch<ServiceOrder[]>(`/service-orders/calendar?${qs.toString()}`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });

      if (rid !== eventsReqSeq.current) return;

      const mapped: CalEvent[] = (items ?? [])
        .filter((so) => !!so?.dueDate)
        .map((so) => {
          const startAt = new Date(so.dueDate!);
          const dur = so.durationMin ?? DEFAULT_DURATION_MIN;
          const endAt = addMinutes(startAt, dur);
          const techId = getActiveTechnicianId(so) ?? UNASSIGNED;
          return { id: so.id, title: buildCompactTitle(so), start: startAt, end: endAt, resourceId: techId, so };
        });

      setEvents(mapped);
    } catch (e: any) {
      if (rid !== eventsReqSeq.current) return;
      setErr(e?.message ?? 'Error cargando agenda');
    } finally {
      if (rid === eventsReqSeq.current) setLoading(false);
    }
  }

  async function loadUnscheduled() {
    if (!auth.token || !auth.tenantSlug) return;
    const rid = ++unscheduledReqSeq.current;
    setErr('');

    try {
      const qs = new URLSearchParams();
      qs.set('page', '1');
      qs.set('size', '200');
      qs.set('unscheduledOnly', '1');
      if (unscheduledQ.trim()) qs.set('q', unscheduledQ.trim());

      const data = await apiFetch<Paginated<ServiceOrder>>(`/service-orders?${qs.toString()}`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });

      if (rid !== unscheduledReqSeq.current) return;
      setUnscheduled(data?.items ?? []);
    } catch (e: any) {
      if (rid !== unscheduledReqSeq.current) return;
      setErr(e?.message ?? 'Error cargando pendientes');
    }
  }

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    (async () => {
      await loadTechs();
      await loadUnscheduled();
      await loadEvents();
    })().catch((e: any) => setErr(e?.message ?? 'Error inicializando calendario'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug]);

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, view, date, onlyTechId]);

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    const t = setTimeout(() => loadUnscheduled(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unscheduledQ, auth.token, auth.tenantSlug]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  async function toggleFullscreen() {
    const el = fullscreenRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await el.requestFullscreen();
        setView(Views.DAY);
      }
    } catch {
      // Si el navegador bloquea la API, no hacemos nada.
    }
  }

  async function reschedule(soId: string, start: Date | null, resourceId: string, durationMin?: number | null) {
    if (!auth.token || !auth.tenantSlug) return;

    await apiFetch(`/service-orders/${soId}/schedule`, {
      method: 'PATCH',
      token: auth.token,
      tenantSlug: auth.tenantSlug,
      body: {
        dueDate: start === null ? null : start.toISOString(),
        technicianId: resourceId === UNASSIGNED ? null : resourceId,
        ...(durationMin !== undefined ? { durationMin } : {}),
      },
    });
  }

  async function unscheduleSo(soId: string) {
    setLoading(true);
    setErr('');
    try {
      await reschedule(soId, null, UNASSIGNED, undefined);
      await loadEvents();
      await loadUnscheduled();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo devolver a "Sin programación"');
    } finally {
      setLoading(false);
    }
  }

  const onEventDrop: withDragAndDropProps<CalEvent, Resource>['onEventDrop'] = async ({ event, start, end, resourceId }) => {
    setLoading(true);
    setErr('');
    try {
      const s = start as Date;
      const e = (end as Date) ?? (event.end as Date);
      const duration = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000)) || DEFAULT_DURATION_MIN;

      const targetResId = resolveTargetResourceIdForExistingEvent({
        rawResourceId: resourceId,
        hoverResourceId,
        currentEventResourceId: event.resourceId,
      });

      await reschedule(event.id, s, targetResId, duration);
      await loadEvents();
      await loadUnscheduled();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo reprogramar');
    } finally {
      setLoading(false);
    }
  };

  const onEventResize: withDragAndDropProps<CalEvent, Resource>['onEventResize'] = async ({ event, start, end, resourceId }) => {
    setLoading(true);
    setErr('');
    try {
      const s = start as Date;
      const e = end as Date;
      const duration = Math.max(15, Math.round((e.getTime() - s.getTime()) / 60000));

      const targetResId = resolveTargetResourceIdForExistingEvent({
        rawResourceId: resourceId,
        hoverResourceId,
        currentEventResourceId: event.resourceId,
      });

      await reschedule(event.id, s, targetResId, duration);
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo ajustar la duración');
    } finally {
      setLoading(false);
    }
  };

  const dragPreviewEvent = useMemo<CalEvent | null>(() => {
    if (!dragSo) return null;
    const startAt = new Date();
    const dur = dragSo.durationMin ?? DEFAULT_DURATION_MIN;
    const endAt = addMinutes(startAt, dur);
    return { id: dragSo.id, title: buildCompactTitle(dragSo), start: startAt, end: endAt, resourceId: UNASSIGNED, so: dragSo };
  }, [dragSo]);

  const onDropFromOutside: withDragAndDropProps<CalEvent, Resource>['onDropFromOutside'] = async (args: any) => {
    const { start, resourceId } = args ?? {};
    if (!dragSo) return;
    setLoading(true);
    setErr('');
    try {
      const s = start as Date;
      const hoverId = hoverResourceIdRef.current;
      let techTarget = bestResourceId(resourceId, { hoverResourceId: hoverId, onlyTechId });

      // Caso observado: al primer drop desde el panel, RBC a veces reporta UNASSIGNED aunque se suelte sobre un técnico.
      // Si estamos hover en un técnico, lo respetamos.
      if (techTarget === UNASSIGNED && hoverId && hoverId !== UNASSIGNED) techTarget = hoverId;

      const dur = dragSo.durationMin ?? DEFAULT_DURATION_MIN;

      await reschedule(dragSo.id, s, techTarget, dur);

      setDragSo(null);
      await loadEvents();
      await loadUnscheduled();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo programar desde pendientes');
    } finally {
      setLoading(false);
    }
  };

  const TimeSlotWrapper = (props: any) => {
    const resId = normalizeResourceId(props?.resource);
    return (
      <div onMouseEnter={() => resId && setHoverResource(resId)} onDragEnter={() => resId && setHoverResource(resId)} style={{ height: '100%' }}>
        {props.children}
      </div>
    );
  };

  const DateCellWrapper = (props: any) => {
    const resId = normalizeResourceId(props?.resource);
    return (
      <div onMouseEnter={() => resId && setHoverResource(resId)} onDragEnter={() => resId && setHoverResource(resId)}>
        {props.children}
      </div>
    );
  };

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  const Toolbar = (props: any) => (
    <CalendarToolbar
      {...props}
      isFullscreen={isFullscreen}
      onToggleFullscreen={toggleFullscreen}
      onRefresh={() => { loadEvents(); loadUnscheduled(); }}
    />
  );

  return (
    <div
      ref={fullscreenRef}
      className={
        isFullscreen
          ? 'calendar-fs bg-white h-screen w-screen p-0 overflow-hidden'
          : 'p-6 space-y-4'
      }
    >
      {/* Handles de resize (si no importaste el CSS del addon) */}
      <style jsx global>{`
        .rbc-event {
          cursor: move;
        }
        .rbc-addons-dnd-resizable {
          position: relative;
        }
        .rbc-addons-dnd-resizable .rbc-addons-dnd-resize-ns-anchor {
          position: absolute;
          left: 0;
          right: 0;
          height: 10px;
          cursor: ns-resize;
          z-index: 5;
        }
        .rbc-addons-dnd-resizable .rbc-addons-dnd-resize-ns-anchor.rbc-addons-dnd-resize-ns-anchor-top {
          top: -4px;
        }
        .rbc-addons-dnd-resizable .rbc-addons-dnd-resize-ns-anchor.rbc-addons-dnd-resize-ns-anchor-bottom {
          bottom: -4px;
        }
        .rbc-addons-dnd-resizable .rbc-addons-dnd-resize-ns-anchor:after {
          content: '';
          display: block;
          margin: 4px auto;
          width: 36px;
          height: 2px;
          background: rgba(0, 0, 0, 0.35);
          border-radius: 2px;
        }
        .rbc-addons-dnd-resizable {
          overflow: visible;
        }
        .rbc-addons-dnd-resizable .rbc-addons-dnd-resize-ns-anchor {
          pointer-events: auto;
          background: transparent;
        }

        .calendar-fs .rbc-time-content {
          overflow-y: hidden;
        }
        .calendar-fs .rbc-timeslot-group {
          min-height: 28px;
        }
      `}</style>

      {!isFullscreen ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xl font-semibold">Calendario</div>
            <div className="text-sm text-gray-600">
              Columnas por técnico. Arrastra una OS "Sin programación" al calendario para asignar técnico + fecha/hora.
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a className="px-3 py-2 border rounded" href="/service-orders">
              Lista OS
            </a>
            <button className="px-3 py-2 border rounded" onClick={() => { loadEvents(); loadUnscheduled(); }}>
              Actualizar
            </button>
            <button className="px-3 py-2 border rounded" onClick={toggleFullscreen}>
              Pantalla completa
            </button>
            <select className="border rounded px-2 py-1" value={onlyTechId} onChange={(e) => setOnlyTechId(e.target.value)}>
              <option value="">Todos</option>
              <option value={UNASSIGNED}>Sin asignar</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {!isFullscreen ? (
        <>
          {err ? <div className="p-3 border rounded text-red-700 bg-red-50">{err}</div> : null}
          {loading ? <div className="text-sm text-gray-600">Actualizando…</div> : null}
        </>
      ) : (
        <>
          {err ? <div className="absolute top-3 left-3 right-3 z-50 p-3 border rounded text-red-700 bg-red-50">{err}</div> : null}
          {loading ? <div className="absolute top-3 right-3 z-50 text-sm text-gray-600">Actualizando…</div> : null}
        </>
      )}

      <div className={isFullscreen ? 'h-full w-full' : 'grid gap-4 lg:grid-cols-[320px_1fr]'}>
        {/* Panel lateral */}
        {!isFullscreen ? (
          <div className="border rounded p-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Sin programación</div>
              <div className="text-xs text-gray-500">{unscheduled.length}</div>
            </div>

            <input
              className="mt-2 w-full border rounded px-2 py-1 text-sm"
              placeholder="Buscar (título, assetCode...)"
              value={unscheduledQ}
              onChange={(e) => setUnscheduledQ(e.target.value)}
            />

            <div className="mt-3 space-y-2 max-h-[680px] overflow-auto pr-1">
              {unscheduled.length === 0 ? (
                <div className="text-sm text-gray-600">No hay OS pendientes.</div>
              ) : (
                unscheduled.map((so) => {
                  const serial = so.asset?.serialNumber ? `Serie: ${so.asset.serialNumber}` : '';
                  const customer = so.asset?.customer ? `Cliente: ${so.asset.customer}` : '';
                  const subtitle = [customer, serial].filter(Boolean).join(' · ');
                  const desc = so.description ? clampText(so.description, 90) : '';

                  return (
                    <div
                      key={so.id}
                      draggable
                      className="border rounded p-2 cursor-move hover:bg-gray-50"
                      onDragStart={() => setDragSo(so)}
                      onDragEnd={() => setDragSo(null)}
                      onMouseDown={() => setDragSo(so)}
                      onTouchStart={() => setDragSo(so)}
                      title="Arrastra al calendario para programar"
                    >
                      <div className="text-sm font-medium">{buildSidebarTitle(so)}</div>
                      <div className="text-xs text-gray-600">{subtitle || so.assetCode}</div>
                      {desc ? <div className="text-xs text-gray-500 mt-1">{desc}</div> : null}
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-[11px] text-gray-500 mt-3 space-y-1">
              <div>Tip: arrastra un ítem y suéltalo sobre una columna (técnico) y una hora.</div>
              <div>
                Para devolver una OS al panel, usa el botón <span className="font-mono">↩</span> en el evento.
              </div>
            </div>
          </div>
        ) : null}

        {/* Calendario */}
        <div ref={calendarRootRef} className={isFullscreen ? 'h-full w-full' : 'border rounded overflow-visible'}>
          <DndProvider backend={HTML5Backend}>
            <DragAndDropCalendar
              localizer={localizer}
              culture="es"
              messages={messagesEs as any}
              events={events}
              view={view}
              date={date}
              onView={setView}
              onNavigate={setDate}
              components={{
                ...(isFullscreen ? { toolbar: Toolbar } : { toolbar: Toolbar }),
                event: (props: any) => <EventBox {...props} view={view} onUnschedule={() => unscheduleSo(props.event.id)} />,
                timeSlotWrapper: TimeSlotWrapper,
                dateCellWrapper: DateCellWrapper,
              }}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              resources={resources}
              resourceIdAccessor="id"
              resourceTitleAccessor="title"
              resourceAccessor={(e) => e.resourceId}
              step={15}
              timeslots={2}
              min={MIN_TIME}
              max={MAX_TIME}
              selectable={false}
              resizable
              draggableAccessor={() => true}
              resizableAccessor={() => true}
              onEventDrop={onEventDrop}
              onEventResize={onEventResize}
              dragFromOutsideItem={() =>
                (dragPreviewEvent ??
                  ({
                    id: 'preview',
                    title: '',
                    start: new Date(),
                    end: new Date(),
                    resourceId: UNASSIGNED,
                    so: {} as any,
                  } as CalEvent))
              }
              onDropFromOutside={onDropFromOutside}
              onDragOver={(e: any) => {
                e.preventDefault();
                updateHoverResourceFromPointerEvent(e);
              }}
              style={{ height: isFullscreen ? '100vh' : 760 }}
              onDoubleClickEvent={(e: any) => { router.push(`/service-orders/${e.id}`); }}
              eventPropGetter={(event: any) => {
                const base = { whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'hidden', lineHeight: 1.15 };
                const st = statusToStyle(event?.so?.status);
                return { style: { ...(base as any), ...(st as any) } };
              }}
            />
          </DndProvider>
        </div>
      </div>
    </div>
  );
}

function CalendarToolbar({
  label,
  date,
  view,
  onNavigate,
  onView,
  isFullscreen,
  onToggleFullscreen,
  onRefresh,
}: any) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const value = useMemo(() => {
    try {
      return format(date instanceof Date ? date : new Date(date), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  }, [date]);

  const canPick = String(view) === Views.DAY;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: any) => {
      const el = popoverRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  return (
    <div className={isFullscreen ? 'sticky top-0 z-40 bg-white/90 backdrop-blur border-b' : 'relative z-10'}>
      <div className={isFullscreen ? 'px-3 py-2 flex items-center justify-between gap-2' : 'flex items-center justify-between gap-2'}>
        <div className="flex items-center gap-2">
          <button className="px-2 py-1 border rounded text-sm" onClick={() => onNavigate('TODAY')}>Hoy</button>
          <button className="px-2 py-1 border rounded text-sm" onClick={() => onNavigate('PREV')}>‹</button>
          <button className="px-2 py-1 border rounded text-sm" onClick={() => onNavigate('NEXT')}>›</button>
          <div ref={popoverRef} className="relative">
            <button
              className="px-2 py-1 border rounded text-sm font-medium"
              onClick={() => { if (canPick) setOpen((v) => !v); }}
              title={canPick ? 'Cambiar día' : 'Disponible en vista Día'}
            >
              {label}
            </button>
            {open && canPick ? (
              <div className="absolute left-0 mt-2 p-2 border rounded bg-white shadow z-50">
                <input
                  type="date"
                  className="border rounded px-2 py-1 text-sm"
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(`${v}T00:00:00`);
                    onNavigate('DATE', d);
                    setOpen(false);
                  }}
                  autoFocus
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button className="px-2 py-1 border rounded text-sm" onClick={() => onView(Views.MONTH)}>Mes</button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => onView(Views.WEEK)}>Semana</button>
            <button className="px-2 py-1 border rounded text-sm" onClick={() => onView(Views.DAY)}>Día</button>
          </div>

          {typeof onRefresh === 'function' ? (
            <button className="px-2 py-1 border rounded text-sm" onClick={onRefresh}>Actualizar</button>
          ) : null}

          {isFullscreen ? (
            <button className="px-2 py-1 border rounded text-sm" onClick={onToggleFullscreen}>Salir</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EventBox({ event, view, onUnschedule }: { event: CalEvent; view: View; onUnschedule: () => void }) {
  const so = event.so;
  const serial = so.asset?.serialNumber ? `Serie: ${so.asset.serialNumber}` : '';
  const assetName = so.asset?.name?.trim() ? so.asset.name.trim() : '';
  const assetModel = so.asset?.model?.trim() ? so.asset.model.trim() : '';
  const customer = so.asset?.customer?.trim() ? so.asset.customer.trim() : '';
  const title = so.title?.trim() ? so.title.trim() : event.title;
  const desc = so.description?.trim() ? so.description.trim() : '';

  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let raf = 0;
    const recompute = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = outer.clientHeight;
        const w = outer.clientWidth;
        if (!h || !w) {
          setScale(1);
          return;
        }

        const contentH = inner.scrollHeight;
        const contentW = inner.scrollWidth;

        let next = 1;
        if (contentH > 0) next = Math.min(next, h / contentH);
        if (contentW > 0) next = Math.min(next, w / contentW);
        next = Math.min(1, next);
        if (!Number.isFinite(next) || next <= 0) next = 1;

        setScale((prev) => (Math.abs(prev - next) < 0.02 ? prev : next));
      });
    };

    recompute();

    if (typeof ResizeObserver === 'undefined') {
      return () => cancelAnimationFrame(raf);
    }

    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, event.id, event.title, serial, assetName, assetModel, customer, title, desc]);

  const Button = (
    <button
      className="text-xs opacity-80 hover:opacity-100"
      title='Devolver a "Sin programación"'
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onUnschedule();
      }}
    >
      ↩
    </button>
  );

  if (view !== Views.DAY) {
    return (
      <div ref={outerRef} className="h-full overflow-hidden">
        <div
          ref={innerRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: scale < 1 ? `${100 / scale}%` : '100%',
          }}
          className="h-full"
        >
          <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="leading-tight whitespace-normal break-words">{event.title}</div>
          <div className="text-[11px] opacity-90 leading-tight whitespace-normal break-words">
            {[assetName || so.assetCode, assetModel, customer].filter(Boolean).join(' · ')}
          </div>
        </div>
        {Button}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={outerRef} className="h-full overflow-hidden">
      <div
        ref={innerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: scale < 1 ? `${100 / scale}%` : '100%',
          whiteSpace: 'normal',
        }}
        className="h-full"
      >
        <div className="flex items-start justify-between gap-2">
        <div>
          {serial ? <div style={{ fontWeight: 700 }}>{serial}</div> : null}
          <div style={{ fontWeight: 700 }}>{[assetName || so.assetCode, assetModel].filter(Boolean).join(' · ')}</div>
          {customer ? <div style={{ fontSize: 12, opacity: 0.95 }}>{customer}</div> : null}
          <div style={{ fontWeight: 600 }}>{title}</div>
        </div>
        {Button}
      </div>
        {desc ? <div style={{ fontSize: 12, opacity: 0.9 }}>{desc}</div> : null}
      </div>
    </div>
  );
}
