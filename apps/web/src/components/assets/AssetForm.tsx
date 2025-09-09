'use client';

import { useState } from 'react';

export type AssetInput = {
  code: string;
  name: string;
  type?: string;
  location?: string;
};

export default function AssetForm({
  initial,
  onSubmit,
  submitting = false,
}: {
  initial?: Partial<AssetInput>;
  onSubmit: (data: AssetInput) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [form, setForm] = useState<AssetInput>({
    code: initial?.code ?? '',
    name: initial?.name ?? '',
    type: initial?.type ?? '',
    location: initial?.location ?? '',
  });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({
          code: form.code.trim(),
          name: form.name.trim(),
          type: form.type?.trim() || undefined,
          location: form.location?.trim() || undefined,
        });
      }}
    >
      <div>
        <label className="block text-sm font-medium">Código</label>
        <input
          className="mt-1 w-full rounded border p-2"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Nombre</label>
        <input
          className="mt-1 w-full rounded border p-2"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">Tipo</label>
          <input
            className="mt-1 w-full rounded border p-2"
            value={form.type ?? ''}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Ubicación</label>
          <input
            className="mt-1 w-full rounded border p-2"
            value={form.location ?? ''}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-xl px-4 py-2 bg-black text-white disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
