'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

type SessionLike = {
  user?: {
    tenantSlug?: string;
    accessToken?: string;
    token?: string;
  };
  accessToken?: string;
  token?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function OverviewTab({ deviceId }: { deviceId: string }) {
  const { data: session } = useSession();
  const s = session as unknown as SessionLike | null;

  const tenantSlug = s?.user?.tenantSlug;
  const accessToken = s?.user?.accessToken || s?.accessToken || s?.token || s?.user?.token;

  const [device, setDevice] = useState<any>(null);

  useEffect(() => {
    if (!tenantSlug || !accessToken) return;

    fetch(`${API_BASE}/devices/${deviceId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-tenant': tenantSlug,
      },
    })
      .then((r) => r.json())
      .then(setDevice)
      .catch(console.error);
  }, [deviceId, tenantSlug, accessToken]);

  if (!device) return <div className="text-sm text-gray-500">Cargando información...</div>;

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <strong>Nombre:</strong> {device.name}
      </div>
      <div>
        <strong>Código:</strong> {device.code}
      </div>
      <div>
        <strong>Modelo:</strong> {device.model || '-'}
      </div>
      <div>
        <strong>Fabricante:</strong> {device.manufacturer || '-'}
      </div>
      <div>
        <strong>Activo asociado:</strong> {device.asset?.name || '-'}
      </div>
      <div>
        <strong>Estado:</strong> {device.status}
      </div>
      <div>
        <strong>Último Ping:</strong>{' '}
        {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : '—'}
      </div>
      <div>
        <strong>Ingest Key:</strong> <code>{device.ingestKey}</code>
      </div>
    </div>
  );
}
