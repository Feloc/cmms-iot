'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { type Assembly, assemblyStatusLabel, minutesLabel } from '@/lib/assemblies';
import { useApiSWR } from '@/lib/swr';
import { PUBLIC_API_BASE } from '@/lib/api-url';

export default function AssemblyReportPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const { data, error, isLoading } = useApiSWR<Assembly>(id ? `/assemblies/${id}` : null, auth.token, auth.tenantSlug);

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (isLoading) return <div className="p-6">Generando reporte…</div>;
  if (error || !data) return <div className="p-6 text-red-700">No se pudo generar el reporte.</div>;

  return (
    <div className="bg-gray-100 min-h-screen print:bg-white">
      <div className="print:hidden sticky top-0 bg-white border-b p-3 flex justify-between gap-2 z-10">
        <Link className="border rounded px-3 py-2 text-sm" href={`/assemblies/${id}`}>← Volver al montaje</Link>
        <button className="rounded px-4 py-2 text-sm bg-black text-white" onClick={() => window.print()}>Imprimir / guardar PDF</button>
      </div>
      <main className="max-w-5xl mx-auto bg-white p-6 md:p-10 space-y-7 print:max-w-none print:p-0">
        <header className="border-b pb-5 flex justify-between gap-4">
          <div><div className="text-sm uppercase tracking-wide text-gray-500">Reporte de montaje</div><h1 className="text-2xl font-bold">{data.workOrder.title}</h1><p className="text-sm text-gray-600">{data.templateName} · versión {data.templateVersion}</p></div>
          <div className="text-right text-sm"><div className="font-semibold">{assemblyStatusLabel[data.status] || data.status}</div><div>Generado: {new Date().toLocaleString()}</div></div>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Equipo" value={`${data.asset?.code || data.workOrder.assetCode} · ${data.asset?.name || ''}`} />
          <Field label="Cliente" value={data.asset?.customer || '—'} />
          <Field label="Marca / modelo" value={`${data.asset?.brand || '—'} / ${data.asset?.model || '—'}`} />
          <Field label="Serie" value={data.asset?.serialNumber || '—'} />
          <Field label="Inicio programado" value={data.scheduledStartAt ? new Date(data.scheduledStartAt).toLocaleString() : '—'} />
          <Field label="Fin previsto" value={data.metrics.baselineEndAt ? new Date(data.metrics.baselineEndAt).toLocaleString() : '—'} />
          <Field label="Fecha de terminación" value={data.completedAt ? new Date(data.completedAt).toLocaleString() : '—'} />
          <Field label="Técnicos" value={data.workOrder.assignments.map((item) => item.user?.name).filter(Boolean).join(', ') || '—'} />
          <Field label="Avance" value={`${data.metrics.progressPercent}%`} />
          <Field label="Aceptación del cliente" value={data.workOrder.receiverSignature ? 'Firmada' : 'Pendiente'} />
        </section>

        <section>
          <h2 className="font-semibold mb-3">Resumen de tiempos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 border rounded divide-x text-center">
            <ReportMetric label="Presupuesto HH" value={minutesLabel(data.plannedLaborMinutes)} />
            <ReportMetric label="Tiempo real HH" value={minutesLabel(data.metrics.actualLaborMinutes)} />
            <ReportMetric label="Consumo" value={`${data.metrics.budgetConsumedPercent}%`} />
            <ReportMetric label="Pronóstico HH" value={minutesLabel(data.metrics.forecastLaborMinutes)} />
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Actividades ejecutadas</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm border-collapse">
            <thead><tr className="bg-gray-100"><Th>#</Th><Th>Etapa / actividad</Th><Th>Estado</Th><Th>Estimado HH</Th><Th>Real HH</Th><Th>Observaciones y evidencias</Th></tr></thead>
            <tbody>{data.activities.map((activity) => <tr key={activity.id} className="align-top">
              <Td>{activity.position}</Td><Td><strong>{activity.name}</strong>{activity.phase ? <div className="text-xs text-gray-500">{activity.phase}</div> : null}</Td>
              <Td>{assemblyStatusLabel[activity.status] || activity.status}</Td><Td>{minutesLabel(activity.estimatedMinutes * activity.plannedTechnicians)}</Td><Td>{minutesLabel(activity.actualMinutes)}</Td>
              <Td>{activity.blockedReason ? <div className="text-red-700">Bloqueo: {activity.blockedReason}</div> : null}{activity.notes || null}{activity.attachments?.length ? <ul className="mt-1 text-xs">{activity.attachments.map((file) => <li key={file.id}><a className="underline" href={`${PUBLIC_API_BASE}/attachments/${file.id}/view`} target="_blank" rel="noreferrer">{file.filename}</a></li>)}</ul> : <div className="text-xs text-gray-400">Sin evidencia</div>}</Td>
            </tr>)}</tbody>
          </table></div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">Firmas de entrega</h2>
          <div className="grid grid-cols-2 gap-10 text-sm">
            <SignatureBox label="Técnico responsable" dataUrl={data.workOrder.technicianSignature} />
            <SignatureBox label="Recibido por el cliente" dataUrl={data.workOrder.receiverSignature} />
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-gray-500">{label}</div><div>{value}</div></div>; }
function ReportMetric({ label, value }: { label: string; value: string }) { return <div className="p-3"><div className="text-xs text-gray-500">{label}</div><div className="font-semibold">{value}</div></div>; }
function SignatureBox({ label, dataUrl }: { label: string; dataUrl?: string | null }) { return <div className="text-center"><div className="h-32 flex items-end justify-center">{dataUrl ? <img src={dataUrl} alt={label} className="max-h-28 max-w-full object-contain" /> : <span className="text-gray-400 text-xs">Firma pendiente</span>}</div><div className="border-t pt-2">{label}</div></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="border p-2 text-left font-medium">{children}</th>; }
function Td({ children }: { children: React.ReactNode }) { return <td className="border p-2">{children}</td>; }
