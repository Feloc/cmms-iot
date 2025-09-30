"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// Tipos
type Asset = {
  id: string;
  code: string;
  name: string;
  brand?: string | null;
  model?: string | null;
  status: string;
  criticality: string;
  createdAt: string;
};

type AssetListResponse = {
  items: Asset[];
  page: number;
  size: number;
  total: number;
  pages: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function AssetsPage() {
  const { data: session } = useSession();

  // Obtén token y tenant del session (no de localStorage)
  const token =
    (session as any)?.accessToken ||
    (session as any)?.user?.token ||
    (session as any)?.jwt ||
    undefined;

  const tenantSlug =
    (session as any)?.user?.tenant?.slug ||
    (session as any)?.tenant?.slug ||
    (session as any)?.tenantSlug ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    undefined;

  const headers = React.useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    if (tenantSlug) h["x-tenant"] = tenantSlug; // ajusta a x-tenant-id si tu API lo espera
    return h;
  }, [token, tenantSlug]);

  const [assets, setAssets] = React.useState<Asset[]>([]);
  const [page, setPage] = React.useState(1);
  const [pages, setPages] = React.useState(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadAssets = React.useCallback(
    async (p: number) => {
      if (!tenantSlug) return; // No dispares hasta tener tenant
      setLoading(true);
      setError(null);
      try {
        const url = `${API_BASE}/assets?page=${p}&size=20`;
        const res = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers,
        });
        const text = await res.text();
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch {}
        if (!res.ok) {
          const msg = json?.message || json?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const data = json as AssetListResponse;
        setAssets(Array.isArray(data.items) ? data.items : []);
        setPage(data.page || p);
        setPages(data.pages || 1);
      } catch (e: any) {
        setError(e?.message || "Error cargando activos");
        setAssets([]);
        setPages(1);
      } finally {
        setLoading(false);
      }
    },
    [headers, tenantSlug]
  );

  React.useEffect(() => {
    if (tenantSlug) loadAssets(1);
  }, [tenantSlug, loadAssets]);

  const canPrev = page > 1 && !loading;
  const canNext = page < pages && !loading;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Activos</h1>
        <Link
          href="/assets/new"
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Nuevo Activo
        </Link>
      </div>

      {!tenantSlug && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
          No hay tenant en la sesión. Inicia sesión o selecciona un tenant para continuar.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Marca</th>
                <th className="px-3 py-2 text-left">Modelo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Criticidad</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    Cargando…
                  </td>
                </tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                    No hay activos registrados.
                  </td>
                </tr>
              ) : (
                assets.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-t">{a.code}</td>
                    <td className="px-3 py-2 border-t">{a.name}</td>
                    <td className="px-3 py-2 border-t">{a.brand ?? ''}</td>
                    <td className="px-3 py-2 border-t">{a.model ?? ''}</td>
                    <td className="px-3 py-2 border-t">{a.status}</td>
                    <td className="px-3 py-2 border-t">{a.criticality}</td>
                    <td className="px-3 py-2 border-t">
                      <div className="flex gap-2">
                        <Link href={`/assets/${a.id}`} className="px-2 py-1 rounded border hover:bg-gray-100">Ver</Link>
                        <Link href={`/assets/${a.id}/edit`} className="px-2 py-1 rounded border hover:bg-gray-100">Editar</Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          className={`px-3 py-1 rounded border ${canPrev ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
          disabled={!canPrev}
          onClick={() => loadAssets(page - 1)}
        >
          Anterior
        </button>
        <span className="text-sm text-gray-600">Página {page} de {pages}</span>
        <button
          className={`px-3 py-1 rounded border ${canNext ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
          disabled={!canNext}
          onClick={() => loadAssets(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
