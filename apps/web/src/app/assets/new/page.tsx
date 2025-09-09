'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AssetForm, { AssetInput } from '../../../components/assets/AssetForm';
import { apiFetch } from '../../../lib/api';

export default function NewAssetPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);

  const token =
    (session as any)?.accessToken || (session as any)?.token || (session as any)?.user?.token;
  const tenant =
    (session as any)?.user?.tenant?.slug || (session as any)?.tenant?.slug || process.env.NEXT_PUBLIC_DEFAULT_TENANT;

  async function onSubmit(data: AssetInput) {
    setSaving(true);
    try {
      await apiFetch('/assets', token, tenant, { method: 'POST', body: JSON.stringify(data) });
      router.push('/assets');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo asset</h1>
      <AssetForm onSubmit={onSubmit} submitting={saving} />
    </main>
  );
}
