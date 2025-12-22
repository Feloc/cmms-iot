'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { AssetSearchSelect } from '@/components/AssetSearchSelect';

type PmPlan = { id: string; name: string; intervalHours?: number | null };

export default function NewServiceOrderPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);

  const [assetCode, setAssetCode] = useState('');
  const [type, setType] = useState<'ALISTAMIENTO'|'DIAGNOSTICO'|'PREVENTIVO'|'CORRECTIVO'|'ENTREGA'|'OTRO'>('DIAGNOSTICO');
  const [pmPlanId, setPmPlanId] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data: pmPlans } = useApiSWR<PmPlan[]>(`/pm-plans`, auth.token, auth.tenantSlug);

  const canSubmit = assetCode.trim().length > 0 && type && (!busy);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ id: string }>(`/service-orders`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: {
          assetCode,
          serviceOrderType: type,
          pmPlanId: type === 'PREVENTIVO' ? (pmPlanId || undefined) : undefined,
          dueDate: dueLocal ? new Date(dueLocal).toISOString() : undefined,
          title: title || undefined,
          description: description || undefined,
        },
      });
      router.push(`/service-orders/${res.id}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">Nueva Orden de Servicio</h1>

      {err && <div className="p-3 border rounded text-red-700 bg-red-50">{err}</div>}

      <div className="space-y-1">
        <label className="text-sm font-medium">Activo (buscar por cliente / serie / código)</label>
        <AssetSearchSelect value={assetCode} onChange={(code) => setAssetCode(code)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Tipo de OS</label>
          <select className="border rounded px-3 py-2 w-full" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="ALISTAMIENTO">Alistamiento</option>
            <option value="DIAGNOSTICO">Diagnóstico</option>
            <option value="PREVENTIVO">Mtto preventivo</option>
            <option value="CORRECTIVO">Mtto correctivo</option>
            <option value="ENTREGA">Entrega</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Fecha/hora ejecución</label>
          <input type="datetime-local" className="border rounded px-3 py-2 w-full" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
        </div>
      </div>

      {type === 'PREVENTIVO' && (
        <div className="space-y-1">
          <label className="text-sm font-medium">Plan preventivo (PM Plan)</label>
          <select className="border rounded px-3 py-2 w-full" value={pmPlanId} onChange={(e) => setPmPlanId(e.target.value)}>
            <option value="">(seleccionar)</option>
            {(pmPlans ?? []).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.intervalHours ? ` (${p.intervalHours}h)` : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-600">Puedes crear PM Plans vía API /pm-plans (por ahora).</p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">Título (opcional)</label>
        <input className="border rounded px-3 py-2 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Descripción (opcional)</label>
        <textarea className="border rounded px-3 py-2 w-full" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <button disabled={!canSubmit} className="px-4 py-2 border rounded disabled:opacity-50" onClick={submit}>
        {busy ? 'Creando...' : 'Crear OS'}
      </button>
    </div>
  );
}
