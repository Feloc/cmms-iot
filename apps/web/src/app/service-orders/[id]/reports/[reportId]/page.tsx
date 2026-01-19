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

function audienceLabel(aud: Report['audience']) {
  return aud === 'CUSTOMER' ? 'Cliente' : 'Interno';
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

  function revokeAll(list: PhotoItem[]) {
    for (const it of list) {
      try {
        URL.revokeObjectURL(it.url);
      } catch {}
    }
  }

  // Cargar fotos como blobs para que funcionen con auth + tenant (y se impriman en PDF)
  const imageKey = Array.isArray((data as any)?.data?.images)
    ? ((data as any).data.images as string[]).join('|')
    : '';

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      if (!auth.token || !auth.tenantSlug) return;
      if (!data) return;

      const files = Array.isArray((data as any)?.data?.images) ? ((data as any).data.images as string[]) : [];
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
  const so = snap.serviceOrder ?? {};
  const asset = snap.asset ?? null;
  const op = snap.operationalTimes ?? { segments: [] };
  const parts = snap.parts ?? { required: [], replaced: [] };

  const formData = so.formData ?? {};
  const notes = String(formData?.notes ?? '').trim();
  const result = String(formData?.result ?? '').trim();
  const soTypeKey = String(so.serviceOrderType ?? '').toUpperCase();
  const checklists = (formData?.checklists && typeof formData.checklists === 'object') ? formData.checklists : {};
  const primaryChecklist = (soTypeKey && (checklists as any)[soTypeKey]) ? (checklists as any)[soTypeKey] : null;
  const fallbackChecklist = !primaryChecklist ? (Object.values(checklists as any)[0] as any) : null;
  const checklist = primaryChecklist ?? fallbackChecklist;
  const checklistItems = Array.isArray(checklist?.items) ? checklist.items : [];
  const workLogs = (snap.workLogs ?? []) as Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt?: string | null;
    user?: User | null;
  }>;

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-semibold">OS: {so.id}</div>
          <div className="text-sm">Estado: <b>{String(so.status ?? '')}</b></div>
        </div>
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
            <div className="font-medium mb-1">Asignaciones</div>
            {(so.assignments ?? []).length > 0 ? (
              <ul className="list-disc pl-5">
                {(so.assignments ?? []).map((a: any) => (
                  <li key={a.id}>{a.user?.name ?? a.userId} ({a.role})</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-600">Sin asignaciones activas.</div>
            )}
          </div>
        </div>
      </section>

      {/* Tiempos operativos */}
      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Tiempos operativos reales</div>
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
              {(op.segments ?? []).map((s: any) => (
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded p-3">
            <div className="font-medium mb-1">Observaciones</div>
            {notes ? <div className="whitespace-pre-wrap">{notes}</div> : <div className="text-gray-600">—</div>}
          </div>
          <div className="border rounded p-3">
            <div className="font-medium mb-1">Resultado</div>
            {result ? <div className="whitespace-pre-wrap">{result}</div> : <div className="text-gray-600">—</div>}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Checklist</div>
          {checklistItems.length > 0 ? (
            <>
              {checklist?.templateName ? (
                <div className="text-xs text-gray-600">{checklist.templateName}</div>
              ) : null}
              <div className="border rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2">Ítem</th>
                      <th className="text-left p-2">Requerido</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklistItems.map((it: any, idx: number) => (
                      <tr key={idx} className="border-b last:border-b-0">
                        <td className="p-2">{it.label ?? '-'}</td>
                        <td className="p-2">{it.required ? 'Sí' : 'No'}</td>
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

      {/* Repuestos */}
      <section className="border rounded p-4 space-y-4">
        <div className="font-semibold">Repuestos</div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Necesarios (diagnóstico)</div>
          {(parts.required ?? []).length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {(parts.required ?? []).map((p: any) => (
                <li key={p.id}>
                  {(p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? '-')}
                  <span className="text-gray-600"> · Qty: {p.qty}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">Sin repuestos necesarios.</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Cambiados (historial)</div>
          {(parts.replaced ?? []).length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {(parts.replaced ?? []).map((p: any) => (
                <li key={p.id}>
                  {(p.inventoryItem ? `${p.inventoryItem.sku} — ${p.inventoryItem.name}` : p.freeText ?? '-')}
                  <span className="text-gray-600"> · Qty: {p.qty}</span>
                  {p.replacedAt ? <span className="text-gray-600"> · {String(p.replacedAt).slice(0, 10)}</span> : null}
                  {p.replacedByUser?.name ? <span className="text-gray-600"> · Por: {p.replacedByUser.name}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-gray-600">Sin repuestos cambiados.</div>
          )}
        </div>
      </section>

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
