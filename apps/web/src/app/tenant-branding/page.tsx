'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

type TenantBranding = {
  id: string;
  slug: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  dashboardWorkHoursPerDay?: number | null;
  dashboardWorkMonday?: boolean | null;
  dashboardWorkMondayStartTime?: string | null;
  dashboardWorkMondayEndTime?: string | null;
  dashboardWorkMondayMealBreakMinutes?: number | null;
  dashboardWorkTuesday?: boolean | null;
  dashboardWorkTuesdayStartTime?: string | null;
  dashboardWorkTuesdayEndTime?: string | null;
  dashboardWorkTuesdayMealBreakMinutes?: number | null;
  dashboardWorkWednesday?: boolean | null;
  dashboardWorkWednesdayStartTime?: string | null;
  dashboardWorkWednesdayEndTime?: string | null;
  dashboardWorkWednesdayMealBreakMinutes?: number | null;
  dashboardWorkThursday?: boolean | null;
  dashboardWorkThursdayStartTime?: string | null;
  dashboardWorkThursdayEndTime?: string | null;
  dashboardWorkThursdayMealBreakMinutes?: number | null;
  dashboardWorkFriday?: boolean | null;
  dashboardWorkFridayStartTime?: string | null;
  dashboardWorkFridayEndTime?: string | null;
  dashboardWorkFridayMealBreakMinutes?: number | null;
  dashboardWorkSaturday?: boolean | null;
  dashboardWorkSaturdayStartTime?: string | null;
  dashboardWorkSaturdayEndTime?: string | null;
  dashboardWorkSaturdayMealBreakMinutes?: number | null;
  dashboardWorkSunday?: boolean | null;
  dashboardWorkSundayStartTime?: string | null;
  dashboardWorkSundayEndTime?: string | null;
  dashboardWorkSundayMealBreakMinutes?: number | null;
  dashboardExcludeNonWorkingDates?: boolean | null;
  dashboardNonWorkingDates?: string[] | null;
  updatedAt?: string | null;
};

type DashboardDayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

type DashboardDaySchedule = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  mealBreakMinutes: string;
};

const dashboardDayFields = [
  {
    key: 'monday',
    label: 'Lunes',
    enabledField: 'dashboardWorkMonday',
    startField: 'dashboardWorkMondayStartTime',
    endField: 'dashboardWorkMondayEndTime',
    mealField: 'dashboardWorkMondayMealBreakMinutes',
    defaultEnabled: true,
  },
  {
    key: 'tuesday',
    label: 'Martes',
    enabledField: 'dashboardWorkTuesday',
    startField: 'dashboardWorkTuesdayStartTime',
    endField: 'dashboardWorkTuesdayEndTime',
    mealField: 'dashboardWorkTuesdayMealBreakMinutes',
    defaultEnabled: true,
  },
  {
    key: 'wednesday',
    label: 'Miercoles',
    enabledField: 'dashboardWorkWednesday',
    startField: 'dashboardWorkWednesdayStartTime',
    endField: 'dashboardWorkWednesdayEndTime',
    mealField: 'dashboardWorkWednesdayMealBreakMinutes',
    defaultEnabled: true,
  },
  {
    key: 'thursday',
    label: 'Jueves',
    enabledField: 'dashboardWorkThursday',
    startField: 'dashboardWorkThursdayStartTime',
    endField: 'dashboardWorkThursdayEndTime',
    mealField: 'dashboardWorkThursdayMealBreakMinutes',
    defaultEnabled: true,
  },
  {
    key: 'friday',
    label: 'Viernes',
    enabledField: 'dashboardWorkFriday',
    startField: 'dashboardWorkFridayStartTime',
    endField: 'dashboardWorkFridayEndTime',
    mealField: 'dashboardWorkFridayMealBreakMinutes',
    defaultEnabled: true,
  },
  {
    key: 'saturday',
    label: 'Sabado',
    enabledField: 'dashboardWorkSaturday',
    startField: 'dashboardWorkSaturdayStartTime',
    endField: 'dashboardWorkSaturdayEndTime',
    mealField: 'dashboardWorkSaturdayMealBreakMinutes',
    defaultEnabled: false,
  },
  {
    key: 'sunday',
    label: 'Domingo',
    enabledField: 'dashboardWorkSunday',
    startField: 'dashboardWorkSundayStartTime',
    endField: 'dashboardWorkSundayEndTime',
    mealField: 'dashboardWorkSundayMealBreakMinutes',
    defaultEnabled: false,
  },
] as const;

