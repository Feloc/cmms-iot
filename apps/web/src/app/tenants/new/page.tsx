'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function NewTenantPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const router = useRouter();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  // Admin inicial del tenant
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPassword2, setAdminPassword2] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');

  const slugPreview = useMemo(() => (slug.trim() ? slugify(slug) : slugify(name)), [slug, name]);

  async function submit() {
    setErr('');
    const n = name.trim();
    const s = slugPreview;

    const an = adminName.trim();
    const ae = adminEmail.trim().toLowerCase();

    if (!n) return setErr('Nombre requerido.');
    if (!s) return setErr('Slug requerido.');

    if (!an) return setErr('Nombre del admin requerido.');
    if (!ae || !ae.includes('@')) return setErr('Email del admin inválido.');
    if (!adminPassword) return setErr('Password del admin requerido.');
    if (adminPassword.length < 6) return setErr('Password muy corto (mínimo 6).');
    if (adminPassword !== adminPassword2) return setErr('Los passwords del admin no coinciden.');

    setBusy(true);
    try {
      await apiFetch(`/tenants/provision`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!, // IMPORTANTE: esto debe ser el platform tenant
        body: { name: n, slug: s, adminName: an, adminEmail: ae, adminPassword },
      });

      router.push('/tenants');
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo provisionar el tenant');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Nuevo tenant</h1>
          <div className="text-sm text-gray-600">Crea un tenant y el primer usuario ADMIN para ese tenant.</div>
        </div>
        <Link className="px-3 py-2 border rounded" href="/tenants">
          Volver
        </Link>
      </div>

      {err ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{err}</div> : null}

      <div className="border rounded p-4 space-y-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nombre del tenant</label>
            <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Acme S.A.S." />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Slug</label>
            <input className="border rounded px-3 py-2 w-full" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Ej: acme" />
            <div className="text-xs text-gray-600">
              Se guardará como: <span className="font-mono">{slugPreview || '—'}</span>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="font-semibold">Admin inicial del tenant</div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Nombre</label>
            <input className="border rounded px-3 py-2 w-full" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Ej: Admin Acme" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input className="border rounded px-3 py-2 w-full" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@acme.com" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <input type="password" className="border rounded px-3 py-2 w-full" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirmar</label>
              <input type="password" className="border rounded px-3 py-2 w-full" value={adminPassword2} onChange={(e) => setAdminPassword2(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            className="px-3 py-2 border rounded"
            onClick={() => {
              setName('');
              setSlug('');
              setAdminName('');
              setAdminEmail('');
              setAdminPassword('');
              setAdminPassword2('');
            }}
          >
            Limpiar
          </button>
          <button className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50" disabled={busy} onClick={submit}>
            {busy ? 'Creando…' : 'Provisionar tenant'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <div>IMPORTANTE: debes estar logueado en el <b>platform tenant</b> para usar esta página.</div>
      </div>
    </div>
  );
}
