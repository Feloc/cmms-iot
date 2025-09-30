'use client';

import React from 'react';
import { useAssetsDetail } from '../assets-detail.context';

export default function ParametersTab() {
  const { assetId, apiBase, headers } = useAssetsDetail();
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ key: '', value: '', unit: '' });

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `${apiBase}/asset-parameters?assetId=${encodeURIComponent(assetId)}`;
      const res = await fetch(url, { headers, credentials: 'include' });
      const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      const arr = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
      setRows(arr);
    } catch (e: any) { setError(e?.message || 'No fue posible cargar parámetros'); setRows([]); }
    finally { setLoading(false); }
  }, [apiBase, assetId, headers]);

  React.useEffect(() => { load(); }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.key || !form.value) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${apiBase}/asset-parameters`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ assetId, key: form.key, value: form.value, unit: form.unit || null }),
      });
      const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch {}
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
      setForm({ key: '', value: '', unit: '' }); await load();
    } catch (e: any) { setError(e?.message || 'No fue posible guardar'); } finally { setSaving(false); }
  }

  return (
    <section className="space-y-4">
      <form onSubmit={onAdd} className="flex flex-wrap gap-3 items-end">
        <label className="text-sm">
          <span className="block text-gray-600">Clave</span>
          <input className="mt-1 border rounded px-2 py-1" value={form.key} onChange={(e)=>setForm(s=>({...s, key: e.target.value}))} required />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Valor</span>
          <input className="mt-1 border rounded px-2 py-1" value={form.value} onChange={(e)=>setForm(s=>({...s, value: e.target.value}))} required />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600">Unidad</span>
          <input className="mt-1 border rounded px-2 py-1" value={form.unit} onChange={(e)=>setForm(s=>({...s, unit: e.target.value}))} />
        </label>
        <button type="submit" disabled={saving || !form.key || !form.value} className={`px-4 py-2 rounded text-white ${saving || !form.key || !form.value ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{saving ? 'Guardando…' : 'Agregar'}</button>
        <button type="button" onClick={load} disabled={loading} className="px-3 py-2 rounded border hover:bg-gray-100">Refrescar</button>
      </form>

      {error && <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">{error}</div>}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>
              <th className="px-3 py-2 text-left">Clave</th>
              <th className="px-3 py-2 text-left">Valor</th>
              <th className="px-3 py-2 text-left">Unidad</th>
              <th className="px-3 py-2 text-left">Actualizado</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Sin parámetros.</td></tr>
              ) : rows.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border-t">{p.key}</td>
                  <td className="px-3 py-2 border-t">{p.value}</td>
                  <td className="px-3 py-2 border-t">{p.unit ?? '—'}</td>
                  <td className="px-3 py-2 border-t">{p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
