'use client';
import { useState } from 'react';
import type { ManufacturingFatCase, ManufacturingFatResultType } from '@/lib/manufacturing';
import type { FatFindingCall } from './ManufacturingFatFindings';

export type FatSubpointDraft = { name: string; acceptanceCriteria: string; instructions: string; resultType: ManufacturingFatResultType; minimumValue: string; maximumValue: string; unit: string; required: boolean; evidenceRequired: boolean };
const empty = (): FatSubpointDraft => ({ name: '', acceptanceCriteria: '', instructions: '', resultType: 'BOOLEAN', minimumValue: '', maximumValue: '', unit: '', required: true, evidenceRequired: false });
const input = 'mt-1 block w-full rounded border bg-white px-2 py-1.5 text-sm';
const button = 'rounded border bg-white px-3 py-1.5 text-xs disabled:opacity-50';

function Definition({ value, onChange }: { value: FatSubpointDraft; onChange: (value: FatSubpointDraft) => void }) {
  const update = (patch: Partial<FatSubpointDraft>) => onChange({ ...value, ...patch });
  return <div className="grid gap-2 md:grid-cols-2">
    <label className="text-xs">Nombre del subpunto<input required maxLength={200} className={input} value={value.name} onChange={e => update({ name: e.target.value })} /></label>
    <label className="text-xs">Criterio de aceptación<input required maxLength={2000} className={input} value={value.acceptanceCriteria} onChange={e => update({ acceptanceCriteria: e.target.value })} /></label>
    <label className="text-xs">Instrucciones<textarea className={input} maxLength={10000} value={value.instructions} onChange={e => update({ instructions: e.target.value })} /></label>
    <label className="text-xs">Tipo de resultado<select className={input} value={value.resultType} onChange={e => update({ resultType: e.target.value as ManufacturingFatResultType })}><option value="BOOLEAN">Conforme / no conforme</option><option value="NUMERIC">Medición numérica</option><option value="TEXT">Resultado textual</option></select></label>
    {value.resultType === 'NUMERIC' ? <><label className="text-xs">Mínimo<input type="number" step="any" className={input} value={value.minimumValue} onChange={e => update({ minimumValue: e.target.value })} /></label><label className="text-xs">Máximo<input type="number" step="any" className={input} value={value.maximumValue} onChange={e => update({ maximumValue: e.target.value })} /></label><label className="text-xs">Unidad<input className={input} value={value.unit} onChange={e => update({ unit: e.target.value })} /></label></> : null}
    <div className="flex flex-wrap gap-3 text-xs"><label><input type="checkbox" checked={value.required} onChange={e => update({ required: e.target.checked })} /> Obligatorio</label><label><input type="checkbox" checked={value.evidenceRequired} onChange={e => update({ evidenceRequired: e.target.checked })} /> Exige evidencia propia</label></div>
  </div>;
}

export function FatProtocolSubpoints({ value, onChange }: { value: FatSubpointDraft[]; onChange: (value: FatSubpointDraft[]) => void }) {
  return <div className="space-y-2 border-t pt-2 md:col-span-6"><h4 className="text-xs font-medium">Subpuntos del protocolo ({value.length})</h4>
    {value.map((item, index) => <div key={index} className="space-y-2 rounded border-l-4 border-indigo-100 p-2"><p className="text-xs">Subpunto {index + 1}</p><Definition value={item} onChange={next => onChange(value.map((old, i) => i === index ? next : old))} /><button type="button" className="text-xs text-red-700" onClick={() => onChange(value.filter((_, i) => i !== index))}>Quitar del borrador</button></div>)}
    <button type="button" disabled={value.length >= 50} className={button} onClick={() => onChange([...value, empty()])}>Agregar subpunto al protocolo</button>
  </div>;
}

export function FatExecutionSubpointForm({ parent, busy, call }: { parent: ManufacturingFatCase; busy: string; call: FatFindingCall }) {
  const [open, setOpen] = useState(false); const [value, setValue] = useState(empty); const [reason, setReason] = useState('');
  async function save() {
    if (await call(`fat-cases/${parent.id}/subpoints`, { ...value, lockVersion: parent.lockVersion, reason })) { setOpen(false); setValue(empty()); setReason(''); }
  }
  return <div className="space-y-2"><button type="button" disabled={!!busy} className={button} onClick={() => setOpen(!open)}>{open ? 'Cancelar registro' : 'Agregar subpunto durante la prueba'}</button>
    {open ? <form className="rounded border bg-indigo-50 p-3" onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={!!busy} className="space-y-3"><p className="text-xs">Se agrega solo a este FAT. Un subpunto obligatorio devuelve el punto a pendiente de evaluación. No se modifica el protocolo original.</p><Definition value={value} onChange={setValue} /><label className="block text-xs">Motivo de la nueva revisión<textarea className={input} required minLength={5} maxLength={10000} value={reason} onChange={e => setReason(e.target.value)} /></label><button type="submit" className={button} disabled={!value.name.trim() || !value.acceptanceCriteria.trim() || reason.trim().length < 5}>Guardar subpunto</button></fieldset></form> : null}
  </div>;
}
