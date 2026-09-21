'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

const fields = [
  ['code', 'Código', 'text'], ['name', 'Nombre', 'text'],
  ['brand', 'Marca', 'text'], ['model', 'Modelo', 'text'],
  ['serialNumber', 'Número de serie', 'text'], ['customer', 'Cliente', 'text'],
  ['nominalPower', 'Potencia nominal', 'number'], ['nominalPowerUnit', 'Unidad de potencia', 'text'],
  ['acquiredOn', 'Fecha de adquisición', 'date'], ['guarantee', 'Vencimiento de garantía', 'date'],
] as const;
type Field = typeof fields[number][0] | 'status' | 'criticality';
type Form = Record<Field, string>;
type Asset = { id: string } & Partial<Record<Field, string | number | null>>;

function toForm(asset: Asset): Form {
  return Object.fromEntries([
    ...fields.map(([key, , type]) => [key, type === 'date'
      ? String(asset[key] ?? '').slice(0, 10) : String(asset[key] ?? '')]),
    ['status', asset.status ?? 'ACTIVE'], ['criticality', asset.criticality ?? 'MEDIUM'],
  ]) as Form;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'No se pudo completar la operación.';
  const jsonStart = message.indexOf('{');
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(message.slice(jsonStart));
      if (body.message) return Array.isArray(body.message) ? body.message.join('. ') : String(body.message);
    } catch { /* The server may return a non-JSON error. */ }
  }
  return message.startsWith('API ') ? 'No se pudo completar la operación. Inténtalo de nuevo.' : message;
}

export default function EditAssetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const [loaded, setLoaded] = useState<{ id: string; tenant: string; initial: Form } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<'save' | 'delete' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const busy = operation !== null;
  const dirty = !!form && !!loaded && JSON.stringify(form) !== JSON.stringify(loaded.initial);
  const available = loaded?.id === id && loaded?.tenant === tenantSlug;

  useEffect(() => {
    if (status === 'loading') return;
    if (!token || !tenantSlug) {
      setLoading(false);
      setLoaded(null);
      setErr('Inicia sesión para editar el activo.');
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    apiFetch<Asset>(`assets/${id}`, { token, tenantSlug })
      .then((asset) => {
        if (!active) return;
        const initial = toForm(asset);
        setLoaded({ id, tenant: tenantSlug, initial });
        setForm(initial);
      })
      .catch((error) => { if (active) { setLoaded(null); setErr(errorMessage(error)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, token, tenantSlug, status, attempt]);

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function cancel() {
    if (!busy && (!dirty || window.confirm('¿Descartar los cambios sin guardar?'))) router.push(`/assets/${id}`);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !loaded || !available || locked.current || !dirty) return;
    if (!form.code.trim() || !form.name.trim()) { setErr('El código y el nombre son obligatorios.'); return; }
    if (form.nominalPower && (!Number.isFinite(Number(form.nominalPower)) || Number(form.nominalPower) < 0)) {
      setErr('La potencia nominal debe ser un número mayor o igual a cero.'); return;
    }
    // Send only edited fields; null explicitly clears optional values.
    const body = Object.fromEntries((Object.keys(form) as Field[])
      .filter((key) => form[key] !== loaded.initial[key])
      .map((key) => [key, key === 'nominalPower'
        ? (form[key] === '' ? null : Number(form[key])) : (form[key].trim() || null)]));
    locked.current = true;
    setOperation('save');
    setErr(null);
    try {
      await apiFetch(`assets/${id}`, { method: 'PATCH', token, tenantSlug, body });
      setLoaded({ ...loaded, initial: form });
      router.push(`/assets/${id}`);
      router.refresh();
    } catch (error) { setErr(errorMessage(error)); }
    finally { locked.current = false; setOperation(null); }
  }

  async function remove() {
    if (locked.current || !available || !loaded) return;
    if (!window.confirm(`¿Eliminar el activo "${loaded.initial.name}" (${loaded.initial.code})? Esta acción no se puede deshacer.`)) return;
    locked.current = true;
    setOperation('delete');
    setErr(null);
    try {
      await apiFetch(`assets/${id}`, { method: 'DELETE', token, tenantSlug });
      setLoaded(null);
      router.push('/assets');
      router.refresh();
    } catch (error) { setErr(errorMessage(error)); }
    finally { locked.current = false; setOperation(null); }
  }

  if (loading || status === 'loading') return <div className="p-6 flex items-center gap-2" role="status"><Loader2 className="h-4 w-4 animate-spin" />Cargando activo...</div>;
  if (!form || !available) return <div className="p-6 space-y-4">
    <p role="alert">{err || 'No se encontró el activo.'}</p>
    <Button variant="outline" onClick={() => router.push('/assets')}><ArrowLeft />Volver a activos</Button>
    <Button className="ml-2" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button>
  </div>;

  const inputClass = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" title="Volver al activo" aria-label="Volver al activo" disabled={busy} onClick={cancel}><ArrowLeft /></Button>
        <div className="min-w-0"><h1 className="text-2xl font-semibold">Editar activo</h1><p className="break-words text-sm text-muted-foreground">{loaded?.initial.code} · {loaded?.initial.name}</p></div>
      </div>
      <form onSubmit={save} className="space-y-6" aria-busy={busy}>
        <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <legend className="mb-4 text-base font-medium">Datos del activo</legend>
          {fields.map(([key, label, type]) => <label key={key} className="grid min-w-0 gap-1.5 text-sm font-medium">
            <span>{label}{key === 'code' || key === 'name' ? ' *' : ''}</span>
            <input name={key} type={type} className={inputClass} value={form[key]} required={key === 'code' || key === 'name'}
              min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined}
              onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
          </label>)}
          <label className="grid gap-1.5 text-sm font-medium">Estado
            <select className={inputClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="COMMISSIONING">Puesta en marcha</option><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option><option value="DECOMMISSIONED">Dado de baja</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">Criticidad
            <select className={inputClass} value={form.criticality} onChange={(event) => setForm({ ...form, criticality: event.target.value })}>
              <option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option>
            </select>
          </label>
        </fieldset>
        {err && <p role="alert" className="break-words text-sm text-destructive">{err}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={busy || !dirty}>{operation === 'save' ? <Loader2 className="animate-spin" /> : <Save />}{operation === 'save' ? 'Guardando...' : 'Guardar cambios'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancelar</Button>
          <Button type="button" variant="ghost" className="text-destructive sm:ml-auto" disabled={busy} onClick={remove}>{operation === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}{operation === 'delete' ? 'Eliminando...' : 'Eliminar activo'}</Button>
        </div>
      </form>
    </div>
  );
}
