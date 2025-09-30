'use client';

import React from 'react';
import { useSession } from 'next-auth/react';

/** =========================
 *  Tipos de datos
 *  ========================= */
type PreviewRow = {
  _row?: number;
  _errors?: string[];
  _warnings?: string[];
  code?: string;
  name?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  category?: string;
  location?: string;
  supplier?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED' | string;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | string;
  nominalPower?: string | number;
  nominalPowerUnit?: string;
  acquiredOn?: string;
  ingestKey?: string;
};

type PreviewResponse = {
  uploadId: string | null;
  rows: PreviewRow[];
  total?: number;
  errors?: number;
  warnings?: number;
};

/** Crear individual */
type CreateAssetDto = {
  code: string;
  name: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  nominalPower?: number;
  nominalPowerUnit?: string;
  locationIdOrName?: string;
  categoryIdOrName?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'DECOMMISSIONED';
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH';
  acquiredOn?: string; // YYYY-MM-DD
};

/** =========================
 *  Constantes
 *  ========================= */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const MAX_MB = Number(
  process.env.NEXT_PUBLIC_ATTACHMENTS_MAX_MB ||
    process.env.NEXT_PUBLIC_ATTACHMENTS_MAX_SIZE_MB ||
    20
);

/** Excel serial (días desde 1899-12-30) → "YYYY-MM-DD" */
function excelSerialToISO(v: any): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const millis = Math.round(n * 86400000);
  const base = Date.UTC(1899, 11, 30);
  const d = new Date(base + millis);
  return d.toISOString().slice(0, 10);
}

