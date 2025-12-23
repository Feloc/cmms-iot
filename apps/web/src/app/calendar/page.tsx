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

function buildTitle(so: ServiceOrder) {
  const bits: string[] = [];
  bits.push(so.assetCode);
  if (so.serviceOrderType) bits.push(so.serviceOrderType);
  const c = so.asset?.customer;
  if (c) bits.push(`(${c})`);
  return bits.join(' · ');
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [view, setView] = useState<View>(Views.WEEK);
  const [date, setDate] = useState<Date>(new Date());
  const [onlyTechId, setOnlyTechId] = useState<string>(''); // filtro
  const [techs, setTechs] = useState<User[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const resources: Resource[] = useMemo(() => {
    const list: Resource[] = [{ id: UNASSIGNED, title: 'Sin asignar' }, ...techs.map((t) => ({ id: t.id, title: t.name }))];
    return onlyTechId ? list.filter((r) => r.id === onlyTechId) : list;
  }, [techs, onlyTechId]);

  async function loadTechs() {
    if (!auth.token || !auth.tenantSlug) return;
    try {
      const data = await apiFetch<User[]>('/users?role=TECH', { token: auth.token, tenantSlug: auth.tenantSlug });
      setTechs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message ?? 'Error cargando técnicos');
    }
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
        return {
          id: so.id,
          title: buildTitle(so),
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

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    loadTechs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug]);

  useEffect(() => {
    if (!auth.token || !auth.tenantSlug) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, view, date, onlyTechId]);

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
    // Persistimos duración (durationMin) calculada desde start/end.
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

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Calendario</div>
          <div className="text-sm text-gray-600">
            Swimlanes por técnico (columnas). Arrastra para mover fecha/hora, cambiar técnico y estira para ajustar duración.
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

      <div className="border rounded overflow-hidden">
        <DndProvider backend={HTML5Backend}>
          <DragAndDropCalendar
            localizer={localizer}
            culture="es"
            messages={messagesEs as any}
            events={events}
            defaultView={Views.WEEK}
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
            selectable={false}
            resizable
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            style={{ height: 750 }}
            onSelectEvent={(e) => {
              window.location.href = `/service-orders/${e.id}`;
            }}
          />
        </DndProvider>
      </div>

      <div className="text-xs text-gray-600">
        Tip: arrastra entre columnas para cambiar el técnico. Arrastra en el tiempo para cambiar la hora. Estira (resize) para cambiar la duración.
      </div>
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
