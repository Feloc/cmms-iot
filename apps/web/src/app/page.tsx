'use client';

import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <div>Cargando…</div>;

  if (!session) {
    return (
      <div className="p-8 space-y-3">
        <h1 className="text-xl font-semibold">CMMS IoT</h1>
        <button
          onClick={() => signIn('credentials')}
          className="px-4 py-2 rounded bg-blue-600 text-white"
        >
          Ingresar
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-2">
      <h1 className="text-xl font-semibold">Bienvenido</h1>
      <Link href="/dashboard" className="text-blue-600 underline">Dashboard</Link>
      <Link href="/alerts" className="text-blue-600 underline block">Alertas</Link>
    </div>
  );
}
