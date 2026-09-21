'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { ManufacturingControl } from '../ManufacturingControl';

export default function ManufacturingControlPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  return <main className="p-4 md:p-6 space-y-4"><Link className="text-sm underline" href="/manufacturing">← Manufactura</Link><ManufacturingControl auth={auth} /></main>;
}
