'use client';

import { ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AttachmentFilePicker } from '@/components/AttachmentFilePicker';
import { apiFetch } from '@/lib/api';
import { PUBLIC_API_BASE } from '@/lib/api-url';
import type { AssemblyActivity } from '@/lib/assemblies';

export function ActivityEvidence({
  activity,
  workOrderId,
  token,
  tenantSlug,
  canUpload,
  canDelete,
  onChanged,
}: {
  activity: AssemblyActivity;
  workOrderId: string;
  token: string;
  tenantSlug: string;
  canUpload: boolean;
  canDelete: boolean;
  onChanged: () => unknown | Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = activity.attachments || [];

  async function upload(files: FileList) {
    const file = files[0];
    if (!file) return;
    const type = file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('video/') ? 'VIDEO' : 'DOCUMENT';
    const body = new FormData();
    body.append('file', file);
    body.append('workOrderId', workOrderId);
    body.append('assemblyActivityId', activity.id);
    body.append('type', type);
    setBusy(true); setError('');
    try {
      const response = await fetch(`${PUBLIC_API_BASE}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant': tenantSlug },
        body,
      });
      if (!response.ok) throw new Error(await response.text().catch(() => 'No se pudo subir la evidencia'));
      await onChanged();
    } catch (e: any) {
      setError(e?.message || 'No se pudo subir la evidencia');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!canDelete || !window.confirm('¿Eliminar esta evidencia?')) return;
    setBusy(true); setError('');
    try {
      await apiFetch(`/attachments/${id}`, { method: 'DELETE', token, tenantSlug });
      await onChanged();
    } catch (e: any) {
      setError(e?.message || 'No se pudo eliminar la evidencia');
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded border bg-white/70 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Evidencias {activity.evidenceRequired ? <span className="text-red-600">*</span> : null}</div>
          <div className="text-xs text-gray-500">{items.length} archivo{items.length === 1 ? '' : 's'}{activity.evidenceRequired && !items.length ? ' · requerida para completar' : ''}</div>
        </div>
        {canUpload ? <AttachmentFilePicker label="Adjuntar evidencia" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" multiple={false} disabled={busy} onFiles={upload} /> : null}
      </div>
      {error ? <div className="text-xs text-red-700 whitespace-pre-wrap">{error}</div> : null}
      {items.length ? <div className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="border rounded px-3 py-2 flex items-center justify-between gap-2 text-sm bg-white">
            <div className="min-w-0"><div className="truncate" title={item.filename}>{item.filename}</div><div className="text-xs text-gray-500">{item.type} · {new Date(item.createdAt).toLocaleString()}</div></div>
            <div className="flex gap-1 shrink-0">
              <a className="border rounded p-2" href={`${PUBLIC_API_BASE}/attachments/${item.id}/view`} target="_blank" rel="noreferrer" title="Ver evidencia"><ExternalLink className="w-4 h-4" /></a>
              {canDelete ? <button className="border rounded p-2 text-red-700" onClick={() => remove(item.id)} title="Eliminar evidencia"><Trash2 className="w-4 h-4" /></button> : null}
            </div>
          </div>
        ))}
      </div> : null}
    </div>
  );
}
