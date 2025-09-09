'use client';

import useSWR from 'swr';
import { useRouter, useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AssetForm, { AssetInput } from '../../../../components/assets/AssetForm';
import { apiFetch } from '../../../../lib/api';
import { useState } from 'react';

export default function EditAssetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);

  const token =
    (session as any)?.accessToken || (session as any)?.token || (session as any)?.user?.token;
  const tenant =
    (session as any)?.user?.tenant?.slug || (session as any)?.tenant?.slug || process.env.NEXT_PUBLIC_DEFAULT_TENANT;

  const { data, error, isLoading, mutate } = useSWR<any>(
    token && params?.id ? [`/assets/${params.id}`, token, tenant] : null,
    ([path, t, ten]) => apiFetch(path as string, t as string, ten as string)
  );

  async function onSubmit(form: AssetInput) {
    setSaving(true);
    try {
      await apiFetch(`/assets/${params.id}`, token, tenant, { method: 'PUT', body: JSON.stringify(form) });
      await mutate();
      router.push('/assets');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Editar asset</h1>
      {isLoading && <div>Cargando…</div>}
      {error && <div className="text-red-500 text-sm">Error cargando asset</div>}
      {data && <AssetForm initial={data} onSubmit={onSubmit} submitting={saving} />}
    </main>
  );
}
