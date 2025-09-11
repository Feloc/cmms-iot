'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

export default function NewAssetPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    try {
      const { token, tenantSlug } = getAuthFromSession(session);
      setSaving(true);
      await apiFetch('assets', {
        method: 'POST',
        token,
        tenantSlug,
        body: { code, name, type, location },
      });
      router.push('/assets');
    } catch (e: any) {
      setErr(e?.message ?? 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Nuevo asset</h1>

      <form onSubmit={onSubmit} className="grid gap-3 max-w-md">
        <label className="grid gap-1">
          <span>Código</span>
          <input
            className="border rounded px-3 py-2"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>

        <label className="grid gap-1">
          <span>Nombre</span>
          <input
            className="border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>

        <label className="grid gap-1">
          <span>Tipo</span>
          <input
            className="border rounded px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </label>

        <label className="grid gap-1">
          <span>Ubicación</span>
          <input
            className="border rounded px-3 py-2"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
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
          <button
            type="button"
            className="border rounded px-4 py-2"
            onClick={() => router.push('/assets')}
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
