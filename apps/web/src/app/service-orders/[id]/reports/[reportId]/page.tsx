'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiBase } from '@/lib/api';

type User = { id: string; name: string; email: string; role: string };

type Report = {
  id: string;
  audience: 'CUSTOMER' | 'INTERNAL';
  version: number;
  createdAt: string;
  createdByUserId: string;
  data: any;
};

type PhotoItem = { filename: string; url: string };

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtMins(mins?: number | null) {
  if (mins === null || mins === undefined) return '-';
  if (!isFinite(mins)) return '-';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} h ${m} min`;
}

function workLogDurationMinutes(startedAt?: string | null, endedAt?: string | null) {
  if (!startedAt || !endedAt) return 0;
  const a = new Date(startedAt);
  const b = new Date(endedAt);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function audienceLabel(aud: Report['audience']) {
  return aud === 'CUSTOMER' ? 'Cliente' : 'Interno';
}

function normalizeImageFilename(v: any): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (!v || typeof v !== 'object') return null;
  const candidate = v.filename ?? v.name ?? v.file ?? v.path;
  if (typeof candidate !== 'string') return null;
  const safe = candidate.trim();
  return safe || null;
}

function toChecklistView(raw: any): { templateName?: string; items: Array<{ label: string; done: boolean; notes?: string; required?: boolean }> } {
  if (!raw) return { items: [] };
  if (Array.isArray(raw)) {
    return {
      items: raw.map((it: any, idx: number) => ({
        label: String(it?.label ?? it?.name ?? `Ítem ${idx + 1}`),
        done: !!(it?.done ?? it?.checked),
        notes: it?.notes ? String(it.notes) : '',
        required: !!it?.required,
      })),
    };
  }
  if (Array.isArray(raw?.items)) {
    return {
      templateName: raw?.templateName ? String(raw.templateName) : undefined,
      items: raw.items.map((it: any, idx: number) => ({
        label: String(it?.label ?? it?.name ?? `Ítem ${idx + 1}`),
        done: !!(it?.done ?? it?.checked),
        notes: it?.notes ? String(it.notes) : '',
        required: !!it?.required,
      })),
    };
  }
  return { items: [] };
}

function resolveChecklist(formData: any, soTypeKey: string) {
  const byType = (formData?.checklists && typeof formData.checklists === 'object') ? formData.checklists : {};
  let selected: any = null;

  if (soTypeKey) {
    selected =
      (byType as any)[soTypeKey] ??
      (byType as any)[soTypeKey.toLowerCase()] ??
      Object.entries(byType as Record<string, any>).find(([k]) => String(k).toUpperCase() === soTypeKey)?.[1] ??
      null;
  }
  if (!selected) {
    const first = Object.values(byType as any)[0];
    if (first) selected = first;
  }
  if (!selected && formData?.checklist) selected = formData.checklist;

  const view = toChecklistView(selected);
  if (view.items.length > 0) return view;

  if (formData?.checked && typeof formData.checked === 'object') {
    const items = Object.entries(formData.checked as Record<string, any>).map(([label, val]) => ({
      label,
      done: !!val,
      notes: '',
      required: false,
    }));
    return { items };
  }
  return { items: [] };
}

export default function ServiceOrderReportPage() {
  const { id, reportId } = useParams<{ id: string; reportId: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (auth.token) h['Authorization'] = `Bearer ${auth.token}`;
    if (auth.tenantSlug) h['x-tenant'] = auth.tenantSlug;
    return h;
  }, [auth.token, auth.tenantSlug]);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [photosErr, setPhotosErr] = useState('');

  const { data, error, isLoading } = useApiSWR<Report>(
    id && reportId ? `/service-orders/${id}/reports/${reportId}` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: liveSo } = useApiSWR<any>(
    id ? `/service-orders/${id}` : null,
    auth.token,
    auth.tenantSlug,
  );
  const { data: liveHourmeter } = useApiSWR<any>(
    id ? `/service-orders/${id}/hourmeter?limit=5` : null,
    auth.token,
    auth.tenantSlug,
  );

  function revokeAll(list: PhotoItem[]) {
    for (const it of list) {
      try {
        URL.revokeObjectURL(it.url);
      } catch {}
    }
  }

  // Cargar fotos como blobs para que funcionen con auth + tenant (y se impriman en PDF)
  const imageKey = Array.isArray((data as any)?.data?.images)
    ? ((data as any).data.images as any[]).map(normalizeImageFilename).filter(Boolean).join('|')
    : '';

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (!auth.token || !auth.tenantSlug) return;
      if (!data) return;

      const snapshotFiles = Array.isArray((data as any)?.data?.images)
        ? ((data as any).data.images as any[]).map(normalizeImageFilename).filter((v): v is string => !!v)
        : [];
      let files = snapshotFiles;
      if (!files.length) {
        const listResp = await fetch(`${apiBase}/service-orders/${id}/attachments?type=IMAGE`, {
          method: 'GET',
          headers,
        });
        if (listResp.ok) {
          const json = await listResp.json().catch(() => ({ items: [] as string[] }));
          files = Array.isArray(json?.items) ? (json.items as any[]).map(normalizeImageFilename).filter((v): v is string => !!v) : [];
        }
      }
      files = Array.from(new Set(files));
      if (!files.length) {
        setPhotos((prev) => {
          revokeAll(prev);
          return [];
        });
        return;
      }

      setPhotosBusy(true);
      setPhotosErr('');
      try {
        const next: PhotoItem[] = [];
        for (const filename of files) {
          const r = await fetch(`${apiBase}/service-orders/${id}/attachments/IMAGE/${encodeURIComponent(filename)}`, {
            method: 'GET',
            headers,
          });
          if (!r.ok) continue;
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          next.push({ filename, url });
        }

        if (cancelled) {
          revokeAll(next);
          return;
        }

        setPhotos((prev) => {
          revokeAll(prev);
          return next;
        });
      } catch (e: any) {
        if (!cancelled) setPhotosErr(e?.message ?? 'Error cargando fotos');
      } finally {
        if (!cancelled) setPhotosBusy(false);
      }
    }

    loadPhotos();
    return () => {
      cancelled = true;
      setPhotos((prev) => {
        revokeAll(prev);
        return [];
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.token, auth.tenantSlug, id, reportId, imageKey]);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {(error as any).message}</div>;
  if (!data) return <div className="p-6">No encontrado.</div>;

  const snap = data.data ?? {};
  const tenant = snap.tenant ?? null;
  const so = (snap.serviceOrder && typeof snap.serviceOrder === 'object') ? snap.serviceOrder : (liveSo ?? {});
  const asset = snap.asset ?? liveSo?.asset ?? null;
  const op = snap.operationalTimes ?? { segments: [] };
  const parts = snap.parts ?? null;
  const hourmeter = snap.hourmeter ?? { latest: null, byOrder: [] };

  const formData = (so.formData && typeof so.formData === 'object')
    ? so.formData
    : ((liveSo?.formData && typeof liveSo.formData === 'object') ? liveSo.formData : {});
  const notes = String(formData?.notes ?? '').trim();
  const result = String(formData?.result ?? '').trim();
  const soTypeKey = String(so.serviceOrderType ?? '').toUpperCase();
  const checklistView = resolveChecklist(formData, soTypeKey);
  const checklistItems = checklistView.items;

  const rawWorkLogs = (Array.isArray(snap.workLogs) && snap.workLogs.length > 0)
    ? snap.workLogs
    : (Array.isArray(liveSo?.workLogs) ? liveSo.workLogs : []);
  const workLogs = rawWorkLogs as Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt?: string | null;
    user?: User | null;
  }>;

  const participants = Array.from(
    workLogs
      .reduce((acc, wl) => {
        const key = String(wl.userId || '').trim();
        if (!key) return acc;
        const cur = acc.get(key) ?? { userId: key, name: wl.user?.name ?? key, logs: 0, minutes: 0 };
        cur.logs += 1;
        cur.minutes += workLogDurationMinutes(wl.startedAt, wl.endedAt ?? null);
        if (wl.user?.name) cur.name = wl.user.name;
        acc.set(key, cur);
        return acc;
      }, new Map<string, { userId: string; name: string; logs: number; minutes: number }>())
      .values(),
  ).sort((a, b) => b.minutes - a.minutes);
  const technicians = participants.map((p) => p.name).filter(Boolean);
  const visibleSegments = (op.segments ?? []).filter((s: any) => {
    const label = String(s?.label ?? '').toLowerCase();
    const key = String(s?.key ?? '').toLowerCase();
    return !label.includes('desplazamiento') && key !== 'travel' && key !== 'desplazamiento';
  });
  const requiredParts = Array.isArray(parts?.required)
    ? parts.required
    : (Array.isArray(liveSo?.serviceOrderParts) ? liveSo.serviceOrderParts.filter((p: any) => String(p?.stage ?? 'REQUIRED') === 'REQUIRED') : []);
  const replacedParts = Array.isArray(parts?.replaced)
    ? parts.replaced
    : (Array.isArray(liveSo?.serviceOrderParts) ? liveSo.serviceOrderParts.filter((p: any) => String(p?.stage ?? 'REQUIRED') === 'REPLACED') : []);
  const hasParts = requiredParts.length > 0 || replacedParts.length > 0;
  const hourmeterReading =
    ((hourmeter?.byOrder ?? [])[0]?.reading ?? null) ??
    (hourmeter?.latest?.reading ?? null) ??
    ((liveHourmeter?.byOrder ?? [])[0]?.reading ?? null) ??
    (liveHourmeter?.latest?.reading ?? null);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-sm text-gray-600">{audienceLabel(data.audience)} · v{data.version}</div>
          <h1 className="text-2xl font-semibold">Resumen de Orden de Servicio</h1>
          <div className="text-sm text-gray-600">Generado: {fmtDateTime(data.createdAt)}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" className="px-3 py-2 border rounded" onClick={() => window.print()}>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {/* Branding tenant */}
      <section className="border rounded p-4">
        <div className="flex items-center gap-4">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
          ) : null}
          <div className="space-y-0.5">
            <div className="font-semibold">{tenant?.legalName ?? tenant?.name ?? 'Tenant'}</div>
            <div className="text-sm text-gray-600">
              {tenant?.taxId ? `NIT: ${tenant.taxId}` : null}
              {tenant?.taxId && tenant?.phone ? ' · ' : null}
              {tenant?.phone ? `Tel: ${tenant.phone}` : null}
            </div>
            <div className="text-sm text-gray-600">
              {tenant?.address ?? ''}
              {(tenant?.address && (tenant?.email || tenant?.website)) ? ' · ' : null}
              {tenant?.email ?? ''}
              {(tenant?.email && tenant?.website) ? ' · ' : null}
              {tenant?.website ?? ''}
            </div>
          </div>
        </div>
      </section>

      {/* Datos OS */}
      <section className="border rounded p-4 space-y-3">
        <div>
          <div className="text-lg font-semibold">{so.title}</div>
          {so.description ? <div className="text-sm text-gray-700 whitespace-pre-wrap">{so.description}</div> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded p-3">
            <div className="font-medium mb-1">Activo</div>
            <div><b>{asset?.code ?? so.assetCode ?? '-'}</b> — {asset?.name ?? '-'}</div>
            <div className="text-gray-600">Cliente: {asset?.customer ?? '-'}</div>
            <div className="text-gray-600">{asset?.brand ?? ''} {asset?.model ?? ''} {asset?.serialNumber ? `· SN: ${asset.serialNumber}` : ''}</div>
          </div>
          <div className="border rounded p-3">
            <div className="font-medium mb-1">Tecnico</div>
            {technicians.length > 0 ? (
              <ul className="list-disc pl-5">
                {technicians.map((name, idx) => (
                  <li key={`${name}-${idx}`}>{name}</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-600">Sin participación registrada.</div>
            )}
          </div>
        </div>
      </section>

      {/* Tiempos operativos */}
      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Tiempos</div>
        <div className="border rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2">Tramo</th>
                <th className="text-left p-2">Inicio</th>
                <th className="text-left p-2">Fin</th>
                <th className="text-right p-2">Duración</th>
              </tr>
            </thead>
            <tbody>
              {visibleSegments.map((s: any) => (
                <tr key={s.key} className="border-b last:border-b-0">
                  <td className="p-2">{String(s.label ?? '').replace(/\s*\([^)]*\)\s*/g, '').trim()}</td>
                  <td className="p-2">{fmtDateTime(s.start)}</td>
                  <td className="p-2">{fmtDateTime(s.end)}</td>
                  <td className="p-2 text-right">{fmtMins(s.durationMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Checklist + Observaciones/Resultado */}
      <section className="border rounded p-4 space-y-4">
        <div className="font-semibold">Checklist, resultado y observaciones</div>

        {(notes || result) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {notes ? (
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Observaciones</div>
                <div className="whitespace-pre-wrap">{notes}</div>
              </div>
            ) : null}
            {result ? (
              <div className="border rounded p-3">
                <div className="font-medium mb-1">Resultado</div>
                <div className="whitespace-pre-wrap">{result}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">Checklist</div>
          {checklistItems.length > 0 ? (
            <>
              {checklistView?.templateName ? (
                <div className="text-xs text-gray-600">{checklistView.templateName}</div>
              ) : null}
              <div className="border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2">Ítem</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistItems.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="p-2">{it.label ?? '-'}</td>
                        <td className="p-2">{it.done ? 'OK' : 'Pendiente'}</td>
                        <td className="p-2">{it.notes ? <span className="whitespace-pre-wrap">{String(it.notes)}</span> : <span className="text-gray-600">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600">Sin checklist registrado.</div>
          )}
        </div>
      </section>

      {/* Horómetro */}
      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Horómetro</div>
        <div className="text-sm">
          {hourmeterReading != null ? (
            <b>{hourmeterReading} h</b>
          ) : (
            <span className="text-gray-600">Sin lectura registrada.</span>
          )}
        </div>
      </section>

      {/* Repuestos */}
      {hasParts ? (
        <section className="border rounded p-4 space-y-4">
          <div className="font-semibold">Repuestos</div>

          {requiredParts.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Necesarios (diagnóstico)</div>
              <ul className="list-disc pl-5 text-sm">
                {requiredParts.map((p: any) => (
                  <li key={p.id}>
                    {(p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? '-')}
                    <span className="text-gray-600"> · Qty: {p.qty}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {replacedParts.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Cambiados (historial)</div>
              <ul className="list-disc pl-5 text-sm">
                {replacedParts.map((p: any) => (
                  <li key={p.id}>
                    {(p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? '-')}
                    <span className="text-gray-600"> · Qty: {p.qty}</span>
                    {p.replacedAt ? <span className="text-gray-600"> · {String(p.replacedAt).slice(0, 10)}</span> : null}
                    {p.replacedByUser?.name ? <span className="text-gray-600"> · Por: {p.replacedByUser.name}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Fotos */}
      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Fotos</div>
        {photosErr ? <div className="text-sm text-red-700 whitespace-pre-wrap">{photosErr}</div> : null}
        {photosBusy ? <div className="text-sm text-gray-600">Cargando fotos…</div> : null}

        {photos.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.filename} className="border rounded p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.filename} className="w-full h-44 object-cover rounded" />
                <div className="mt-1 text-[10px] text-gray-600 break-all">{p.filename}</div>
              </div>
            ))}
          </div>
        ) : (
          !photosBusy ? <div className="text-sm text-gray-600">Sin fotos.</div> : null
        )}
      </section>

      {/* Firmas */}
      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Firmas</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded p-3">
            <div className="text-sm font-medium mb-2">Firma técnico</div>
            {so.technicianSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={so.technicianSignature} alt="Firma técnico" className="w-full h-40 object-contain border rounded bg-white" />
            ) : (
              <div className="text-sm text-gray-600">—</div>
            )}
          </div>
          <div className="border rounded p-3">
            <div className="text-sm font-medium mb-2">Firma quien recibe</div>
            {so.receiverSignature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={so.receiverSignature} alt="Firma quien recibe" className="w-full h-40 object-contain border rounded bg-white" />
            ) : (
              <div className="text-sm text-gray-600">—</div>
            )}
          </div>
        </div>
      </section>

      {/* WorkLogs (solo interno) */}
      {data.audience === 'INTERNAL' ? (
        <section className="border rounded p-4 space-y-3">
          <div className="font-semibold">WorkLogs</div>
          {workLogs.length > 0 ? (
            <div className="border rounded">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2">Técnico</th>
                    <th className="text-left p-2">Inicio</th>
                    <th className="text-left p-2">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {workLogs.map((w) => (
                    <tr key={w.id} className="border-b last:border-b-0">
                      <td className="p-2">{w.user?.name ?? w.userId}</td>
                      <td className="p-2">{fmtDateTime(w.startedAt)}</td>
                      <td className="p-2">{w.endedAt ? fmtDateTime(w.endedAt) : <span className="text-amber-700">En curso</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-gray-600">Sin worklogs.</div>
          )}
        </section>
      ) : null}

      <div className="text-xs text-gray-500">
        Consejo: para enviar al cliente, usa “Imprimir / Guardar PDF” y adjunta el PDF.
      </div>
    </div>
  );
}
