'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import AssetPicker from '@/components/AssetPicker';

type Notice = {
  id: string;
  assetCode: string;
  title: string;
  body?: string;
  category: 'INCIDENT' | 'MAINT_LOG' | 'CONSUMABLE_CHANGE' | 'INSPECTION' | 'OTHER';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
};

type NoticeUpdate = Partial<Pick<Notice,
  'assetCode' | 'title' | 'body' | 'category' | 'severity' | 'status'
>>;

export default function EditNoticePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);

  const { data: notice, error, isLoading, mutate } = useApiSWR<Notice>(
    id ? `notices/${id}` : null,
    token,
    tenantSlug
  );

  // Form state
  const [assetCode, setAssetCode] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<Notice['category']>('INCIDENT');
  const [severity, setSeverity] = useState<Notice['severity']>('MEDIUM');
  const [status, setStatus] = useState<Notice['status']>('OPEN');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cargar datos en el formulario cuando llegan
  useEffect(() => {
    if (!notice) return;
    setAssetCode(notice.assetCode || null);
    setTitle(notice.title || '');
    setBody(notice.body || '');
    setCategory(notice.category || 'INCIDENT');
    setSeverity(notice.severity || 'MEDIUM');
    setStatus(notice.status || 'OPEN');
  }, [notice]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!token || !tenantSlug) {
      setErr('No hay sesión válida.');
      return;
    }
    if (!assetCode) {
      setErr('Selecciona un activo.');
      return;
    }
    if (!title.trim()) {
      setErr('Ingresa un título.');
      return;
    }

    const payload: NoticeUpdate = {
      assetCode,
      title: title.trim(),
      body: body.trim() || undefined,
      category,
      severity: severity || undefined,
      status,
    };

    try {
      setSaving(true);
      await apiFetch(`/notices/${id}`, {
        method: 'PUT',
        token,
        tenantSlug,
        body: payload,
      });
      // refrescamos el SWR y volvemos al listado
      await mutate();
      router.push('/notices');
    } catch (e: any) {
      setErr(e?.message || 'Error actualizando aviso.');
    } finally {
      setSaving(false);
    }
  }

  if (!id) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Editar aviso</h1>
        <div className="rounded-lg border bg-red-50 p-3 text-red-700 text-sm">
          Falta el identificador del aviso en la URL.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Editar aviso</h1>
        <div className="text-sm text-gray-600">Cargando aviso…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Editar aviso</h1>
        <div className="rounded-lg border bg-red-50 p-3 text-red-700 text-sm">
          Error cargando el aviso.
        </div>
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-2">Editar aviso</h1>
        <div className="rounded-lg border bg-yellow-50 p-3 text-yellow-800 text-sm">
          Aviso no encontrado.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Editar aviso</h1>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <AssetPicker
          label="Activo"
          required
          value={assetCode}
          onChange={setAssetCode}
        />

        <div>
          <label className="block text-sm font-medium mb-1">Título *</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe brevemente la novedad…"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Detalle</label>
          <textarea
            className="w-full rounded-xl border px-3 py-2 min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Información adicional, observaciones, etc."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value as Notice['category'])}
            >
              <option value="INCIDENT">Incidente</option>
              <option value="MAINT_LOG">Registro mant.</option>
              <option value="CONSUMABLE_CHANGE">Cambio consumible</option>
              <option value="INSPECTION">Inspección</option>
              <option value="OTHER">Otra</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Severidad</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={severity ?? ''}
              onChange={(e) =>
                setSeverity((e.target.value || undefined) as Notice['severity'])
              }
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Estado</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value as Notice['status'])}
            >
              <option value="OPEN">Abierto</option>
              <option value="IN_PROGRESS">En progreso</option>
              <option value="RESOLVED">Resuelto</option>
              <option value="CLOSED">Cerrado</option>
            </select>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/notices')}
            className="rounded-xl border px-4 py-2 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
