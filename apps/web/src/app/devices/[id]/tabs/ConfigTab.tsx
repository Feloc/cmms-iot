'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

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

export default function ConfigTab({ deviceId }: { deviceId: string }) {
  const { data: session } = useSession();
  const s = session as unknown as SessionLike | null;

  const tenantSlug = s?.user?.tenantSlug;
  const accessToken = s?.user?.accessToken || s?.accessToken || s?.token || s?.user?.token;

  const [device, setDevice] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!tenantSlug || !accessToken) return;
    setLoading(true);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'x-tenant': tenantSlug,
    };

    try {
      const d = await fetch(`${API_BASE}/devices/${deviceId}`, { headers }).then((r) => r.json());
      const a = await fetch(`${API_BASE}/assets`, { headers }).then((r) => r.json());

      setDevice(d);
      setAssets(a.items || []);
    } catch (err) {
      console.error('Error loading config tab:', err);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!device || !tenantSlug || !accessToken) return;
    setSaving(true);

    try {
      const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant': tenantSlug,
        },
        body: JSON.stringify({
          assetId: device.assetId || null,
          status: device.status,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      alert('Configuración actualizada correctamente');
    } catch (err) {
      console.error('Error updating device config', err);
      alert('Error al guardar los cambios');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, tenantSlug, accessToken]);

  if (loading)
    return (
      <div className="text-gray-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
      </div>
    );

  if (!device)
    return <div className="text-sm text-gray-500">No se encontró el dispositivo</div>;

  return (
    <div className="space-y-4 text-sm">
      {/* 🔧 Activo asociado */}
      <div>
        <label className="text-sm font-semibold">Activo asociado</label>
        <Select
          value={device.assetId || 'none'}
          onValueChange={(v) => setDevice({ ...device, assetId: v === 'none' ? null : v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleccionar activo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Ninguno —</SelectItem>
            {assets.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ⚙️ Estado */}
      <div>
        <label className="text-sm font-semibold">Estado</label>
        <Select
          value={device.status}
          onValueChange={(v) => setDevice({ ...device, status: v })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Activo</SelectItem>
            <SelectItem value="INACTIVE">Inactivo</SelectItem>
            <SelectItem value="MAINTENANCE">Mantenimiento</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 🔑 Clave de ingestión */}
      <div>
        <label className="text-sm font-semibold">Clave de ingestión</label>
        <Input readOnly value={device.ingestKey || ''} />
        <p className="text-xs text-gray-500 mt-1">
          Esta clave identifica al dispositivo para el envío de datos MQTT.
        </p>
      </div>

      {/* 💾 Guardar */}
      <Button
        onClick={save}
        disabled={saving}
        className="w-full sm:w-auto flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </div>
  );
}
