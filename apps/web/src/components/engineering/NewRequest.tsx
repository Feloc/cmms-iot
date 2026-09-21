'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiSWR } from '@/lib/swr';
import { apiFetch } from '@/lib/api';
import { EngineeringAsset, RequestFields as Fields, engineeringError, engineeringInput } from '@/lib/engineering';
import RequestFields from './RequestFields';

export default function NewRequest({ auth, assetId, workOrderId, noticeId, onClose }: {
  auth: { token?: string; tenantSlug?: string }; assetId?: string; workOrderId?: string; noticeId?: string; onClose: () => void;
}) {
  const router = useRouter();
  const [asset, setAsset] = useState<EngineeringAsset | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<Fields>({ title: '', problem: '', expectedBenefit: '', requestType: 'IMPROVEMENT', discipline: 'GENERAL', priority: 'MEDIUM', desiredDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const originPath = workOrderId || noticeId ? '/engineering-requests/context?' + new URLSearchParams(workOrderId ? { workOrderId } : { noticeId: noticeId! }) : null;
  const { data: origin, error: originError, isLoading: originLoading } = useApiSWR<{ asset: EngineeringAsset; title: string }>(originPath, auth.token, auth.tenantSlug);
  const { data: initial, error: assetError, isLoading: assetLoading } = useApiSWR<EngineeringAsset>(assetId ? '/assets/' + assetId : null, auth.token, auth.tenantSlug);
  const { data: results, error: searchError } = useApiSWR<{ items: EngineeringAsset[] }>(!asset && !assetId && !originPath ? '/assets?' + new URLSearchParams({ search, size: '10' }) : null, auth.token, auth.tenantSlug);
  useEffect(() => { if (origin) { setAsset(origin.asset); setForm((f) => ({ ...f, title: f.title || origin.title })); } else if (initial) setAsset(initial); }, [origin, initial]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!asset || lock.current) return;
    if (!form.title.trim() || !form.problem.trim() || !form.expectedBenefit.trim()) { setError('Completa los campos obligatorios.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await apiFetch<{ id: string }>('/engineering-requests', { ...auth, method: 'POST', body: {
        ...form, desiredDate: form.desiredDate || undefined, assetId: asset.id, originWorkOrderId: workOrderId, originNoticeId: noticeId,
      } });
      router.push('/engineering-requests/' + result.id);
      onClose();
    } catch (e) { setError(engineeringError(e)); } finally { lock.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !lock.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-lg bg-white text-gray-900">
      <DialogHeader><DialogTitle>Solicitud de ingeniería</DialogTitle><DialogDescription>{asset ? asset.code + ' · ' + asset.name : 'Nuevo expediente'}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy || originLoading || assetLoading} className="min-w-0 space-y-4">
          {!asset && !assetId && !originPath && <div className="space-y-2">
            <label className="grid gap-1 text-sm">Equipo *<input className={engineeringInput} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            <div className="max-h-40 overflow-y-auto divide-y border rounded-md">{results?.items.map((a) => <button className="block w-full p-2 text-left text-sm hover:bg-gray-50" key={a.id} type="button" onClick={() => setAsset(a)}>{a.code} · {a.name}</button>)}</div>
            {results?.items.length === 0 && <p className="text-sm text-gray-500">No se encontraron equipos.</p>}
          </div>}
          {asset && !assetId && !originPath && <Button type="button" variant="outline" onClick={() => setAsset(null)}>Cambiar equipo</Button>}
          <RequestFields value={form} onChange={setForm} />
        </fieldset>
        {(error || originError || assetError || searchError) && <p role="alert" className="text-sm text-red-700">{error || engineeringError(originError || assetError || searchError)}</p>}
        <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancelar</Button><Button className="bg-emerald-700 text-white hover:bg-emerald-800" type="submit" disabled={busy || !asset}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Crear solicitud</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