export default function AssetNewPage() {
  const { data: session } = useSession();

  const token =
    (session as any)?.accessToken ||
    (session as any)?.user?.token ||
    (session as any)?.jwt ||
    undefined;

  const tenantSlug =
    (session as any)?.user?.tenant?.slug ||
    (session as any)?.tenant?.slug ||
    (session as any)?.tenantSlug ||
    process.env.NEXT_PUBLIC_TENANT_SLUG ||
    undefined;

  /** ===== Estado Import ===== */
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<PreviewResponse>({
    uploadId: null,
    rows: [],
  });
  const [legacyCommit, setLegacyCommit] = React.useState(false); // ← fallback si el preview NO trae uploadId
  const [errMsg, setErrMsg] = React.useState<string | null>(null);
  const [committing, setCommitting] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<any>(null);

  /** ===== Estado Create (individual) ===== */
  const [form, setForm] = React.useState<CreateAssetDto>({
    code: '',
    name: '',
    status: 'ACTIVE',
    criticality: 'MEDIUM',
  });
  const [creating, setCreating] = React.useState(false);
  const [createMsg, setCreateMsg] = React.useState<string | null>(null);

  /** ===== Helpers ===== */
  const headers = React.useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (tenantSlug) h['x-tenant'] = tenantSlug; // ajusta a x-tenant-id si tu API lo espera
    return h;
  }, [token, tenantSlug]);

  const canPreview = !!file && !!tenantSlug && !busy;
  const canCommit =
    (!!preview.uploadId || (!!file && legacyCommit)) && !committing; // habilita con uploadId o con fallback + archivo
  const canCreate = !!form.code && !!form.name && !!tenantSlug && !creating;

  /** =========================
   *  Import: Preview (con uploadId si el backend lo devuelve)
   *  ========================= */
  async function onPreview() {
    if (!file || !tenantSlug) return;
    setBusy(true);
    setErrMsg(null);
    setCommitResult(null);
    setPreview({ uploadId: null, rows: [] });
    setLegacyCommit(false);

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${API_BASE}/assets/import/preview`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers, // NO setear Content-Type manual con FormData
      });

      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        console.error('Respuesta no JSON:', text);
        throw new Error(`Respuesta no JSON del servidor`);
      }

      if (!res.ok) {
        const message = json?.message || json?.error || `HTTP ${res.status}`;
        throw new Error(message);
      }

      // Tu backend actual devuelve: { totalRows, errors, warnings, sample: [...], (opcional) uploadId }
      const sample: any[] = Array.isArray(json?.sample) ? json.sample : [];
      const rows: PreviewRow[] = sample.map((r: any, i: number) => ({
        ...r,
        _row: i + 1,
        acquiredOn: r?.acquiredOn ? excelSerialToISO(r.acquiredOn) : r?.acquiredOn,
        _errors: r?._errors ?? [],
        _warnings: r?._warnings ?? [],
      }));

      const uid = json?.uploadId || null;
      setPreview({
        uploadId: uid,
        rows,
        total: json?.totalRows ?? rows.length,
        errors: Array.isArray(json?.errors) ? json.errors.length : 0,
        warnings: Array.isArray(json?.warnings) ? json.warnings.length : 0,
      });

      // Si NO trae uploadId, activamos fallback (commit reenvía archivo)
      if (!uid) setLegacyCommit(true);
    } catch (e: any) {
      setErrMsg(e?.message || 'Error al previsualizar el archivo');
      setPreview({ uploadId: null, rows: [] });
      setLegacyCommit(false);
    } finally {
      setBusy(false);
    }
  }

  /** =========================
   *  Import: Commit
   *   - Opción B si hay uploadId
   *   - Fallback (Opción A) si no hay uploadId → reenvía archivo
   *  ========================= */
  async function onCommit() {
    setErrMsg(null);
    setCommitResult(null);

    // Ruta principal: Option B con uploadId
    if (preview.uploadId) {
      setCommitting(true);
      try {
        const res = await fetch(`${API_BASE}/assets/import/commit`, {
          method: 'POST',
          credentials: 'include',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: preview.uploadId, options: {} }),
        });

        const text = await res.text();
        let json: any = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          console.error('Respuesta no JSON:', text);
          throw new Error(`Respuesta no JSON del servidor`);
        }

        if (!res.ok) {
          const message = json?.message || json?.error || `HTTP ${res.status}`;
          throw new Error(message);
        }

        setCommitResult(json);
      } catch (e: any) {
        setErrMsg(e?.message || 'Error al confirmar importación');
      } finally {
        setCommitting(false);
      }
      return;
    }

    // Fallback: Option A (multipart con file)
    if (legacyCommit) {
      if (!file) {
        setErrMsg('No hay archivo para el commit (fallback). Vuelve a previsualizar.');
        return;
      }
      setCommitting(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('options', JSON.stringify({}));

        const res = await fetch(`${API_BASE}/assets/import/commit`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
          headers, // NO setear Content-Type manual
        });

        const text = await res.text();
        let json: any = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          console.error('Respuesta no JSON:', text);
          throw new Error(`Respuesta no JSON del servidor`);
        }

        if (!res.ok) {
          const message = json?.message || json?.error || `HTTP ${res.status}`;
          throw new Error(message);
        }

        setCommitResult(json);
      } catch (e: any) {
        setErrMsg(e?.message || 'Error al confirmar importación (fallback)');
      } finally {
        setCommitting(false);
      }
      return;
    }

    // Si llega aquí, no hay condiciones para commitear
    setErrMsg('No hay uploadId ni archivo para confirmar la importación.');
  }

  /** =========================
   *  Crear activo individual
   *  ========================= */
  function setField<K extends keyof CreateAssetDto>(key: K, val: CreateAssetDto[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function onCreateOne(e: React.FormEvent) {
    e.preventDefault();
    const canCreate = !!form.code && !!form.name && !!tenantSlug && !creating;
    if (!canCreate) return;
    setCreating(true);
    setCreateMsg(null);
    try {
      const res = await fetch(`${API_BASE}/assets`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        console.error('Respuesta no JSON:', text);
        throw new Error(`Respuesta no JSON del servidor`);
      }
      if (!res.ok) {
        const message = json?.message || json?.error || `HTTP ${res.status}`;
        throw new Error(message);
      }
      setCreateMsg('Activo creado correctamente');
      setForm({ code: '', name: '', status: 'ACTIVE', criticality: 'MEDIUM' });
    } catch (e: any) {
      setCreateMsg(e?.message || 'Error creando el activo');
    } finally {
      setCreating(false);
    }
  }

  /** =========================
   *  Render
   *  ========================= */
  const hasRows = Array.isArray(preview.rows) && preview.rows.length > 0;
  const first200 = hasRows ? preview.rows.slice(0, 200) : [];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Nuevo Asset / Importación masiva</h1>

      {!tenantSlug && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800 text-sm">
          No hay tenant en la sesión. Inicia sesión o selecciona un tenant para continuar.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== Columna Izquierda: Crear individual ===== */}
        <section className="border rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-semibold">Crear activo individual</h2>
          <form onSubmit={onCreateOne} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-600">Código *</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.code}
                  onChange={(e) => setField('code', e.target.value)}
                  required
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Nombre *</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  required
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Marca</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.brand || ''}
                  onChange={(e) => setField('brand', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Modelo</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.model || ''}
                  onChange={(e) => setField('model', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">N° Serie</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.serialNumber || ''}
                  onChange={(e) => setField('serialNumber', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Potencia nominal</span>
                <input
                  type="number"
                  step="any"
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.nominalPower ?? ''}
                  onChange={(e) =>
                    setField('nominalPower', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Unidad</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  placeholder="kW"
                  value={form.nominalPowerUnit || ''}
                  onChange={(e) => setField('nominalPowerUnit', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Ubicación (id o nombre)</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.locationIdOrName || ''}
                  onChange={(e) => setField('locationIdOrName', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Categoría (id o nombre)</span>
                <input
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.categoryIdOrName || ''}
                  onChange={(e) => setField('categoryIdOrName', e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Estado</span>
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value as any)}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Criticidad</span>
                <select
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.criticality}
                  onChange={(e) => setField('criticality', e.target.value as any)}
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </label>

              <label className="text-sm">
                <span className="block text-gray-600">Fecha adquisición</span>
                <input
                  type="date"
                  className="mt-1 w-full border rounded px-2 py-1"
                  value={form.acquiredOn || ''}
                  onChange={(e) => setField('acquiredOn', e.target.value)}
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!canCreate}
                className={`px-4 py-2 rounded text-white ${
                  canCreate ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {creating ? 'Creando…' : 'Crear activo'}
              </button>
              {createMsg && (
                <span className={`text-sm ${createMsg.includes('Error') ? 'text-red-600' : 'text-emerald-700'}`}>
                  {createMsg}
                </span>
              )}
            </div>
          </form>
        </section>

        {/* ===== Columna Derecha: Importación masiva ===== */}
        <section className="border rounded-lg p-4 space-y-4">
          <h2 className="text-lg font-semibold">Importación masiva (Excel/CSV)</h2>
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!tenantSlug || busy}
            />
            <button
              onClick={onPreview}
              disabled={!canPreview}
              className={`px-4 py-2 rounded text-white ${
                canPreview ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {busy ? 'Procesando…' : 'Previsualizar'}
            </button>
            <a
              href="/api/assets/template/download"
              className="text-blue-700 underline text-sm"
              title="Descargar plantilla"
            >
              Descargar plantilla
            </a>
          </div>

          {errMsg && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
              {errMsg}
            </div>
          )}

          {hasRows && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  {preview.total ?? preview.rows.length} filas · {preview.errors ?? 0} errores ·{' '}
                  {preview.warnings ?? 0} advertencias
                  {preview.uploadId ? (
                    <span className="ml-2 text-gray-400">| uploadId: {preview.uploadId}</span>
                  ) : (
                    <span className="ml-2 text-amber-600" title="El backend no envió uploadId; se usará fallback">
                      | sin uploadId (fallback activo)
                    </span>
                  )}
                </div>
                <button
                  onClick={onCommit}
                  disabled={!canCommit}
                  className={`px-4 py-2 rounded text-white ${
                    canCommit ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  {committing ? 'Importando…' : 'Confirmar importación'}
                </button>
              </div>

              <div className="border rounded-md overflow-auto max-h-[480px]">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">code</th>
                      <th className="px-2 py-1 text-left">name</th>
                      <th className="px-2 py-1 text-left">brand</th>
                      <th className="px-2 py-1 text-left">model</th>
                      <th className="px-2 py-1 text-left">serial</th>
                      <th className="px-2 py-1 text-left">category</th>
                      <th className="px-2 py-1 text-left">location</th>
                      <th className="px-2 py-1 text-left">supplier</th>
                      <th className="px-2 py-1 text-left">criticality</th>
                      <th className="px-2 py-1 text-left">status</th>
                      <th className="px-2 py-1 text-left">nominalPower</th>
                      <th className="px-2 py-1 text-left">acquiredOn</th>
                      <th className="px-2 py-1 text-left">_errors/_warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {first200.map((r: any, idx: number) => (
                      <tr
                        key={idx}
                        className={r?._errors?.length ? 'bg-red-50' : r?._warnings?.length ? 'bg-amber-50' : ''}
                      >
                        <td className="px-2 py-1 border-b">{r?._row ?? idx + 1}</td>
                        <td className="px-2 py-1 border-b">{r?.code ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.name ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.brand ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.model ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.serialNumber ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.category ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.location ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.supplier ?? ''}</td>
                        <td className="px-2 py-1 border-b">{r?.criticality ?? ''}</td>
                        <td className="px-2 py-1 border-b">
                          {r?.status ?? ''}
                        </td>
                        <td className="px-2 py-1 border-b">
                          {r?.nominalPower ?? ''} {r?.nominalPowerUnit ?? ''}
                        </td>
                        <td className="px-2 py-1 border-b">{r?.acquiredOn ?? ''}</td>
                        <td className="px-2 py-1 border-b">
                          {Array.isArray(r?._errors) && r._errors.length > 0 && (
                            <div className="text-red-700">{r._errors.join('; ')}</div>
                          )}
                          {Array.isArray(r?._warnings) && r._warnings.length > 0 && (
                            <div className="text-amber-700">{r._warnings.join('; ')}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {preview.rows.length > 200 && (
                      <tr>
                        <td colSpan={14} className="px-2 py-2 text-center text-gray-500">
                          Mostrando primeras 200 filas de {preview.rows.length}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {commitResult && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-sm">
                  <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(commitResult, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="text-xs text-gray-500">
        Máx archivo: {MAX_MB} MB. Si al previsualizar no ves nada, revisa Network (status &amp; headers) y que el
        backend acepte el header de tenant enviado como <code>x-tenant</code> (ajusta aquí si tu API espera otro).
      </div>
    </div>
  );
}
