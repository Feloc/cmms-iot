'use client';
import { signIn, useSession } from 'next-auth/react';
import { useState } from 'react';

export default function Home() {
  const { data: session } = useSession();
  const [tenant, setTenant] = useState('acme');
  const [email, setEmail] = useState('admin@acme.local');
  const [password, setPassword] = useState('admin123');

  if (session) {
    return (
      <div style={{ padding: 24 }}>
        <h1>CMMS-IoT</h1>
        <p>Conectado como {session.user?.email as any} @ {(session.user as any)?.tenant}</p>
        <a href="/dashboard">Ir al dashboard →</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: '64px auto', padding: 24, border: '1px solid #eee', borderRadius: 12 }}>
      <h2>Ingresar</h2>
      <label>Tenant</label>
      <input value={tenant} onChange={e=>setTenant(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <label>Email</label>
      <input value={email} onChange={e=>setEmail(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <label>Password</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width: '100%', padding: 8 }} />
      <button style={{ marginTop: 12, padding: 10 }} onClick={() => signIn('credentials', { tenant, email, password, callbackUrl: '/dashboard' })}>Entrar</button>
    </div>
  );
}
