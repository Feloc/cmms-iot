'use client';

import { useState } from "react";

export type NoticeFormValues = {
  title: string;
  body?: string;
  assetCode?: string;
  status?: 'OPEN' | 'ACK' | 'ESCALATED' | 'CLOSED';
};

export function NoticeForm(props: {
  initial?: NoticeFormValues;
  onSubmit: (values: NoticeFormValues) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [values, setValues] = useState<NoticeFormValues>({
    title: props.initial?.title ?? "",
    body: props.initial?.body ?? "",
    assetCode: props.initial?.assetCode ?? "",
    status: props.initial?.status ?? "OPEN",
  });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await props.onSubmit(values);
      }}
    >
      <div>
        <label className="block text-sm font-medium mb-1">Título</label>
        <input
          className="w-full border rounded px-3 py-2"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Descripción</label>
        <textarea
          className="w-full border rounded px-3 py-2 min-h-[100px]"
          value={values.body}
          onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Asset code</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={values.assetCode}
            onChange={(e) => setValues((v) => ({ ...v, assetCode: e.target.value }))}
            placeholder="p.ej. pump-001"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Estado</label>
          <select
            className="w-full border rounded px-3 py-2"
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as any }))}
          >
            <option value="OPEN">OPEN</option>
            <option value="ACK">ACK</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
          disabled={props.submitting}
        >
          {props.submitting ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