function toInput(v?: string | null) {
  return v ?? '';
}

function toChecked(v: boolean | null | undefined, fallback = false) {
  return v ?? fallback;
}

function buildDefaultDashboardSchedule(): Record<DashboardDayKey, DashboardDaySchedule> {
  return Object.fromEntries(
    dashboardDayFields.map((day) => [
      day.key,
      {
        enabled: day.defaultEnabled,
        startTime: '08:00',
        endTime: '17:00',
        mealBreakMinutes: '60',
      },
    ]),
  ) as Record<DashboardDayKey, DashboardDaySchedule>;
}

function buildDashboardScheduleFromData(data?: TenantBranding | null): Record<DashboardDayKey, DashboardDaySchedule> {
  const schedule = buildDefaultDashboardSchedule();
  if (!data) return schedule;

  for (const day of dashboardDayFields) {
    schedule[day.key] = {
      enabled: toChecked((data as any)[day.enabledField], day.defaultEnabled),
      startTime: String((data as any)[day.startField] ?? '08:00'),
      endTime: String((data as any)[day.endField] ?? '17:00'),
      mealBreakMinutes: String((data as any)[day.mealField] ?? 60),
    };
  }

  return schedule;
}

function isValidClock(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function toClockMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function getNetHours(schedule: DashboardDaySchedule) {
  if (!schedule.enabled || !isValidClock(schedule.startTime) || !isValidClock(schedule.endTime)) return 0;
  const mealBreakMinutes = Number(schedule.mealBreakMinutes);
  if (!Number.isFinite(mealBreakMinutes) || mealBreakMinutes < 0) return 0;
  const totalMinutes = toClockMinutes(schedule.endTime) - toClockMinutes(schedule.startTime) - Math.trunc(mealBreakMinutes);
  return totalMinutes > 0 ? totalMinutes / 60 : 0;
}

function normalizeNonWorkingDates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)),
    ),
  ).sort();
}

