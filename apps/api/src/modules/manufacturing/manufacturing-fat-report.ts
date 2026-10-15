import { ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import { fatMediaPath } from './manufacturing-fat-media';

const run = promisify(execFile);
const escape = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const date = (value: any) => value ? new Date(value).toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false }) : '—';
const labels: Record<string, string> = { DRAFT: 'Borrador', IN_PROGRESS: 'En ejecución', AWAITING_APPROVAL: 'Pendiente de aprobación', APPROVED: 'Aprobado', REJECTED: 'Rechazado', CANCELED: 'Cancelado', PENDING: 'Pendiente', PASS: 'Conforme', FAIL: 'No conforme', NOT_APPLICABLE: 'No aplica', OPEN: 'Abierta', IN_REWORK: 'En corrección', PENDING_VERIFICATION: 'Pendiente de verificar', RESOLVED: 'Cerrada y verificada', ACCEPTED_AS_IS: 'Aceptada por concesión', MINOR: 'Menor', MAJOR: 'Mayor', CRITICAL: 'Crítica' };
const label = (value: string) => escape(labels[value] || value);
export type FatReportSnapshot = { execution: any; order: any; company: any; events: any[]; generatedAt: Date; generatedBy: string };
type Picture = { src?: string; warning?: string };

// Only local, authorized evidence from the snapshot is considered. Never fetch user URLs.
export async function fatReportPictures(snapshot: FatReportSnapshot): Promise<Map<string, Picture>> {
  const pictures = new Map<string, Picture>(); let bytes = 0; let count = 0;
  for (const c of snapshot.execution.cases) for (const e of [...c.evidence, ...c.deviations.flatMap((d: any) => d.evidence)]) {
    if (!e.storageKey || !['image/jpeg', 'image/png', 'image/webp'].includes(e.mimeType)) continue;
    if (count >= 40 || !e.size || bytes + e.size > 20 * 1024 * 1024) { pictures.set(e.id, { warning: 'Imagen referenciada; no incluida por el límite de 40 imágenes / 20 MB del reporte.' }); continue; }
    try {
      const location = fatMediaPath(e.storageKey); const stat = await fs.stat(location);
      if (!stat.isFile() || stat.size !== e.size || bytes + stat.size > 20 * 1024 * 1024) throw new Error('Invalid image size');
      const buffer = await fs.readFile(location); bytes += buffer.length; count++;
      pictures.set(e.id, { src: `data:${e.mimeType};base64,${buffer.toString('base64')}` });
    } catch { pictures.set(e.id, { warning: 'Imagen no disponible en almacenamiento; se conserva su referencia.' }); }
  }
  return pictures;
}

