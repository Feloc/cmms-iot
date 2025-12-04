'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from 'next-auth/react';

interface Device {
  id: string;
  name: string;
  code: string;
  model?: string;
  manufacturer?: string;
  status: string;
  asset?: { id: string; name: string };
  lastSeenAt?: string;
  createdAt: string;
}

export default function DevicesPage() {
  const { data: session } = useSession();
  const [devices, setDevices] = useState<Device[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!session?.user?.tenantSlug) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/devices?q=${encodeURIComponent(q)}`,
        {
          headers: {
            Authorization: `Bearer ${session?.user?.accessToken}`,
            'x-tenant': session.user.tenantSlug,
          },
        }
      );
      const json = await res.json();
      setDevices(json.items || []);
    } catch (err) {
      console.error('Error loading devices', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Dispositivos IoT</CardTitle>
        <Link href="/devices/new">
          <Button>Nuevo dispositivo</Button>
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={load} disabled={loading}>
            Buscar
          </Button>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Cargando...</div>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-2">Nombre</th>
                <th className="p-2">Código</th>
                <th className="p-2">Modelo</th>
                <th className="p-2">Fabricante</th>
                <th className="p-2">Activo</th>
                <th className="p-2">Último ping</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="p-2">{d.name}</td>
                  <td className="p-2">{d.code}</td>
                  <td className="p-2">{d.model || '-'}</td>
                  <td className="p-2">{d.manufacturer || '-'}</td>
                  <td className="p-2">{d.asset?.name || '-'}</td>
                  <td className="p-2 text-xs">{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '-'}</td>
                  <td className="p-2 text-right">
                    <Link href={`/devices/${d.id}`}>
                      <Button variant="outline" size="sm">Ver</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
