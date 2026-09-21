'use client';

import { FormEvent, useRef, useState } from 'react';
import { Loader2, PackagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';

type Item = {
  id: string; sku: string; name: string; uom?: string | null;
  stocks?: { id?: string; warehouse?: string | null; binLocation?: string | null; stockOnHand?: number | null }[];
};

export default function StockReceiptDialog({ item, auth, onClose, onReceived }: {
  item: Item;
  auth: { token?: string; tenantSlug?: string };
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const stocks = (item.stocks ?? []).filter((stock) => stock.id);
  const [location, setLocation] = useState(stocks[0]?.id ?? 'new');
  const [qty, setQty] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [binLocation, setBinLocation] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const inputClass = 'w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (!Number.isFinite(Number(qty)) || Number(qty) <= 0) { setError('La cantidad debe ser mayor que cero.'); return; }
    if (location === 'new' && !warehouse.trim()) { setError('La bodega es obligatoria.'); return; }
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/inventory/${item.id}/receipts`, {
        ...auth, method: 'POST', body: {
          qty: Number(qty),
          ...(location === 'new' ? { warehouse: warehouse.trim(), binLocation: binLocation.trim() } : { inventoryStockId: location }),
          referenceLabel: reference.trim(), note: note.trim(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      let detail = 'No se pudo registrar el ingreso. Verifica el historial antes de volver a intentarlo.';
      try {
        const response = JSON.parse(message.slice(message.indexOf('{')));
        if (response.message) detail = Array.isArray(response.message) ? response.message.join('. ') : String(response.message);
      } catch { /* Keep the fallback for network failures. */ }
      setError(detail);
      locked.current = false;
      setBusy(false);
      return;
    }
    onClose();
    await onReceived();
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !locked.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-lg">
      <DialogHeader>
        <DialogTitle>Ingresar stock</DialogTitle>
        <DialogDescription className="break-words">{item.sku} · {item.name}</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <label className="grid gap-1 text-sm">Ubicación de destino
            <select className={inputClass} value={location} onChange={(event) => setLocation(event.target.value)}>
              {stocks.map((stock) => <option key={stock.id} value={stock.id}>{[stock.warehouse || 'General', stock.binLocation].filter(Boolean).join(' / ')}</option>)}
              <option value="new">Nueva ubicación</option>
            </select>
          </label>
          {location === 'new' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Bodega *<input className={inputClass} required maxLength={200} value={warehouse} onChange={(event) => setWarehouse(event.target.value)} /></label>
            <label className="grid gap-1 text-sm">Ubicación interna<input className={inputClass} maxLength={200} value={binLocation} onChange={(event) => setBinLocation(event.target.value)} /></label>
          </div>}
          <label className="grid gap-1 text-sm">Cantidad a ingresar ({item.uom || 'UND'}) *
            <input className={inputClass} type="number" min="0" step="any" required value={qty} onChange={(event) => setQty(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">Referencia<input className={inputClass} maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} /></label>
          <label className="grid gap-1 text-sm">Observación<textarea className={inputClass} rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <PackagePlus />}{busy ? 'Registrando...' : 'Registrar ingreso'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