export function fatReportHtml(s: FatReportSnapshot, pictures = new Map<string, Picture>()) {
  const { execution: e, order: o, company } = s;
  const field = (name: string, value: unknown) => `<div><b>${escape(name)}:</b> <span>${escape(value)}</span></div>`;
  const status = (value: string) => `<strong class="status ${value === 'PASS' || value === 'APPROVED' ? 'good' : value === 'FAIL' || value === 'REJECTED' ? 'bad' : ''}">${label(value)}</strong>`;
  const evidence = (items: any[]) => items.length ? `<h4>Evidencias (${items.length})</h4>${items.map(item => {
    const picture = pictures.get(item.id);
    return `<div class="evidence">${field('Título', item.title)}${item.reference ? field('Referencia', item.reference) : ''}${item.url ? field('Enlace externo', item.url) : ''}${item.notes ? field('Descripción', item.notes) : ''}${item.storageKey ? field('Archivo', `${item.filename} · ${item.mimeType} · ${((item.size || 0) / 1048576).toFixed(2)} MB`) : ''}${field('Registrada por', `${item.createdByName} · ${date(item.createdAt)}`)}<div class="muted">ID de evidencia: ${escape(item.id)}</div>${picture?.src ? `<img src="${picture.src}" alt="${escape(item.title)}" />` : ''}${picture?.warning ? `<p class="warning">${escape(picture.warning)}</p>` : ''}${item.mimeType?.startsWith('video/') ? '<p class="muted">Video disponible en el expediente FAT; no se incrusta en el PDF.</p>' : ''}</div>`;
  }).join('')}` : '<p class="muted">Sin evidencias registradas.</p>';
  const historyLabels: Record<string, string> = { reason: 'Motivo', result: 'Resultado', measuredValue: 'Medición', observedValue: 'Valor observado', notes: 'Observaciones', previousResult: 'Resultado anterior', previousMeasuredValue: 'Medición anterior', previousObservedValue: 'Valor observado anterior', previousNotes: 'Observaciones anteriores', previousTestedByName: 'Evaluador anterior', correctiveAction: 'Acción correctiva', resolutionNotes: 'Corrección / concesión', verificationNotes: 'Verificación', approvalExceptionReason: 'Excepción de independencia' };
  const history = (id: string) => {
    const events = s.events.filter(event => event.entityId === id);
    return events.length ? `<div class="history"><h4>Trazabilidad (${events.length})</h4>${events.map(event => `<div class="event"><b>${escape(date(event.createdAt))} · ${escape(event.actorName)}</b><div>${escape(event.summary)}</div>${Object.entries(historyLabels).filter(([key]) => event.afterData?.[key] != null).map(([key, title]) => field(title, key === 'result' || key === 'previousResult' ? labels[event.afterData[key]] || event.afterData[key] : event.afterData[key])).join('')}</div>`).join('')}</div>` : '';
  };
  const finding = (d: any) => `<div class="finding"><h4>${escape(d.deviationCode)} · ${escape(d.title)}</h4>${status(d.status)} ${escape(d.kind === 'OBSERVATION' ? 'Observación (no bloqueante)' : 'No conformidad')} · Severidad: ${label(d.severity)}${field('Descripción', d.description)}${field('Ubicación / componente', d.location)}${field('Responsable', d.responsibleName)}${field('Compromiso', date(d.dueAt))}${field('Registrada', `${d.openedByName} · ${date(d.openedAt)}`)}${field('Acción correctiva', d.correctiveAction)}${field('Corrección / concesión', d.resolutionNotes)}${field('Corrección presentada', d.correctedByName ? `${d.correctedByName} · ${date(d.correctedAt)}` : null)}${field('Verificación', d.verificationNotes)}${field('Cierre', d.resolvedByName ? `${d.resolvedByName} · ${date(d.resolvedAt)}` : null)}${evidence(d.evidence)}${history(d.id)}</div>`;
  const point = (c: any, number: string) => `<section class="point ${c.parentCaseId ? 'child' : ''}"><h3>${escape(number)} · ${escape(c.name)} ${c.voidedAt ? '(ANULADO)' : ''}</h3>${status(c.result)} ${escape(c.required ? 'Obligatorio' : 'Opcional')}${c.evidenceRequired ? ' · Exige evidencia propia' : ''}${field('Sección', c.section)}${field('Criterio de aceptación', c.acceptanceCriteria)}${c.instructions ? field('Instrucciones', c.instructions) : ''}${c.resultType === 'NUMERIC' ? field('Rango permitido', `${c.minimumValue ?? 'Sin mínimo'} a ${c.maximumValue ?? 'Sin máximo'} ${c.unit || ''}`) + field('Medición', c.measuredValue == null ? null : `${c.measuredValue} ${c.unit || ''}`) : c.resultType === 'TEXT' ? field('Valor observado', c.observedValue) : ''}${field('Observaciones de prueba', c.notes)}${field('Evaluación', c.testedByName ? `${c.testedByName} · ${date(c.testedAt)}` : null)}${c.parentCaseId ? field('Procedencia', c.origin === 'EXECUTION' ? `Agregado durante la prueba por ${c.addedByName} · ${date(c.createdAt)}. Motivo: ${c.additionReason}` : 'Protocolo original') : ''}${c.voidedAt ? `<div class="warning">${field('Anulación', `${c.voidedByName} · ${date(c.voidedAt)}. Motivo: ${c.voidReason}`)}Se conserva el resultado anterior; no participa en el avance activo.</div>` : ''}${evidence(c.evidence)}<h4>Novedades (${c.deviations.length})</h4>${c.deviations.map(finding).join('') || '<p class="muted">Sin novedades.</p>'}${history(c.id)}</section>`;
  const active = e.cases.filter((c: any) => !c.voidedAt);
  const findings = active.flatMap((c: any) => c.deviations);
  const blocking = findings.filter((d: any) => d.kind !== 'OBSERVATION' && ['OPEN', 'IN_REWORK', 'PENDING_VERIFICATION'].includes(d.status)).length;
  const roots = e.cases.filter((c: any) => !c.parentCaseId).sort((a: any, b: any) => a.position - b.position);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Reporte FAT</title><style>
  @page { size:A4; margin:16mm 14mm 18mm; @bottom-center { content:'Página ' counter(page) ' de ' counter(pages); font:9px Arial; color:#64748b; } }
  *{box-sizing:border-box} body{font:11px Arial,sans-serif;color:#172033;line-height:1.5;margin:0} h1{font-size:25px;margin:5px 0} h2{font-size:17px;color:#173e68;border-bottom:2px solid #173e68;padding-bottom:5px} h3{font-size:14px;margin:15px 0 7px;background:#eaf0f7;padding:7px} h4{font-size:11px;margin:10px 0 4px} h2,h3,h4{break-after:avoid} p{margin:4px 0} span,.event,.evidence,.finding{overflow-wrap:anywhere;white-space:pre-wrap} .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px} .muted{color:#64748b;font-size:10px} .banner{padding:10px;border:2px solid #a16207;background:#fffbeb;margin:12px 0;font-weight:bold} .approved{border-color:#15803d;background:#f0fdf4} .status{display:inline-block;padding:2px 6px;background:#f1f5f9;border-radius:3px} .good{color:#166534}.bad{color:#991b1b} .warning{border-left:3px solid #b45309;padding:6px;background:#fffbeb} .point{margin-top:12px} .child{border-left:3px solid #cbd5e1;padding-left:10px} .finding{border:1px solid #cbd5e1;padding:8px;margin:8px 0} .evidence{border-bottom:1px solid #e2e8f0;padding:6px 0;break-inside:avoid} img{display:block;max-width:100%;max-height:210px;object-fit:contain;margin-top:6px} .event{border-top:1px dotted #cbd5e1;padding:5px 0;font-size:10px}.history{color:#475569} .sign{break-inside:avoid;border:1px solid #cbd5e1;padding:8px;margin:8px 0} .details{break-before:page} table{width:100%;border-collapse:collapse;font-size:10px} th,td{padding:5px;border:1px solid #cbd5e1;text-align:left;overflow-wrap:anywhere} thead{display:table-header-group} tr{break-inside:avoid}
  </style></head><body><div class="muted">${escape(company?.legalName || company?.name)}${company?.taxId ? ` · NIT ${escape(company.taxId)}` : ''}</div><h1>Reporte de pruebas FAT</h1><h2>${escape(e.executionCode)}</h2><div class="banner ${e.status === 'APPROVED' ? 'approved' : ''}">${e.status === 'APPROVED' ? 'FAT APROBADO — aprobación registrada en el sistema' : 'REPORTE NO APROBADO — no autoriza despacho'} · ${label(e.status)}</div><div class="grid">${field('Orden de manufactura', o.number)}${field('Proyecto', o.projectName)}${field('Cliente', o.customerName)}${field('Referencia del cliente', o.customerReference)}${field('Equipo / producto', o.productName)}${field('Modelo / código', `${o.model || '—'} / ${o.productCode || '—'}`)}${field('Unidad', e.manufacturedUnit.unitNumber)}${field('Serie', e.manufacturedUnit.serialNumber)}${field('Protocolo', `${e.templateCode} · ${e.templateName} · v${e.templateVersion}`)}${field('Versión de ejecución', e.lockVersion)}${field('Ensamble', e.assemblyExecution?.executionCode)}${field('Inicio', date(e.startedAt))}${field('Enviado a aprobación', date(e.submittedAt))}${field('Decisión', date(e.decidedAt))}${field('Generado por', s.generatedBy)}${field('Fecha de generación (Bogotá)', date(s.generatedAt))}</div>
  <h2>Resumen</h2><p>${roots.length} puntos principales · ${active.filter((c: any) => c.parentCaseId).length} subpuntos activos · ${e.cases.length - active.length} anulados.</p><p>${active.filter((c: any) => c.result === 'PASS').length} conformes · ${active.filter((c: any) => c.result === 'FAIL').length} no conformes · ${active.filter((c: any) => c.result === 'PENDING' && (!c.parentCaseId || c.required)).length} pendientes obligatorios · ${active.filter((c: any) => c.result === 'PENDING' && c.parentCaseId && !c.required).length} subpuntos opcionales sin ejecutar.</p><p>${blocking} no conformidades abiertas bloqueantes · ${findings.filter((d: any) => d.kind === 'OBSERVATION' && ['OPEN','IN_REWORK','PENDING_VERIFICATION'].includes(d.status)).length} observaciones pendientes no bloqueantes.</p><table><thead><tr><th>Punto / subpunto</th><th>Verificación</th><th>Resultado</th></tr></thead><tbody>${roots.map((c: any) => [c, ...e.cases.filter((child: any) => child.parentCaseId === c.id).sort((a: any,b: any) => a.position-b.position)].map((item: any, i: number) => `<tr><td>${escape(i ? `${c.position}.${i}` : c.position)}</td><td>${escape(item.name)}</td><td>${item.voidedAt ? 'Anulado · ' : ''}${label(item.result)}</td></tr>`).join('')).join('')}</tbody></table>
  <h2>Aprobaciones registradas</h2>${e.approvals.length ? e.approvals.map((a: any) => `<div class="sign">${status(a.decision)}${field('Firmante registrado', `${a.signedByName} (${a.signedByRole})`)}${field('Fecha', date(a.signedAt))}${field('Comentarios', a.comments)}</div>`).join('') : '<p>No hay firmas de aprobación registradas.</p>'}<p class="muted">Se muestran las aprobaciones del sistema; este archivo no incorpora una firma digital criptográfica. Es una copia del estado a la fecha de generación, no una instantánea archivada al firmar. Las observaciones pueden incluir seguimiento posterior a la aprobación. Los videos y archivos no incrustados se consultan con permisos en el expediente FAT.</p>${history(e.id)}
  <div class="details"><h2>Detalle de verificaciones</h2>${roots.map((c: any) => point(c, String(c.position)) + e.cases.filter((child: any) => child.parentCaseId === c.id).sort((a: any,b: any) => a.position-b.position).map((child: any, i: number) => point(child, `${c.position}.${i + 1}`)).join('')).join('')}</div></body></html>`;
}

let rendering = 0;
export async function renderFatPdf(html: string): Promise<Buffer> {
  if (rendering >= 2) throw new ServiceUnavailableException('Hay reportes FAT en generación. Intenta nuevamente en unos segundos');
  rendering++;
  let directory: string | undefined;
  try {
    directory = await fs.mkdtemp(path.join(tmpdir(), 'cmms-fat-pdf-'));
    const input = path.join(directory, 'report.html'); const output = path.join(directory, 'report.pdf');
    await fs.writeFile(input, html, { mode: 0o600 });
    await run(process.env.CHROMIUM_BIN || 'chromium', ['--headless', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-extensions', '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${path.join(directory, 'profile')}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${output}`, pathToFileURL(input).href], { timeout: 45000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 });
    const buffer = await fs.readFile(output);
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
    return buffer;
  } catch { throw new ServiceUnavailableException('No se pudo generar el reporte FAT. Intenta nuevamente; si persiste, revisa Chromium/CHROMIUM_BIN en la API'); }
  finally { if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined); rendering--; }
}
