"use client";
import { Logger } from "@nestjs/common";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApiSWR } from "@/lib/swr";

type Asset = {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  location?: string | null;
};

function getTenantSlugFromSession(session: any): string | undefined {
  return (
    session?.tenant?.slug ||
    session?.user?.tenant?.slug ||
    session?.user?.tenantSlug ||
    process.env.NEXT_PUBLIC_TENANT_SLUG
  );
}

export default function AssetsPage() {
  const { data: session, status } = useSession();

  // SIEMPRE define token/tenant y llama al hook:
  const token = (session as any)?.token as string | undefined;
  const tenantSlug = getTenantSlugFromSession(session);
  const { data, error, isLoading } = useApiSWR<Asset[]>(
    "assets",
    token,
    tenantSlug
  );

  if (status === "loading") return <p className="p-4">Cargando sesión…</p>;
  if (status !== "authenticated") {
    return (
      <div className="p-4 space-y-2">
        <h1 className="text-xl font-semibold">Assets</h1>
        <p>
          No autenticado.{" "}
          <Link href="/login" className="text-blue-600 underline">
            Inicia sesión
          </Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <Link href="/assets/new" className="px-3 py-2 rounded bg-blue-600 text-white">
          Nuevo
        </Link>
      </div>

      {!tenantSlug && (
        <div className="rounded border p-3 text-sm">
          <b>Atención:</b> no encuentro el <code>tenantSlug</code> en la sesión.
          En desarrollo puedes definir <code>NEXT_PUBLIC_TENANT_SLUG=acme</code> en <code>apps/web/.env.local</code>.
        </div>
      )}

      {isLoading && <p>Cargando…</p>}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm">
          Error cargando assets: {(error as Error).message}
        </div>
      )}

      {!!data && data.length === 0 && <p>No hay assets.</p>}

      {!!data && data.length > 0 && (
        <ul className="divide-y border rounded">
          {data.map((a) => (
            <li key={a.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{a.name}</div>
                <div className="text-sm text-gray-500">
                  {a.code}
                  {a.type ? ` • ${a.type}` : ""}
                  {a.location ? ` • ${a.location}` : ""}
                </div>
              </div>
              <Link className="text-blue-600 hover:underline" href={`/assets/${a.id}/edit`}>
                Editar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
