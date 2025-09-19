'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

export default function CompleteButton({ workOrderId, disabled }: { workOrderId: string; disabled?: boolean }) {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const [loading, setLoading] = useState(false);

  const complete = async () => {
    if (!token || !tenantSlug) return alert('Sesión inválida');
    try {
      setLoading(true);

      // 1) Pre-check de resolución
      const res = await apiFetch<any>(`/work-orders/${workOrderId}/resolution`, {
        method: 'GET', token, tenantSlug
      });

      console.log(res.causeCodeId, res?.causeOther, res?.remedyCodeId, res?.remedyOther);
      

      const hasCause = !!(res?.causeCodeId || res?.causeOther);
      const hasRemedy = !!(res?.remedyCodeId || res?.remedyOther);
      if (!hasCause || !hasRemedy) {
        alert('No puedes completar: falta registrar Causa y/o Acción correctiva en la pestaña Resolución.');
        return;
      }

      // 2) Completar
      await apiFetch(`/work-orders/${workOrderId}`, {
        method: 'PATCH',
        token, tenantSlug,
        body: { status: 'COMPLETED' },
      });

      location.reload();
    } catch (e: any) {
      alert(e?.message || 'Error completando la OT');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={complete}
      disabled={disabled || loading}
      className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      title="Cambiar estado a COMPLETED y cerrar logs abiertos"
    >
      {loading ? 'Completando…' : 'Completar OT'}
    </button>
  );
}
