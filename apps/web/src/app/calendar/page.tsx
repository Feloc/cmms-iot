'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

import { Calendar as RBCalendar, Views, dateFnsLocalizer, type View } from 'react-big-calendar';
import withDragAndDrop, { type withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { format, parse, startOfWeek, getDay, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';
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
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return { start, end };
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
  bits.push(so.assetCode);
  if (so.serviceOrderType) bits.push(so.serviceOrderType);
  const c = so.asset?.customer;
  if (c) bits.push(`(${c})`);
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
  fallback: { hoverResourceId?: string; onlyTechId?: string; currentEventResourceId?: string }
) {
  const direct = normalizeResourceId(raw);
  if (direct) return direct;
  if (fallback.hoverResourceId) return fallback.hoverResourceId;
  if (fallback.onlyTechId) return fallback.onlyTechId;
  if (fallback.currentEventResourceId) return fallback.currentEventResourceId;
  return UNASSIGNED;
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(new Date());
  const [onlyTechId, setOnlyTechId] = useState<string>('');
  const [hoverResourceId, setHoverResourceId] = useState<string>('');

  const [techs, setTechs] = useState<User[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [unscheduled, setUnscheduled] = useState<ServiceOrder[]>([]);
  const [unscheduledQ, setUnscheduledQ] = useState<string>('');
  const [dragSo, setDragSo] = useState<ServiceOrder | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const resources: Resource[] = useMemo(() => {
    const list: Resource[] = [{ id: UNASSIGNED, title: 'Sin asignar' }, ...techs.map((t) => ({ id: t.id, title: t.name }))];
    return onlyTechId ? list.filter((r) => r.id === onlyTechId) : list;
  }, [techs, onlyTechId]);

  async function loadTechs() {
    if (!auth.token || !auth.tenantSlug) return;
    const data = await apiFetch<User[]>('/users?role=TECH', { token: auth.token, tenantSlug: auth.tenantSlug });
    setTechs(Array.isArray(data) ? data : []);
  }

  async function loadEvents() {
    if (!auth.token || !auth.tenantSlug) return;
    setLoading(true);
    setErr('');
    try {
      const { start, end } = getRange(date, view);

      const qs = new URLSearchParams();
      qs.set('page', '1');
      qs.set('size', '500');
      qs.set('scheduledOnly', '1');
      qs.set('start', start.toISOString());
      qs.set('end', end.toISOString());
      if (onlyTechId && onlyTechId !== UNASSIGNED) qs.set('technicianId', onlyTechId);

      const data = await apiFetch<Paginated<ServiceOrder>>(`/service-orders?${qs.toString()}`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });

      const items = data?.items ?? [];
      const inRange = items.filter((so) => {
        if (!so.dueDate) return false;
        const d = new Date(so.dueDate);
        return d >= start && d <= end;
      });

      const mapped: CalEvent[] = inRange.map((so) => {
        const startAt = new Date(so.dueDate!);
        const dur = so.durationMin ?? DEFAULT_DURATION_MIN;
        const endAt = addMinutes(startAt, dur);
        const techId = getActiveTechnicianId(so) ?? UNASSIGNED;
        return { id: so.id, title: buildCompactTitle(so), start: startAt, end: endAt, resourceId: techId, so };
      });

      setEvents(onlyTechId ? mapped.filter((e) => e.resourceId === onlyTechId) : mapped);
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando agenda');
    } finally {
      setLoading(false);
    }
  }

  async function loadUnscheduled() {
    if (!auth.token || !auth.tenantSlug) return;
    try {
      const qs = new URLSearchParams();
      qs.set('page', '1');
      qs.set('size', '200');
      if (unscheduledQ.trim()) qs.set('q', unscheduledQ.trim());

      const data = await apiFetch<Paginated<ServiceOrder>>(`/service-orders?${qs.toString()}`, {
        token: auth.token,
        tenantSlug: auth.tenantSlug,
      });

      const items = (data?.items ?? []).filter((so) => !so.dueDate);
      setUnscheduled(items);
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando pendientes');
    }
  }

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    (async () => {
      await loadTechs();
      await loadEvents();
      await loadUnscheduled();
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

      const targetResId = bestResourceId(resourceId, {
        hoverResourceId,
        onlyTechId,
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

      const targetResId = bestResourceId(resourceId, {
        hoverResourceId,
        onlyTechId,
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

  const onDropFromOutside: withDragAndDropProps<CalEvent, Resource>['onDropFromOutside'] = async ({ start, resourceId }) => {
    if (!dragSo) return;
    setLoading(true);
    setErr('');
    try {
      const s = start as Date;
      const techTarget = bestResourceId(resourceId, { hoverResourceId, onlyTechId });
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
    const resId = props?.resource ? String(props.resource) : '';
    return (
      <div
        onMouseEnter={() => resId && setHoverResourceId(resId)}
        onDragEnter={() => resId && setHoverResourceId(resId)}
        style={{ height: '100%' }}
      >
        {props.children}
      </div>
    );
  };

  const DateCellWrapper = (props: any) => {
    const resId = props?.resource ? String(props.resource) : '';
    return (
      <div onMouseEnter={() => resId && setHoverResourceId(resId)} onDragEnter={() => resId && setHoverResourceId(resId)}>
        {props.children}
      </div>
    );
  };

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4">
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

      `}</style>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Calendario</div>
          <div className="text-sm text-gray-600">
            Columnas por técnico. Arrastra una OS “Sin programación” al calendario para asignar técnico + fecha/hora.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a className="px-3 py-2 border rounded" href="/service-orders">
            Lista OS
          </a>
          <button className="px-3 py-2 border rounded" onClick={() => { loadEvents(); loadUnscheduled(); }}>
            Actualizar
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

      {err ? <div className="p-3 border rounded text-red-700 bg-red-50">{err}</div> : null}
      {loading ? <div className="text-sm text-gray-600">Actualizando…</div> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Panel lateral */}
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
              Para “devolver” una OS al panel, usa el botón <span className="font-mono">↩</span> en el evento.
            </div>
          </div>
        </div>

        {/* Calendario */}
        <div className="border rounded overflow-hidden">
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
              dragFromOutsideItem={() => dragPreviewEvent}
              onDropFromOutside={onDropFromOutside}
              onDragOver={(e) => e.preventDefault()}
              style={{ height: 760 }}
              onDoubleClickEvent={(e) => { window.location.href = `/service-orders/${e.id}`; }}
              components={{
                event: (props: any) => <EventBox {...props} view={view} onUnschedule={() => unscheduleSo(props.event.id)} />,
                timeSlotWrapper: TimeSlotWrapper,
                dateCellWrapper: DateCellWrapper,
              }}
              eventPropGetter={(event) => {
                const base = view === Views.DAY ? { whiteSpace: 'normal', lineHeight: 1.15 } : undefined;
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

function EventBox({ event, view, onUnschedule }: { event: CalEvent; view: View; onUnschedule: () => void }) {
  const so = event.so;
  const serial = so.asset?.serialNumber ? `Serie: ${so.asset.serialNumber}` : '';
  const title = so.title?.trim() ? so.title.trim() : event.title;
  const desc = so.description?.trim() ? so.description.trim() : '';

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
      <div className="flex items-start justify-between gap-2">
        <span>{event.title}</span>
        {Button}
      </div>
    );
  }

  return (
    <div style={{ whiteSpace: 'normal' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div style={{ fontWeight: 700 }}>{serial || so.assetCode}</div>
          <div style={{ fontWeight: 600 }}>{title}</div>
        </div>
        {Button}
      </div>
      {desc ? <div style={{ fontSize: 12, opacity: 0.9 }}>{desc}</div> : null}
    </div>
  );
}
