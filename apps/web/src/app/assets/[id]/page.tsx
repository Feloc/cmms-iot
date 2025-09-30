'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useAssetsDetail, AssetsDetailProvider } from './assets-detail.context';

const OverviewTab = dynamic(() => import('./tabs/OverviewTab'), { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">Cargando resumen…</div> });
const AttachmentsTab = dynamic(() => import('./tabs/AttachmentsTab'), { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">Cargando adjuntos…</div> });
const InventoryTab = dynamic(() => import('./tabs/InventoryTab'), { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">Cargando inventario…</div> });
const ParametersTab = dynamic(() => import('./tabs/ParametersTab'), { ssr: false, loading: () => <div className="p-4 text-sm text-gray-500">Cargando parámetros…</div> });

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <div className="p-6">Falta id.</div>;
  return (
    <AssetsDetailProvider assetId={String(id)}>
      <DetailInner />
    </AssetsDetailProvider>
  );
}

function DetailInner() {
  const { assetId, apiBase, headers, tenantSlug } = useAssetsDetail();
  const [asset, setAsset] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const tabs = ['Resumen', 'Adjuntos', 'Inventario', 'Parámetros'] as const;
  type TabKey = typeof tabs[number];
  const [active, setActive] = React.useState<TabKey>('Resumen');

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantSlug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/assets/${assetId}`, { headers, credentials: 'include' });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch {}
        if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);
        if (!cancelled) setAsset(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Error cargando activo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [assetId, apiBase, headers, tenantSlug]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Detalle de Activo</h1>
          <div className="text-sm text-gray-500">
            {asset ? (<><span className="font-mono">{asset.code}</span> · {asset.name}</>) : '—'}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/assets" className="px-3 py-2 rounded border hover:bg-gray-100">← Volver</Link>
          {asset && <Link href={`/assets/${asset.id}/edit`} className="px-3 py-2 rounded border hover:bg-gray-100">Editar</Link>}
        </div>
      </div>

      {!tenantSlug && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">No hay tenant en la sesión.</div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm">{error}</div>
      )}

      <div className="flex gap-2 border-b">
        {tabs.map((t) => (
          <button key={t} onClick={() => setActive(t)} className={`px-3 py-2 -mb-px border-b-2 ${active === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-600 hover:text-gray-800'}`}>{t}</button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500">Cargando…</div>
      ) : asset ? (
        <div>
          {active === 'Resumen' && <OverviewTab asset={asset} />}
          {active === 'Adjuntos' && <AttachmentsTab />}
          {active === 'Inventario' && <InventoryTab />}
          {active === 'Parámetros' && <ParametersTab />}
        </div>
      ) : null}
    </div>
  );
}