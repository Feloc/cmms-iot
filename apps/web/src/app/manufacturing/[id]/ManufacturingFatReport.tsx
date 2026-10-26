'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { ManufacturingFatCase, ManufacturingFatExecution } from '@/lib/manufacturing';

const resultLabels: Record<string, string> = { PASS: 'Conforme', FAIL: 'No conforme', PENDING: 'Pendiente', NOT_APPLICABLE: 'No aplica' };

export function ManufacturingFatReport({ execution, busy, onDownload }: {
  execution: ManufacturingFatExecution;
  busy: string;
  onDownload: (caseIds: string[]) => Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" disabled={!!busy} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-50">{busy === 'report' ? 'Generando PDF…' : 'Descargar reporte FAT (PDF)'}</button></DialogTrigger>
    <DialogContent className="flex max-h-[95vh] w-[calc(100%_-_1rem)] max-w-3xl flex-col overflow-hidden bg-white p-4 text-gray-900 sm:p-6">
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>Escoger puntos del reporte FAT</DialogTitle>
        <DialogDescription>{execution.executionCode}. La selección solo afecta el PDF; no modifica las pruebas ni su aprobación.</DialogDescription>
      </DialogHeader>
      {open ? <ReportSelection execution={execution} busy={busy} onDownload={onDownload} onClose={() => setOpen(false)} /> : null}
    </DialogContent>
  </Dialog>;
}

function ReportSelection({ execution, busy, onDownload, onClose }: {
  execution: ManufacturingFatExecution;
  busy: string;
  onDownload: (caseIds: string[]) => Promise<string | undefined>;
  onClose: () => void;
}) {
  // Exclusions keep the selection stable across refreshes without stale case IDs.
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const selectedIds = execution.cases.filter(point => !excludedIds.has(point.id)).map(point => point.id);
  const selected = new Set(selectedIds);
  const roots = execution.cases.filter(point => !point.parentCaseId).sort((a, b) => a.position - b.position);
  const partial = selectedIds.length < execution.cases.length;
  function toggleGroup(group: ManufacturingFatCase[], include: boolean) {
    setExcludedIds(current => {
      const next = new Set(current);
      for (const point of group) { if (include) next.delete(point.id); else next.add(point.id); }
      return next;
    });
  }
  function toggleChild(point: ManufacturingFatCase, include: boolean) {
    setExcludedIds(current => {
      const next = new Set(current);
      if (include) { next.delete(point.id); if (point.parentCaseId) next.delete(point.parentCaseId); }
      else next.add(point.id);
      return next;
    });
  }
  async function download() {
    if (busy || !selectedIds.length) return;
    setError('');
    const failure = await onDownload(selectedIds);
    if (failure) setError(failure); else onClose();
  }
  return <>
    <div className="shrink-0 space-y-2 text-xs">
      <p className="text-gray-600">Seleccionar un punto marca también sus subpuntos. Puedes desmarcarlos individualmente; al marcar un subpunto se incluye su punto principal.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="font-medium">{selectedIds.length} de {execution.cases.length} verificaciones seleccionadas</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy || !partial} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setExcludedIds(new Set())}>Seleccionar todos</button>
          <button type="button" disabled={!!busy || !selectedIds.length} className="rounded border px-2 py-1 disabled:opacity-50" onClick={() => setExcludedIds(new Set(execution.cases.map(point => point.id)))}>Desmarcar todos</button>
        </div>
      </div>
    </div>
    <div role="group" aria-label="Puntos y subpuntos para el reporte" className="min-h-0 space-y-3 overflow-y-auto rounded border p-3">
      {roots.map(point => {
        const children = execution.cases.filter(child => child.parentCaseId === point.id).sort((a, b) => a.position - b.position);
        const group = [point, ...children];
        const count = group.filter(item => selected.has(item.id)).length;
        const checked = count === group.length;
        const mixed = count > 0 && !checked;
        return <div key={point.id} className="space-y-2 rounded border p-3">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" disabled={!!busy} checked={checked} aria-checked={mixed ? 'mixed' : checked} ref={input => { if (input) input.indeterminate = mixed; }} className="mt-1 shrink-0" onChange={event => toggleGroup(group, event.target.checked)} />
            <span className="min-w-0 break-words"><span className="font-semibold">{point.position}. {point.name}</span><span className="block text-xs text-gray-500">{point.section || 'General'} · {resultLabels[point.result]}{point.voidedAt ? ' · Anulado' : ''}{mixed ? ' · Selección parcial' : ''}</span></span>
          </label>
          {children.length ? <div className="ml-1 space-y-2 border-l pl-4">{children.map((child, index) => <label key={child.id} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" disabled={!!busy} checked={selected.has(child.id)} className="mt-1 shrink-0" onChange={event => toggleChild(child, event.target.checked)} />
            <span className="min-w-0 break-words">{point.position}.{index + 1}. {child.name}<span className="block text-xs text-gray-500">{resultLabels[child.result]}{child.voidedAt ? ' · Anulado' : ''}</span></span>
          </label>)}</div> : null}
        </div>;
      })}
    </div>
    <p className={`shrink-0 rounded p-2 text-xs ${partial ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600'}`}>{!selectedIds.length ? 'Selecciona al menos un punto para generar el PDF.' : partial ? 'Se generará un REPORTE PARCIAL. Mantendrá el estado global del FAT y sus aprobaciones, con una advertencia de alcance.' : 'Se incluirá el protocolo completo, con todas sus verificaciones.'}</p>
    {error ? <p role="alert" className="shrink-0 text-xs text-red-700">{error}</p> : null}
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      <button type="button" disabled={!!busy} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={onClose}>Cancelar</button>
      <button type="button" disabled={!!busy || !selectedIds.length} className="rounded bg-cyan-800 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={() => void download()}>{busy === 'report' ? 'Generando PDF…' : 'Generar y descargar PDF'}</button>
    </div>
  </>;
}
