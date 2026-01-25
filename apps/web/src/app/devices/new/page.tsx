'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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

export default function NewDevicePage() {
  const { data: session } = useSession();
  const s = session as unknown as SessionLike | null;

  const tenantSlug = s?.user?.tenantSlug;
  const accessToken = s?.user?.accessToken || s?.accessToken || s?.token || s?.user?.token;

  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    code: '',
    model: '',
    manufacturer: '',
    description: '',
  });
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!tenantSlug || !accessToken) {
      alert('Sesión inválida: falta tenant o token');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'x-tenant': tenantSlug,
        },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push('/devices');
    } catch (err) {
      console.error('Error creating device', err);
      alert('Error al crear dispositivo');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Nuevo Dispositivo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <Input placeholder="Modelo" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        <Input
          placeholder="Fabricante"
          value={form.manufacturer}
          onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
        />
        <textarea
          placeholder="Descripción"
          className="border rounded p-2 text-sm"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Button onClick={save} disabled={loading}>
          {loading ? 'Guardando...' : 'Guardar'}
        </Button>
      </CardContent>
    </Card>
  );
}
