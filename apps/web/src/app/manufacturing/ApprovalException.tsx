'use client';
export function ApprovalException({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <details className="rounded border border-amber-200 p-3 text-sm"><summary className="cursor-pointer">Excepción de aprobación independiente</summary><p className="my-2 text-xs text-gray-600">Si participaste en la ejecución, debe aprobar otro responsable. Cuando esto no sea posible, documenta el motivo; quedará en el historial.</p><label className="block">Justificación de la excepción<textarea className="mt-1 w-full rounded border p-2" value={value} onChange={e => onChange(e.target.value)} maxLength={2000} minLength={20} placeholder="Mínimo 20 caracteres si se utiliza la excepción" /></label></details>;
}
