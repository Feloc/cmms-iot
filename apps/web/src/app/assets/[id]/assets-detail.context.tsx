'use client';


import React from 'react';
import { useSession } from 'next-auth/react';


export type AssetsDetailContextValue = {
assetId: string;
apiBase: string;
token?: string;
tenantSlug?: string;
headers: Record<string, string>;
};


const Ctx = React.createContext<AssetsDetailContextValue | null>(null);


export function useAssetsDetail() {
const ctx = React.useContext(Ctx);
if (!ctx) throw new Error('useAssetsDetail must be used within <AssetsDetailProvider>');
return ctx;
}


export function AssetsDetailProvider({ assetId, children }: { assetId: string; children: React.ReactNode }) {
const { data: session } = useSession();


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


const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';


const headers = React.useMemo(() => {
const h: Record<string, string> = {};
if (token) h['Authorization'] = `Bearer ${token}`;
if (tenantSlug) h['x-tenant'] = tenantSlug; // ajusta a x-tenant-id si tu API lo espera
return h;
}, [token, tenantSlug]);


const value: AssetsDetailContextValue = { assetId, apiBase, token, tenantSlug, headers };
return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}