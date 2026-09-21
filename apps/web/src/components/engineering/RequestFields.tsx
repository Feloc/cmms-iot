'use client';
import { RequestFields as Fields, requestTypes, disciplines, priorities, engineeringInput } from '@/lib/engineering';

export default function RequestFields({ value, onChange }: { value: Fields; onChange: (value: Fields) => void }) {
  const update = (key: keyof Fields, text: string) => onChange({ ...value, [key]: text });
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">
    <label className="grid gap-1 text-sm sm:col-span-2">Título *<input className={engineeringInput} required maxLength={200} value={value.title} onChange={(e) => update('title', e.target.value)} /></label>
    {([['requestType', 'Tipo', requestTypes], ['discipline', 'Disciplina', disciplines], ['priority', 'Prioridad', priorities]] as const).map(([key,label,options]) =>
      <label key={key} className="grid gap-1 text-sm">{label}<select className={engineeringInput} value={value[key]} onChange={(e) => update(key, e.target.value)}>{Object.entries(options).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>)}
    <label className="grid gap-1 text-sm">Fecha deseada<input className={engineeringInput} type="date" value={value.desiredDate} onChange={(e) => update('desiredDate', e.target.value)} /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Problema actual *<textarea className={engineeringInput} rows={3} required maxLength={10000} value={value.problem} onChange={(e) => update('problem', e.target.value)} /></label>
    <label className="grid gap-1 text-sm sm:col-span-2">Mejora esperada y justificación *<textarea className={engineeringInput} rows={3} required maxLength={10000} value={value.expectedBenefit} onChange={(e) => update('expectedBenefit', e.target.value)} /></label>
  </div>;
}