export default function TenantBrandingPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const { data, error, isLoading, mutate } = useApiSWR<TenantBranding>(
    auth.token && auth.tenantSlug && isAdmin ? '/tenant-branding' : null,
    auth.token,
    auth.tenantSlug,
  );

  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [dashboardSchedule, setDashboardSchedule] = useState<Record<DashboardDayKey, DashboardDaySchedule>>(buildDefaultDashboardSchedule());
  const [dashboardExcludeNonWorkingDates, setDashboardExcludeNonWorkingDates] = useState(false);
  const [dashboardNonWorkingDates, setDashboardNonWorkingDates] = useState<string[]>([]);
  const [nonWorkingDateDraft, setNonWorkingDateDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const totalWeeklyNetHours = dashboardDayFields.reduce((total, day) => {
    return total + getNetHours(dashboardSchedule[day.key]);
  }, 0);

  const activeDashboardDays = dashboardDayFields.reduce((count, day) => {
    return count + (dashboardSchedule[day.key]?.enabled ? 1 : 0);
  }, 0);

  useEffect(() => {
    if (!data) return;
    setLegalName(toInput(data.legalName));
    setTaxId(toInput(data.taxId));
    setAddress(toInput(data.address));
    setPhone(toInput(data.phone));
    setEmail(toInput(data.email));
    setWebsite(toInput(data.website));
    setLogoUrl(toInput(data.logoUrl));
    setDashboardSchedule(buildDashboardScheduleFromData(data));
    setDashboardExcludeNonWorkingDates(Boolean(data.dashboardExcludeNonWorkingDates));
    setDashboardNonWorkingDates(normalizeNonWorkingDates(data.dashboardNonWorkingDates));
    setNonWorkingDateDraft('');
  }, [data?.id, data?.updatedAt]);

  async function save() {
    if (!auth.token || !auth.tenantSlug || !isAdmin) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      const schedulePayload = dashboardDayFields.reduce<Record<string, string | number | boolean>>((acc, day) => {
        const config = dashboardSchedule[day.key];
        if (!config) return acc;

        const mealBreakMinutes = Number(config.mealBreakMinutes);
        if (config.enabled) {
          if (!isValidClock(config.startTime) || !isValidClock(config.endTime)) {
            throw new Error(`${day.label}: usa horas validas en formato HH:MM.`);
          }
          if (!Number.isFinite(mealBreakMinutes) || mealBreakMinutes < 0 || mealBreakMinutes > 600) {
            throw new Error(`${day.label}: el tiempo de alimentacion debe estar entre 0 y 600 minutos.`);
          }
          if (getNetHours(config) <= 0) {
            throw new Error(`${day.label}: la hora fin debe ser mayor a la hora inicio y al tiempo de alimentacion.`);
          }
        }

        acc[day.enabledField] = config.enabled;
        acc[day.startField] = config.startTime;
        acc[day.endField] = config.endTime;
        acc[day.mealField] = Number.isFinite(mealBreakMinutes) ? Math.trunc(mealBreakMinutes) : 0;
        return acc;
      }, {});

      if (!Object.values(dashboardSchedule).some((day) => day.enabled)) {
        throw new Error('Selecciona al menos un dia laboral para el dashboard.');
      }

      const normalizedNonWorkingDates = normalizeNonWorkingDates(dashboardNonWorkingDates);

      await apiFetch('/tenant-branding', {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          legalName,
          taxId,
          address,
          phone,
          email,
          website,
          logoUrl,
          ...schedulePayload,
          dashboardExcludeNonWorkingDates,
          dashboardNonWorkingDates: normalizedNonWorkingDates,
        },
      });
      setMsg('Branding actualizado.');
      await mutate();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo actualizar el branding');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado. Esta configuración es solo para ADMIN.</div>;

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Branding del Tenant</h1>
        <div className="text-sm text-gray-600">
          Configura cómo aparece tu empresa en cotizaciones y reportes.
        </div>
      </div>

      {isLoading ? <div className="text-sm text-gray-600">Cargando…</div> : null}
      {error ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{(error as any).message}</div> : null}
      {err ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{err}</div> : null}
      {msg ? <div className="text-sm text-green-700 bg-green-50 border rounded p-3">{msg}</div> : null}

      <div className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tenant</label>
            <input className="border rounded px-3 py-2 w-full bg-gray-50" value={data?.name ?? ''} readOnly />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Slug</label>
            <input className="border rounded px-3 py-2 w-full bg-gray-50 font-mono" value={data?.slug ?? ''} readOnly />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Razón social</label>
          <input className="border rounded px-3 py-2 w-full" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">NIT / Tax ID</label>
            <input className="border rounded px-3 py-2 w-full" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Teléfono</label>
            <input className="border rounded px-3 py-2 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Dirección</label>
          <input className="border rounded px-3 py-2 w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input className="border rounded px-3 py-2 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Sitio web</label>
            <input className="border rounded px-3 py-2 w-full" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">URL del logo</label>
          <input className="border rounded px-3 py-2 w-full" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>

        <div className="border rounded p-4 bg-gray-50 space-y-3">
          <div>
            <div className="text-sm font-medium">Jornada laboral para dashboard</div>
            <div className="text-xs text-gray-600">
              Esta configuracion se usa para calcular horas disponibles y porcentaje de utilizacion de tecnicos.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-md border bg-white px-3 py-2">
              <div className="text-xs text-gray-500">Total de horas semanales</div>
              <div className="text-lg font-semibold text-gray-900">{totalWeeklyNetHours.toFixed(2)} h</div>
            </div>
            <div className="rounded-md border bg-white px-3 py-2">
              <div className="text-xs text-gray-500">Dias laborales activos</div>
              <div className="text-lg font-semibold text-gray-900">{activeDashboardDays}</div>
            </div>
          </div>

          <div className="space-y-2 overflow-x-auto">
            <div className="min-w-[530px] space-y-2">
              <div className="grid grid-cols-[120px_96px_96px_110px_80px] gap-2 text-xs font-medium text-gray-600 px-1">
                <div>Dia</div>
                <div>Inicio</div>
                <div>Fin</div>
                <div>Alimentacion</div>
                <div>Neto</div>
              </div>
              <div className="space-y-2">
                {dashboardDayFields.map((day) => {
                  const config = dashboardSchedule[day.key];
                  const netHours = getNetHours(config);
                  return (
                    <div key={day.key} className="grid grid-cols-[120px_96px_96px_110px_80px] gap-2 items-center">
                      <label className="flex items-center gap-2 border rounded px-3 py-2 bg-white">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(e) =>
                            setDashboardSchedule((current) => ({
                              ...current,
                              [day.key]: {
                                ...current[day.key],
                                enabled: e.target.checked,
                              },
                            }))
                          }
                        />
                        <span className="text-sm">{day.label}</span>
                      </label>
                      <input
                        type="time"
                        className="border rounded px-3 py-2 w-full bg-white disabled:bg-gray-100"
                        value={config.startTime}
                        disabled={!config.enabled}
                        onChange={(e) =>
                          setDashboardSchedule((current) => ({
                            ...current,
                            [day.key]: {
                              ...current[day.key],
                              startTime: e.target.value,
                            },
                          }))
                        }
                      />
                      <input
                        type="time"
                        className="border rounded px-3 py-2 w-full bg-white disabled:bg-gray-100"
                        value={config.endTime}
                        disabled={!config.enabled}
                        onChange={(e) =>
                          setDashboardSchedule((current) => ({
                            ...current,
                            [day.key]: {
                              ...current[day.key],
                              endTime: e.target.value,
                            },
                          }))
                        }
                      />
                      <input
                        type="number"
                        min="0"
                        max="600"
                        step="5"
                        className="border rounded px-3 py-2 w-full bg-white disabled:bg-gray-100"
                        value={config.mealBreakMinutes}
                        disabled={!config.enabled}
                        onChange={(e) =>
                          setDashboardSchedule((current) => ({
                            ...current,
                            [day.key]: {
                              ...current[day.key],
                              mealBreakMinutes: e.target.value,
                            },
                          }))
                        }
                      />
                      <div className="text-sm font-medium text-gray-700 px-2">{netHours ? `${netHours.toFixed(2)} h` : '0 h'}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-gray-500">
              El tiempo neto de cada dia se calcula como hora fin menos hora inicio menos alimentacion.
            </div>
          </div>
        </div>

        <div className="border rounded p-4 bg-gray-50 space-y-3">
          <div>
            <div className="text-sm font-medium">Feriados y dias no laborados</div>
            <div className="text-xs text-gray-600">
              Puedes registrar fechas puntuales para descontarlas del calculo de horas disponibles del dashboard.
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={dashboardExcludeNonWorkingDates}
              onChange={(e) => setDashboardExcludeNonWorkingDates(e.target.checked)}
            />
            Descontar estas fechas del dashboard
          </label>

          <div className="flex flex-col md:flex-row gap-2 md:items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium">Agregar fecha</label>
              <input
                type="date"
                className="border rounded px-3 py-2 w-full"
                value={nonWorkingDateDraft}
                onChange={(e) => setNonWorkingDateDraft(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="px-3 py-2 border rounded bg-white"
              onClick={() => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(nonWorkingDateDraft)) return;
                setDashboardNonWorkingDates((current) =>
                  Array.from(new Set([...current, nonWorkingDateDraft])).sort(),
                );
                setNonWorkingDateDraft('');
              }}
              disabled={!/^\d{4}-\d{2}-\d{2}$/.test(nonWorkingDateDraft)}
            >
              Agregar fecha
            </button>
          </div>

          {dashboardNonWorkingDates.length ? (
            <div className="flex flex-wrap gap-2">
              {dashboardNonWorkingDates.map((date) => (
                <div key={date} className="flex items-center gap-2 border rounded-full px-3 py-1 bg-white text-sm">
                  <span>{date}</span>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() =>
                      setDashboardNonWorkingDates((current) => current.filter((item) => item !== date))
                    }
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-500">No hay fechas no laboradas configuradas.</div>
          )}
        </div>

        {logoUrl.trim() ? (
          <div className="border rounded p-3 bg-gray-50">
            <div className="text-xs text-gray-600 mb-2">Vista previa</div>
            <img
              src={logoUrl}
              alt="Logo tenant"
              className="h-14 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 border rounded"
            onClick={() => {
              setLegalName(toInput(data?.legalName));
              setTaxId(toInput(data?.taxId));
              setAddress(toInput(data?.address));
              setPhone(toInput(data?.phone));
              setEmail(toInput(data?.email));
              setWebsite(toInput(data?.website));
              setLogoUrl(toInput(data?.logoUrl));
              setDashboardSchedule(buildDashboardScheduleFromData(data));
              setDashboardExcludeNonWorkingDates(Boolean(data?.dashboardExcludeNonWorkingDates));
              setDashboardNonWorkingDates(normalizeNonWorkingDates(data?.dashboardNonWorkingDates));
              setNonWorkingDateDraft('');
            }}
            disabled={busy}
          >
            Restaurar
          </button>
          <button className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50" disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar configuracion'}
          </button>
        </div>
      </div>
    </div>
  );
}
