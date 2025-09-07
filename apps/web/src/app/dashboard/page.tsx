'use client';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';

const fetcher = (url: string, token?: string, tenant?: string) => fetch(url, { headers: { 'Authorization': token ? `Bearer ${token}` : '', 'x-tenant': tenant || '' } }).then(r=>r.json());

export default function Dashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const tenant = (session as any)?.user?.tenant;
  const { data: kpis } = useSWR(session ? [`${process.env.NEXT_PUBLIC_API_URL}/dashboard`, token, tenant] : null, ([url, t, te]) => fetcher(url, t, te));
  const { data: alerts } = useSWR(session ? [`${process.env.NEXT_PUBLIC_API_URL}/alerts/recent`, token, tenant] : null, ([url, t, te]) => fetcher(url, t, te));

  if (!session) return <div style={{ padding: 24 }}><a href="/">Inicia sesión</a></div>

  return (
    <div style={{ padding: 24 }}>
      <h1>Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <Card title="Disponibilidad" value={kpis?.availability + '%'} />
        <Card title="MTBF (h)" value={kpis?.mtbf} />
        <Card title="MTTR (h)" value={kpis?.mttr} />
        <Card title="Backlog WO" value={kpis?.backlog} />
        <Card title="% Preventivo" value={kpis?.preventivePct + '%'} />
      </div>
      <h2 style={{ marginTop: 24 }}>Alertas recientes</h2>
      <ul>
        {alerts?.map((a: any) => <li key={a.id}>[{a.kind}] {a.assetCode}/{a.sensor} – {a.message} – {new Date(a.createdAt).toLocaleString()}</li>)}
      </ul>
    </div>
  );
}

function Card({ title, value }: { title: string, value: any }) {
  return <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
    <div style={{ fontSize: 12, color: '#666' }}>{title}</div>
    <div style={{ fontSize: 24, fontWeight: 700 }}>{value ?? '—'}</div>
  </div>
}
