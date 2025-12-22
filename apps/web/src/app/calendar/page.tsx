'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
 

type User = { id: string; name: string; email: string; role: string };
type ServiceOrder = {
  id: string;
  title: string;
  dueDate?: string | null;
  assetCode: string;
  serviceOrderType?: string | null;
  assignments?: Array<{ role: string; state: string; user?: User | null }>;
};

type Paginated<T> = { items: T[]; total: number; page: number; size: number };

export default function CalendarPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const [techId, setTechId] = useState('');

  const { data: techs } = useApiSWR<User[]>(`/users?role=TECH`, auth.token, auth.tenantSlug);

  const listPath = useMemo(() => {
    if (!auth.token || !auth.tenantSlug || !range.start || !range.end) return null;
    const qs = new URLSearchParams({
      start: range.start,
      end: range.end,
      page: '1',
      size: '500',
    });
    if (techId) qs.set('technicianId', techId);
    return `/service-orders?${qs.toString()}`;
  }, [auth.token, auth.tenantSlug, range.start, range.end, techId]);

  const { data, mutate } = useApiSWR<Paginated<ServiceOrder>>(listPath, auth.token, auth.tenantSlug);

  const events = (data?.items ?? [])
    .filter(so => !!so.dueDate)
    .map(so => {
      const tech = so.assignments?.find(a => a.role === 'TECHNICIAN' && a.state === 'ACTIVE')?.user;
      return {
        id: so.id,
        title: `${so.assetCode} · ${so.serviceOrderType ?? ''}`.trim(),
        start: so.dueDate!,
        end: new Date(new Date(so.dueDate!).getTime() + 60*60*1000).toISOString(),
        extendedProps: { techId: tech?.id ?? '', techName: tech?.name ?? '' },
      };
    });

  async function reschedule(event: any) {
    const id = event.event.id as string;
    const start = event.event.start as Date;
    const techId = event.event.extendedProps?.techId as string | undefined;
    await apiFetch(`/service-orders/${id}/schedule`, {
      method: 'PATCH',
      token: auth.token!,
      tenantSlug: auth.tenantSlug!,
      body: { dueDate: start.toISOString(), technicianId: techId || undefined },
    });
    mutate();
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Calendario (OS)</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm">Técnico</label>
          <select className="border rounded px-2 py-1" value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">Todos</option>
            {(techs ?? []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="px-3 py-2 border rounded" onClick={() => router.push('/service-orders')}>Lista</button>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          nowIndicator
          editable
          selectable={false}
          eventDrop={reschedule}
          eventClick={(info) => router.push(`/service-orders/${info.event.id}`)}
          datesSet={(arg) => {
            setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() });
          }}
          events={events as any}
          height="auto"
        />
      </div>
    </div>
  );
}
