'use client';

import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { useApiSWR } from '@/lib/swr';

type TenantBrand = {
  legalName?: string | null;
  name?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
};

type AssetInfo = {
  code?: string | null;
  customer?: string | null;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
};

type ServiceOrderInfo = {
  id: string;
  title?: string | null;
  status?: string | null;
  serviceOrderType?: string | null;
  hasIssue?: boolean;
  assetCode?: string | null;
};

type QuoteLine = {
  line: number;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  priced?: boolean;
};

type QuoteData = {
  id: string;
  version: number;
  status?: string | null;
  currency?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  subtotal?: number;
  laborAmount?: number;
  taxPct?: number;
  taxAmount?: number;
  total?: number;
  missingPriceItems?: number;
  items: QuoteLine[];
};

type QuoteResponse = {
  tenant?: TenantBrand | null;
  asset?: AssetInfo | null;
  serviceOrder: ServiceOrderInfo;
  quote: QuoteData;
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function fmtMoney(v?: number | null, currency = 'COP') {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  return `${currency} ${n.toFixed(2)}`;
}

export default function ServiceOrderQuotePage() {
  const { id, quoteId } = useParams<{ id: string; quoteId: string }>();
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const { data, error, isLoading } = useApiSWR<QuoteResponse>(
    id && quoteId && isAdmin ? `/service-orders/${id}/quotes/${quoteId}` : null,
    auth.token,
    auth.tenantSlug,
  );

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado.</div>;
  if (isLoading) return <div className="p-6">Cargando...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {(error as any).message}</div>;
  if (!data) return <div className="p-6">No encontrado.</div>;

  const tenant = data.tenant ?? null;
  const so = data.serviceOrder;
  const asset = data.asset ?? null;
  const quote = data.quote;
  const currency = String(quote.currency || 'COP');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="text-sm text-gray-600">Cotización · v{quote.version}</div>
          <h1 className="text-2xl font-semibold">Cotización de repuestos</h1>
          <div className="text-sm text-gray-600">Generada: {fmtDateTime(quote.createdAt)}</div>
        </div>
        <button type="button" className="px-3 py-2 border rounded" onClick={() => window.print()}>
          Imprimir / Guardar PDF
        </button>
      </div>

      <section className="border rounded p-4">
        <div className="flex items-center gap-4">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
          ) : null}
          <div className="space-y-0.5">
            <div className="font-semibold">{tenant?.legalName ?? tenant?.name ?? 'Empresa'}</div>
            <div className="text-sm text-gray-600">
              {tenant?.taxId ? `NIT: ${tenant.taxId}` : null}
              {tenant?.taxId && tenant?.phone ? ' · ' : null}
              {tenant?.phone ? `Tel: ${tenant.phone}` : null}
            </div>
            <div className="text-sm text-gray-600">
              {tenant?.address ?? ''}
              {tenant?.address && (tenant?.email || tenant?.website) ? ' · ' : null}
              {tenant?.email ?? ''}
              {tenant?.email && tenant?.website ? ' · ' : null}
              {tenant?.website ?? ''}
            </div>
          </div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div><b>OS:</b> {so.id}</div>
          <div><b>Estado:</b> {so.status ?? '-'}</div>
        </div>
        <div>
          <div className="font-medium">{so.title ?? '-'}</div>
          <div className="text-gray-600">Tipo: {so.serviceOrderType ?? '-'} · Novedad: {so.hasIssue ? 'Sí' : 'No'}</div>
        </div>
        <div>
          <b>Activo:</b> {asset?.code ?? so.assetCode ?? '-'} · {asset?.name ?? '-'}
          <div className="text-gray-600">Cliente: {asset?.customer ?? '-'}</div>
          <div className="text-gray-600">{asset?.brand ?? ''} {asset?.model ?? ''} {asset?.serialNumber ? `· SN: ${asset.serialNumber}` : ''}</div>
        </div>
      </section>

      <section className="border rounded p-4 space-y-3">
        <div className="font-semibold">Detalle de cotización</div>
        <div className="border rounded overflow-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Descripción</th>
                <th className="text-right p-2">Cantidad</th>
                <th className="text-right p-2">Valor unitario</th>
                <th className="text-right p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {(quote.items ?? []).map((it) => (
                <tr key={`${it.line}-${it.description}`} className="border-b last:border-b-0">
                  <td className="p-2">{it.line}</td>
                  <td className="p-2">
                    {it.description}
                    {it.priced === false ? <span className="ml-2 text-xs text-amber-700">(sin precio)</span> : null}
                  </td>
                  <td className="p-2 text-right">{Number(it.qty ?? 0).toFixed(2)}</td>
                  <td className="p-2 text-right">{fmtMoney(it.unitPrice, currency)}</td>
                  <td className="p-2 text-right">{fmtMoney(it.lineTotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="border rounded p-3">
            <div className="font-medium mb-1">Notas</div>
            <div className="whitespace-pre-wrap text-gray-700">{quote.notes?.trim() ? quote.notes : 'Sin notas.'}</div>
            {Number(quote.missingPriceItems ?? 0) > 0 ? (
              <div className="mt-2 text-amber-700">
                Esta cotización tiene {Number(quote.missingPriceItems)} ítem(s) sin precio unitario.
              </div>
            ) : null}
          </div>

          <div className="border rounded p-3">
            <div className="flex items-center justify-between"><span>Subtotal</span><b>{fmtMoney(quote.subtotal, currency)}</b></div>
            <div className="flex items-center justify-between"><span>Mano de obra</span><b>{fmtMoney(quote.laborAmount, currency)}</b></div>
            <div className="flex items-center justify-between"><span>Impuesto ({Number(quote.taxPct ?? 0).toFixed(2)}%)</span><b>{fmtMoney(quote.taxAmount, currency)}</b></div>
            <div className="border-t mt-2 pt-2 flex items-center justify-between text-base"><span className="font-semibold">Total</span><b>{fmtMoney(quote.total, currency)}</b></div>
          </div>
        </div>
      </section>
    </div>
  );
}
