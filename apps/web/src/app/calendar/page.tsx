'use client';

import { useEffect, useMemo, useState } from 'react';
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
    name?: string | null;
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
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }), // Lunes
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

function getRange(date: Date, view: View) {
  if (view === Views.MONTH) {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return { start, end };
  }
  if (view === Views.DAY) {
    return { start: startOfDay(date), end: endOfDay(date) };
  }
  // WEEK (default)
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
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(new Date());
  const [onlyTechId, setOnlyTechId] = useState<string>(''); // filtro
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

      // Si el backend no filtra bien por rango, filtramos aquí.
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

        // Título compacto para week/month. Para day, renderizamos más info con un componente.
        const title = buildCompactTitle(so);

        return {
          id: so.id,
          title,
          start: startAt,
          end: endAt,
          resourceId: techId,
          so,
        };
      });

      const filtered = onlyTechId ? mapped.filter((e) => e.resourceId === onlyTechId) : mapped;
      setEvents(filtered);
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

      // NO enviar scheduledOnly=0 (string "0" puede ser truthy en backend).
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
      try {
        await loadTechs();
        await loadEvents();
        await loadUnscheduled();
      } catch (e: any) {
        setErr(e?.message ?? 'Error inicializando calendario');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug]);

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, view, date, onlyTechId]);

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    const t = setTimeout(() => {
      loadUnscheduled();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unscheduledQ, auth.token, auth.tenantSlug]);

  async function reschedule(soId: string, start: Date, resourceId: string, durationMin?: number | null) {
    if (!auth.token || !auth.tenantSlug) return;

    const technicianId = resourceId === UNASSIGNED ? '' : resourceId;

    await apiFetch(`/service-orders/${soId}/schedule`, {
      method: 'PATCH',
      token: auth.token,
      tenantSlug: auth.tenantSlug,
      body: {
        dueDate: start.toISOString(),
        technicianId,
        ...(durationMin !== undefined ? { durationMin } : {}),
      },
    });
  }

  const onEventDrop: withDragAndDropProps<CalEvent, Resource>['onEventDrop'] = async ({ event, start, resourceId }) => {
    try {
      setLoading(true);
      const duration =
        Math.max(15, Math.round(((event.end as Date).getTime() - (event.start as Date).getTime()) / 60000)) || DEFAULT_DURATION_MIN;
      await reschedule(event.id, start as Date, String(resourceId ?? event.resourceId), duration);
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo reprogramar');
    } finally {
      setLoading(false);
    }
  };

  const onEventResize: withDragAndDropProps<CalEvent, Resource>['onEventResize'] = async ({ event, start, end, resourceId }) => {
    try {
      setLoading(true);
      const duration = Math.max(15, Math.round(((end as Date).getTime() - (start as Date).getTime()) / 60000));
      await reschedule(event.id, start as Date, String(resourceId ?? event.resourceId), duration);
      await loadEvents();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo ajustar la duración');
    } finally {
      setLoading(false);
    }
  };

  // Drag & drop externo (pendientes -> calendario)
  const dragPreviewEvent = useMemo<CalEvent | null>(() => {
    if (!dragSo) return null;
    const startAt = new Date();
    const dur = dragSo.durationMin ?? DEFAULT_DURATION_MIN;
    const endAt = addMinutes(startAt, dur);
    return {
      id: dragSo.id,
      title: buildCompactTitle(dragSo),
      start: startAt,
      end: endAt,
      resourceId: UNASSIGNED,
      so: dragSo,
    };
  }, [dragSo]);

  const onDropFromOutside: withDragAndDropProps<CalEvent, Resource>['onDropFromOutside'] = async ({ start, resourceId }) => {
    if (!dragSo) return;
    try {
      setLoading(true);
      const techTarget = String(resourceId ?? UNASSIGNED);
      const dur = dragSo.durationMin ?? DEFAULT_DURATION_MIN;
      await reschedule(dragSo.id, start as Date, techTarget, dur);
      setDragSo(null);
      await loadEvents();
      await loadUnscheduled();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo programar desde pendientes');
    } finally {
      setLoading(false);
    }
  };

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Calendario</div>
          <div className="text-sm text-gray-600">
            Columnas por técnico. Arrastra una OS “Sin programación” al calendario para asignar técnico + fecha/hora.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LinkBack />
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
                    onMouseDown={() => setDragSo(so)} // fallback
                    onTouchStart={() => setDragSo(so)} // mobile fallback (sin drop real)
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

          <div className="text-[11px] text-gray-500 mt-3">
            Tip: arrastra un ítem y suéltalo sobre una columna (técnico) y una hora.
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
              onEventDrop={onEventDrop}
              onEventResize={onEventResize}
              // External DnD (pendientes -> calendario)
              dragFromOutsideItem={() => dragPreviewEvent}
              onDropFromOutside={onDropFromOutside}
              onDragOver={(e) => e.preventDefault()}
              style={{ height: 760 }}
              onSelectEvent={(e) => {
                window.location.href = `/service-orders/${e.id}`;
              }}
              components={{
                // Más info en el evento cuando estamos en vista Día
                event: (props: any) => <EventBox {...props} view={view} />,
              }}
              eventPropGetter={() => ({
                style: view === Views.DAY ? { whiteSpace: 'normal', lineHeight: 1.15 } : undefined,
              })}
            />
          </DndProvider>
        </div>
      </div>
    </div>
  );
}

function EventBox({ event, view }: { event: CalEvent; view: View }) {
  const so = event.so;
  const serial = so.asset?.serialNumber ? `Serie: ${so.asset.serialNumber}` : '';
  const title = so.title?.trim() ? so.title.trim() : event.title;
  const desc = so.description?.trim() ? so.description.trim() : '';

  if (view !== Views.DAY) {
    return <span>{event.title}</span>;
  }

  return (
    <div style={{ whiteSpace: 'normal' }}>
      <div style={{ fontWeight: 700 }}>{serial || so.assetCode}</div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {desc ? <div style={{ fontSize: 12, opacity: 0.9 }}>{desc}</div> : null}
    </div>
  );
}

function LinkBack() {
  return (
    <a className="px-3 py-2 border rounded" href="/service-orders">
      Lista OS
    </a>
  );
}
