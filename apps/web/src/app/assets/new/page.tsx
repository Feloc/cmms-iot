'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';

export default function NewAssetPage() {
  const { data: session } = useSession();
  const token = (session as any)?.token;
  const tenant = (session as any)?.tenant?.slug || 'acme';
  const router = useRouter();

  const [form, setForm] = useState({ code: '', name: '', type: '', location: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string|undefined>();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await apiFetch('/assets', { method: 'POST', body: form, token, tenant });
      router.push('/assets');
    } catch (err: any) {
      setError(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="p-6 space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Nuevo Activo</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm">Código *</label>
          <input required className="border p-2 w-full rounded"
                 value={form.code} onChange={e=>setForm({...form, code:e.target.value})}/>
        </div>
        <div>
          <label className="block text-sm">Nombre *</label>
          <input required className="border p-2 w-full rounded"
                 value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
        </div>
        <div>
          <label className="block text-sm">Tipo</label>
          <input className="border p-2 w-full rounded"
                 value={form.type} onChange={e=>setForm({...form, type:e.target.value})}/>
        </div>
        <div>
          <label className="block text-sm">Ubicación</label>
          <input className="border p-2 w-full rounded"
                 value={form.location} onChange={e=>setForm({...form, location:e.target.value})}/>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button disabled={saving} className="px-3 py-2 rounded bg-blue-600 text-white">{saving?'Guardando…':'Guardar'}</button>
          <a className="px-3 py-2 rounded border" href="/assets">Cancelar</a>
        </div>
      </form>
    </main>
  );
}
