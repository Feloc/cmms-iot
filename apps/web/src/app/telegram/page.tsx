'use client';

import { useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { getAuthFromSession } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { useApiSWR } from '@/lib/swr';

type Connection = { receiveMode?: 'polling' | 'webhook'; configured: boolean; connected: boolean; username?: string | null; enabled?: boolean; automatic?: boolean };
type Recipient = { id: string; name: string; role: string };
type Delivery = { id: string; user: { name: string }; text: string; kind: string; status: string; error?: string; createdAt: string };
const statuses: Record<string, string> = { PENDING: 'Pendiente', SENDING: 'Enviando', SENT: 'Enviado a Telegram', FAILED: 'Fallido', CANCELED: 'Cancelado' };
const button = 'rounded border px-3 py-2 text-sm disabled:opacity-50';

export default function TelegramPage() {
  const { data: session, status } = useSession();
  const auth = getAuthFromSession(session);
  const admin = (session as any)?.user?.role === 'ADMIN';
  const me = useApiSWR<Connection>('/telegram/me', auth.token, auth.tenantSlug, { refreshInterval: 5000 });
  const recipients = useApiSWR<Recipient[]>(admin ? '/telegram/recipients' : null, auth.token, auth.tenantSlug);
  const history = useApiSWR<Delivery[]>(admin ? '/telegram/messages' : '/telegram/history', auth.token, auth.tenantSlug, { refreshInterval: 5000 });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('Hola, {nombre}. ');
  const [preview, setPreview] = useState<Array<{ userId: string; name: string; text: string }> | null>(null);
  const requestId = useRef<string | null>(null);

  async function action(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice(''); setError('');
    try { await fn(); }
    catch (e) {
      const raw = e instanceof Error ? e.message : 'No se pudo completar la operación';
      const start = raw.indexOf('{');
      try { const detail = JSON.parse(raw.slice(start)); setError(Array.isArray(detail.message) ? detail.message.join('. ') : detail.message || 'No se pudo completar la operación'); }
      catch { setError('No se pudo completar la operación. Comprueba tu conexión y vuelve a intentar.'); }
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  function edit() { setPreview(null); requestId.current = null; }
  async function preferences(enabled: boolean, automatic: boolean) {
    await action(async () => {
      await apiFetch('/telegram/me', { ...auth, method: 'PATCH', body: { enabled, automatic } });
      await me.mutate(); await recipients.mutate();
    });
  }
  if (status === 'loading') return <div className="p-6">Cargando…</div>;
  if (!auth.token) return <div className="p-6">Inicia sesión para conectar Telegram.</div>;

  return <div className="max-w-5xl p-6 space-y-6">
    <h1 className="text-2xl font-semibold">Telegram</h1>
    <p className="text-sm text-gray-600">Conecta tu cuenta para recibir mensajes privados y avisos de tus órdenes de servicio.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status" className="text-green-700">{notice}</p>}
    {me.error && <p role="alert">No se pudo cargar tu conexión. <button className={button} onClick={() => void me.mutate()}>Reintentar</button></p>}
    <section className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">Mi cuenta</h2>
      {!me.data ? <p>Cargando conexión…</p> : <>
        {!me.data.configured && <p>Telegram aún no está disponible. Solicita al administrador que complete la configuración.</p>}
        {me.data.receiveMode === 'polling' && me.data.configured && <p className="text-sm text-gray-600">Conexión local: mantén el servidor encendido y con acceso a internet para recibir tus avisos. No necesitas una dirección pública.</p>}
        <p>{me.data.connected ? `Cuenta conectada${me.data.username ? `: @${me.data.username}` : ''}` : 'Cuenta sin conectar'}</p>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy || !me.data.configured} onClick={() => void action(async () => {
            setLink(await apiFetch('/telegram/link', { ...auth, method: 'POST' }));
          })}>{me.data.connected ? 'Cambiar cuenta de Telegram' : 'Conectar Telegram'}</button>
          {me.data.connected && <button className={button} disabled={busy} onClick={() => void action(async () => {
            await apiFetch('/telegram/me', { ...auth, method: 'DELETE' }); setLink(null); await me.mutate(); await recipients.mutate();
            setNotice('Cuenta desconectada. Los mensajes pendientes se cancelaron.');
          })}>Desconectar</button>}
        </div>
        {link && <div className="space-y-2">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">Abrir el bot en Telegram</a>
          <p className="text-sm">Pulsa Iniciar en el bot. Este enlace personal vence a las {new Date(link.expiresAt).toLocaleTimeString('es-CO')}. No lo compartas.</p>
          <button className={button} onClick={() => void me.mutate()}>Comprobar conexión</button>
        </div>}
        {me.data.connected && <div className="space-y-2">
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!me.data.enabled} disabled={busy} onChange={e => void preferences(e.target.checked, !!me.data?.automatic)} />Recibir mensajes privados</label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!me.data.automatic} disabled={busy || !me.data.enabled} onChange={e => void preferences(!!me.data?.enabled, e.target.checked)} />Avisos de asignación y reprogramación de órdenes</label>
          <p className="text-sm text-gray-600">También puedes enviar /stop al bot para detener todos sus mensajes.</p>
        </div>}
      </>}
    </section>
    {admin && <section className="rounded border p-4 space-y-4">
      <h2 className="font-semibold">Enviar mensaje personalizado</h2>
      <p className="text-sm">Selecciona hasta 100 personas de tu empresa que hayan conectado Telegram y activado los mensajes.</p>
      {recipients.error && <p role="alert">No se pudieron cargar los destinatarios.</p>}
      <button className={button} disabled={busy} onClick={() => void recipients.mutate()}>Actualizar destinatarios</button>
      <fieldset disabled={busy} className="max-h-64 overflow-y-auto space-y-2">
        <legend className="font-medium mb-2">Destinatarios ({selected.length})</legend>
        {recipients.data?.map(r => <label key={r.id} className="flex gap-2 items-center">
          <input type="checkbox" checked={selected.includes(r.id)} onChange={e => {
            edit(); setSelected(current => e.target.checked ? [...current, r.id] : current.filter(id => id !== r.id));
          }} />{r.name} <span className="text-xs text-gray-500">{r.role}</span>
        </label>)}
        {recipients.data?.length === 0 && <p>Aún no hay destinatarios disponibles.</p>}
      </fieldset>
      <label className="block space-y-2"><span>Mensaje</span>
        <textarea className="block w-full rounded border p-2" rows={5} maxLength={4000} value={text} disabled={busy} onChange={e => { edit(); setText(e.target.value); }} />
      </label>
      <p className="text-sm text-gray-600">Usa {'{nombre}'} para insertar el nombre de cada destinatario. {text.length}/4000 caracteres.</p>
      <button className={button} disabled={busy || !me.data?.configured || !selected.length || selected.length > 100 || !text.trim()} onClick={() => {
        const rows = selected.map(id => recipients.data?.find(r => r.id === id));
        if (rows.some(r => !r)) { setError('Actualiza la selección: hay destinatarios que ya no están disponibles.'); return; }
        const rendered = rows.map(r => ({ userId: r!.id, name: r!.name, text: text.replace(/\{nombre\}/g, () => r!.name).trim() }));
        if (rendered.some(r => r.text.length > 4096)) { setError('Algún mensaje supera los 4096 caracteres al insertar el nombre.'); return; }
        setError(''); setPreview(rendered); requestId.current ||= crypto.randomUUID();
      }}>Revisar mensajes</button>
      {preview && <div className="space-y-3">
        <h3 className="font-medium">Vista previa · {preview.length} mensajes privados</h3>
        <div className="max-h-80 overflow-y-auto space-y-2">{preview.map(p => <article key={p.userId} className="rounded bg-gray-50 p-3">
          <p className="font-medium">{p.name}</p><p className="whitespace-pre-wrap break-words">{p.text}</p>
        </article>)}</div>
        <button className={`${button} bg-black text-white`} disabled={busy} onClick={() => void action(async () => {
          const result = await apiFetch<{ queued: number; alreadyQueued: number }>('/telegram/messages', {
            ...auth, method: 'POST', body: { userIds: selected, text, requestId: requestId.current },
          });
          setNotice(`${result.queued} mensajes en cola${result.alreadyQueued ? `; ${result.alreadyQueued} ya estaban registrados` : ''}. Consulta su estado en el historial.`);
          setSelected([]); setText('Hola, {nombre}. '); edit(); await history.mutate();
        })}>{busy ? 'Registrando…' : `Enviar ${preview.length} mensajes`}</button>
      </div>}
    </section>}
    <section className="rounded border p-4 space-y-3">
      <h2 className="font-semibold">{admin ? 'Últimos envíos de la empresa' : 'Mis últimos mensajes'}</h2>
      <p className="text-sm text-gray-600">“Enviado a Telegram” confirma la aceptación del mensaje, no su lectura.</p>
      {history.error && <p role="alert">No se pudo cargar el historial.</p>}
      {history.data?.length === 0 && <p>No hay mensajes registrados.</p>}
      {history.data?.map(row => <details key={row.id} className="border-t py-2">
        <summary className="cursor-pointer">{row.user.name} · {statuses[row.status] || row.status} · {new Date(row.createdAt).toLocaleString('es-CO')}</summary>
        <p className="whitespace-pre-wrap break-words mt-2">{row.text}</p>
        {row.error && <p className="text-sm text-red-700">{row.error}</p>}
      </details>)}
    </section>
  </div>;
}
