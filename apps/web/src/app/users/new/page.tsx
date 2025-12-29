'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';

const ROLES = [
  { value: 'ADMIN', label: 'ADMIN (administrador)' },
  { value: 'TECH', label: 'TECH (técnico)' },
  { value: 'VIEWER', label: 'VIEWER (solo lectura)' },
] as const;

export default function NewUserPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('TECH');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>('');

  async function submit() {
    setErr('');
    const n = name.trim();
    const e = email.trim().toLowerCase();

    if (!n) return setErr('Nombre requerido.');
    if (!e) return setErr('Email requerido.');
    if (!e.includes('@')) return setErr('Email inválido.');
    if (!password) return setErr('Password requerido.');
    if (password !== password2) return setErr('Los passwords no coinciden.');
    if (password.length < 6) return setErr('Password muy corto (mínimo 6).');

    setBusy(true);
    try {
      await apiFetch(`/admin/users`, {
        method: 'POST',
        token: auth.token!,
        tenantSlug: auth.tenantSlug!,
        body: { name: n, email: e, role, password },
      });

      router.push('/users');
    } catch (e: any) {
      setErr(e?.message ?? 'No se pudo crear el usuario');
    } finally {
      setBusy(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Nuevo usuario</h1>
          <div className="text-sm text-gray-600">Crea un usuario dentro del tenant actual.</div>
        </div>
        <Link className="px-3 py-2 border rounded" href="/users">
          Volver
        </Link>
      </div>

      {err ? <div className="text-sm text-red-700 bg-red-50 border rounded p-3">{err}</div> : null}

      <div className="border rounded p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Nombre</label>
          <input className="border rounded px-3 py-2 w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Email</label>
          <input className="border rounded px-3 py-2 w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ej: tecnico@empresa.com" />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Rol</label>
          <select className="border rounded px-3 py-2 w-full" value={role} onChange={(e) => setRole(e.target.value as any)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Password</label>
            <input type="password" className="border rounded px-3 py-2 w-full" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Confirmar</label>
            <input type="password" className="border rounded px-3 py-2 w-full" value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button className="px-3 py-2 border rounded" onClick={() => { setName(''); setEmail(''); setPassword(''); setPassword2(''); setRole('TECH'); }}>
            Limpiar
          </button>
          <button className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50" disabled={busy} onClick={submit}>
            {busy ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Nota: este endpoint debería estar restringido a administradores (ADMIN).
      </div>
    </div>
  );
}
