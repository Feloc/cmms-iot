'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';

type TenantBranding = {
  id: string;
  slug: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  updatedAt?: string | null;
};

function toInput(v?: string | null) {
  return v ?? '';
}

export default function TenantBrandingPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const { data, error, isLoading, mutate } = useApiSWR<TenantBranding>(
    auth.token && auth.tenantSlug && isAdmin ? '/tenant-branding' : null,
    auth.token,
    auth.tenantSlug,
  );

  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!data) return;
    setLegalName(toInput(data.legalName));
    setTaxId(toInput(data.taxId));
    setAddress(toInput(data.address));
    setPhone(toInput(data.phone));
    setEmail(toInput(data.email));
    setWebsite(toInput(data.website));
    setLogoUrl(toInput(data.logoUrl));
  }, [data?.id, data?.updatedAt]);

  async function save() {
    if (!auth.token || !auth.tenantSlug || !isAdmin) return;
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await apiFetch('/tenant-branding', {
        method: 'PATCH',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: { legalName, taxId, address, phone, email, website, logoUrl },
      });
      setMsg('Branding actualizado.');
      await mutate();
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo actualizar el branding');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado. Esta configuración es solo para ADMIN.</div>;

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Branding del Tenant</h1>
        <div className="text-sm text-gray-600">
          Configura cómo aparece tu empresa en cotizaciones y reportes.
        </div>
      </div>

      {isLoading ? <div className="text-sm text-gray-600">Cargando…</div> : null}
      {error ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{(error as any).message}</div> : null}
      {err ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{err}</div> : null}
      {msg ? <div className="text-sm text-green-700 bg-green-50 border rounded p-3">{msg}</div> : null}

      <div className="border rounded p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tenant</label>
            <input className="border rounded px-3 py-2 w-full bg-gray-50" value={data?.name ?? ''} readOnly />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Slug</label>
            <input className="border rounded px-3 py-2 w-full bg-gray-50 font-mono" value={data?.slug ?? ''} readOnly />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Razón social</label>
          <input className="border rounded px-3 py-2 w-full" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">NIT / Tax ID</label>
            <input className="border rounded px-3 py-2 w-full" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Teléfono</label>
            <input className="border rounded px-3 py-2 w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Dirección</label>
          <input className="border rounded px-3 py-2 w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input className="border rounded px-3 py-2 w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Sitio web</label>
            <input className="border rounded px-3 py-2 w-full" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">URL del logo</label>
          <input className="border rounded px-3 py-2 w-full" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>

        {logoUrl.trim() ? (
          <div className="border rounded p-3 bg-gray-50">
            <div className="text-xs text-gray-600 mb-2">Vista previa</div>
            <img
              src={logoUrl}
              alt="Logo tenant"
              className="h-14 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 border rounded"
            onClick={() => {
              setLegalName(toInput(data?.legalName));
              setTaxId(toInput(data?.taxId));
              setAddress(toInput(data?.address));
              setPhone(toInput(data?.phone));
              setEmail(toInput(data?.email));
              setWebsite(toInput(data?.website));
              setLogoUrl(toInput(data?.logoUrl));
            }}
            disabled={busy}
          >
            Restaurar
          </button>
          <button className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50" disabled={busy} onClick={save}>
            {busy ? 'Guardando…' : 'Guardar branding'}
          </button>
        </div>
      </div>
    </div>
  );
}
