'use client';

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { getAuthFromSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { NoticeForm, NoticeFormValues } from "../../../components/notices/NoticeForm";
import  AssetPicker  from "@/components/AssetPicker";

type NoticePayload = {
  source: 'MANUAL' | 'RULE' | 'IMPORT';
  assetCode: string;
  title: string;
  body?: string;
  category: 'INCIDENT' | 'MAINT_LOG' | 'CONSUMABLE_CHANGE' | 'INSPECTION' | 'OTHER';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  // …otros opcionales si quieres (assignedToUserId, dueDate, tags, etc.)
};

export default function NewNoticePage() {
  const { data: session } = useSession();
  const { token, tenantSlug } = getAuthFromSession(session);
  const router = useRouter();

  const [assetCode, setAssetCode] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<NoticePayload['category']>('INCIDENT');
  const [severity, setSeverity] = useState<NoticePayload['severity']>('MEDIUM');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!token || !tenantSlug) {
      setErr('No hay sesión válida.');
      return;
    }
    if (!assetCode) {
      setErr('Selecciona un activo.');
      return;
    }
    if (!title.trim()) {
      setErr('Ingresa un título.');
      return;
    }

    const payload: NoticePayload = {
      source: 'MANUAL',
      assetCode, // <<— guardamos CODE
      title: title.trim(),
      body: body.trim() || undefined,
      category,
      severity: severity || undefined,
    };

    try {
      setSaving(true);
      await apiFetch('/notices', {
        method: 'POST',
        token,
        tenantSlug,
        body: payload,
      });
      router.push('/notices');
    } catch (e: any) {
      setErr(e?.message || 'Error creando aviso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Nuevo aviso</h1>

      {err && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <AssetPicker
          label="Activo"
          required
          value={assetCode}
          onChange={setAssetCode}
        />

        <div>
          <label className="block text-sm font-medium mb-1">Título *</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Describe brevemente la novedad…"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Detalle</label>
          <textarea
            className="w-full rounded-xl border px-3 py-2 min-h-[120px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Información adicional, observaciones, etc."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Categoría</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={category}
              onChange={(e) => setCategory(e.target.value as NoticePayload['category'])}
            >
              <option value="INCIDENT">Incidente</option>
              <option value="MAINT_LOG">Registro mant.</option>
              <option value="CONSUMABLE_CHANGE">Cambio consumible</option>
              <option value="INSPECTION">Inspección</option>
              <option value="OTHER">Otra</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Severidad</label>
            <select
              className="w-full rounded-xl border px-3 py-2"
              value={severity ?? ''}
              onChange={(e) =>
                setSeverity((e.target.value || undefined) as NoticePayload['severity'])
              }
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="CRITICAL">Crítica</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Crear aviso'}
          </button>
        </div>
      </form>
    </div>
  );
}