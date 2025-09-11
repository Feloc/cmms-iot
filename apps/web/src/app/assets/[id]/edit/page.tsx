'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

type Asset = { id: string; code: string; name: string; type?: string | null; location?: string | null };

export default function EditAssetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Cargar el asset
  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { token, tenantSlug } = getAuthFromSession(session);
        const data = await apiFetch<Asset>(`assets/${id}`, { token, tenantSlug });
        if (mounted) setAsset(data);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? 'Error cargando asset');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    if (id) load();
    return () => { mounted = false; };
  }, [id, session]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!asset) return;

    setErr(null);
    try {
      const { token, tenantSlug } = getAuthFromSession(session);
      setSaving(true);
      await apiFetch(`assets/${id}`, {
        method: 'PUT',
        token,
        tenantSlug,
        body: {
          code: asset.code,
          name: asset.name,
          type: asset.type ?? '',
          location: asset.location ?? '',
        },
      });
      router.push('/assets');
    } catch (e: any) {
      setErr(e?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm('¿Eliminar este asset?')) return;
    try {
      const { token, tenantSlug } = getAuthFromSession(session);
      await apiFetch(`assets/${id}`, { method: 'DELETE', token, tenantSlug });
      router.push('/assets');
    } catch (e: any) {
      setErr(e?.message ?? 'Error al eliminar');
    }
  }

  if (loading) return <div className="p-6">Cargando…</div>;
  if (!asset) return <div className="p-6">No se encontró el asset. {err && <span className="text-red-600">{err}</span>}</div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Editar asset</h1>

      <form onSubmit={onSave} className="grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span>Código</span>
          <input
            className="border rounded px-3 py-2"
            value={asset.code}
            onChange={(e) => setAsset({ ...asset, code: e.target.value })}
            required
          />
        </label>

        <label className="grid gap-1">
          <span>Nombre</span>
          <input
            className="border rounded px-3 py-2"
            value={asset.name}
            onChange={(e) => setAsset({ ...asset, name: e.target.value })}
            required
          />
        </label>

        <label className="grid gap-1">
          <span>Tipo</span>
          <input
            className="border rounded px-3 py-2"
            value={asset.type ?? ''}
            onChange={(e) => setAsset({ ...asset, type: e.target.value })}
          />
        </label>

        <label className="grid gap-1">
          <span>Ubicación</span>
          <input
            className="border rounded px-3 py-2"
            value={asset.location ?? ''}
            onChange={(e) => setAsset({ ...asset, location: e.target.value })}
          />
        </label>

        {err && <p className="text-red-600">{err}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="border rounded px-4 py-2" onClick={() => router.push('/assets')}>
            Cancelar
          </button>
          <button type="button" className="bg-red-600 text-white rounded px-4 py-2" onClick={onDelete}>
            Eliminar
          </button>
        </div>
      </form>
    </div>
  );
}
