'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { apiBase, apiFetch } from '@/lib/api';
import { getAuthFromSession } from '@/lib/auth';

type PartType = 'PART' | 'ASSEMBLY' | 'KIT' | 'CONSUMABLE';
type PartStatus = 'ACTIVE' | 'OBSOLETE' | 'DISCONTINUED';
type PartCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type InventoryItem = {
  id: string;
  sku: string;
  oemPartNo?: string | null;
  supplierPartNo?: string | null;
  name: string;
  description?: string | null;
  partType?: PartType | null;
  uom?: string | null;
  systemGroup?: string | null;
  sectionCode?: string | null;
  sectionName?: string | null;
  itemNo?: string | null;
  parentOemPartNo?: string | null;
  preferredSupplier?: string | null;
  leadTimeDays?: number | null;
  criticality?: PartCriticality | null;
  status?: PartStatus | null;
  interchangeableWith?: string | null;
  notes?: string | null;
  qty: number;
  unitPrice?: number | null;
  lastCost?: number | null;
  avgCost?: number | null;
  currency?: string | null;
  updatedAt?: string | null;
  applicability?: InventoryApplicability[];
  stocks?: InventoryStock[];
};

type InventoryApplicability = {
  id?: string;
  equipmentModel?: string | null;
  variant?: string | null;
  serialFrom?: string | null;
  serialTo?: string | null;
  appliedDateFrom?: string | null;
  appliedDateTo?: string | null;
  itemNo?: string | null;
  qtyPerEquipment?: number | null;
  isOptional?: boolean;
  manualRemark?: string | null;
  manualPageRef?: string | null;
};

type InventoryStock = {
  id?: string;
  warehouse?: string | null;
  binLocation?: string | null;
  stockOnHand?: number | null;
  stockReserved?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
};

type InventoryMovement = {
  id: string;
  movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'RESERVATION' | 'RELEASE' | 'CONSUMPTION' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  source: 'MANUAL' | 'IMPORT' | 'WORK_ORDER' | 'SERVICE_ORDER' | 'ADJUSTMENT' | 'SYSTEM';
  qty: number;
  stockDelta: number;
  balanceAfter?: number | null;
  warehouse?: string | null;
  binLocation?: string | null;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceLabel?: string | null;
  note?: string | null;
  createdAt: string;
  inventoryItem: {
    id: string;
    sku: string;
    name: string;
    uom?: string | null;
    currency?: string | null;
  };
};

type InventoryFormState = {
  sku: string;
  oemPartNo: string;
  supplierPartNo: string;
  name: string;
  description: string;
  partType: PartType;
  uom: string;
  systemGroup: string;
  sectionCode: string;
  sectionName: string;
  itemNo: string;
  parentOemPartNo: string;
  preferredSupplier: string;
  leadTimeDays: string;
  criticality: PartCriticality;
  status: PartStatus;
  interchangeableWith: string;
  notes: string;
  qty: string;
  unitPrice: string;
  lastCost: string;
  avgCost: string;
  currency: string;
};

type PreviewRow = {
  sku?: string;
  name?: string;
  oemPartNo?: string | null;
  partType?: PartType | null;
  qty?: number;
  unitPrice?: number | null;
  status?: PartStatus | null;
  currency?: string | null;
  equipmentModel?: string | null;
  variant?: string | null;
  qtyPerEquipment?: number | null;
  warehouse?: string | null;
  binLocation?: string | null;
  stockReserved?: number | null;
  stockMin?: number | null;
  stockMax?: number | null;
  reorderPoint?: number | null;
  reorderQty?: number | null;
  _row?: number;
  _errors?: string[];
  _warnings?: string[];
};

type PreviewResponse = {
  totalRows: number;
  errors: number;
  warnings: number;
  sample: PreviewRow[];
};

const PART_TYPE_OPTIONS: Array<{ value: PartType; label: string }> = [
  { value: 'PART', label: 'Parte' },
  { value: 'ASSEMBLY', label: 'Assembly' },
  { value: 'KIT', label: 'Kit' },
  { value: 'CONSUMABLE', label: 'Consumible' },
];

const PART_STATUS_OPTIONS: Array<{ value: PartStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'OBSOLETE', label: 'Obsoleto' },
  { value: 'DISCONTINUED', label: 'Descontinuado' },
];

const PART_CRITICALITY_OPTIONS: Array<{ value: PartCriticality; label: string }> = [
  { value: 'LOW', label: 'Baja' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Critica' },
];

function createEmptyForm(): InventoryFormState {
  return {
    sku: '',
    oemPartNo: '',
    supplierPartNo: '',
    name: '',
    description: '',
    partType: 'PART',
    uom: 'UND',
    systemGroup: '',
    sectionCode: '',
    sectionName: '',
    itemNo: '',
    parentOemPartNo: '',
    preferredSupplier: '',
    leadTimeDays: '',
    criticality: 'MEDIUM',
    status: 'ACTIVE',
    interchangeableWith: '',
    notes: '',
    qty: '0',
    unitPrice: '',
    lastCost: '',
    avgCost: '',
    currency: 'COP',
  };
}

function createEmptyApplicability(): InventoryApplicability {
  return {
    equipmentModel: '',
    variant: '',
    serialFrom: '',
    serialTo: '',
    appliedDateFrom: '',
    appliedDateTo: '',
    itemNo: '',
    qtyPerEquipment: null,
    isOptional: false,
    manualRemark: '',
    manualPageRef: '',
  };
}

function createEmptyStock(): InventoryStock {
  return {
    warehouse: '',
    binLocation: '',
    stockOnHand: 0,
    stockReserved: null,
    stockMin: null,
    stockMax: null,
    reorderPoint: null,
    reorderQty: null,
  };
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

function toDateInput(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function fmtMoney(n?: number | null, currency?: string | null) {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return '-';
  const normalizedCurrency = (currency || '').trim().toUpperCase();
  if (!normalizedCurrency) return Number(n).toFixed(2);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${normalizedCurrency} ${Number(n).toFixed(2)}`;
  }
}

function fmtQty(n?: number | null) {
  if (n === undefined || n === null || !Number.isFinite(Number(n))) return '-';
  const value = Number(n);
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '');
}

function partTypeLabel(value?: string | null) {
  return PART_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? (value || '-');
}

function statusLabel(value?: string | null) {
  return PART_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? (value || '-');
}

function criticalityLabel(value?: string | null) {
  return PART_CRITICALITY_OPTIONS.find((option) => option.value === value)?.label ?? (value || '-');
}

function statusClass(value?: string | null) {
  switch (String(value || '').toUpperCase()) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'OBSOLETE':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'DISCONTINUED':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function criticalityClass(value?: string | null) {
  switch (String(value || '').toUpperCase()) {
    case 'LOW':
      return 'bg-slate-50 text-slate-700 border-slate-200';
    case 'MEDIUM':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 'CRITICAL':
      return 'bg-red-50 text-red-800 border-red-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function partTypeClass(value?: string | null) {
  switch (String(value || '').toUpperCase()) {
    case 'PART':
      return 'bg-slate-50 text-slate-800 border-slate-200';
    case 'ASSEMBLY':
      return 'bg-violet-50 text-violet-800 border-violet-200';
    case 'KIT':
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    case 'CONSUMABLE':
      return 'bg-cyan-50 text-cyan-800 border-cyan-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function parseRequiredNonNegativeInt(raw: string, field: string) {
  const value = Number(raw || '0');
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} debe ser mayor o igual a 0.`);
  return Math.round(value);
}

function parseOptionalNonNegativeNumber(raw: string, field: string) {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} debe ser mayor o igual a 0.`);
  return parsed;
}

function parseOptionalNonNegativeInt(raw: string, field: string) {
  const parsed = parseOptionalNonNegativeNumber(raw, field);
  return parsed === null ? null : Math.round(parsed);
}

function applicabilitySummary(row: InventoryApplicability) {
  const base = [row.equipmentModel, row.variant].filter(Boolean).join(' · ') || 'Aplicabilidad';
  const extras = [
    row.itemNo ? `Item ${row.itemNo}` : null,
    row.qtyPerEquipment !== null && row.qtyPerEquipment !== undefined ? `Qty/eq ${row.qtyPerEquipment}` : null,
    row.isOptional ? 'Opcional' : null,
  ].filter(Boolean);
  return [base, extras.join(' · ')].filter(Boolean).join(' · ');
}

function stockSummary(row: InventoryStock) {
  const base = [row.warehouse, row.binLocation].filter(Boolean).join(' / ') || 'Ubicacion general';
  const extras = [
    `Disp ${fmtQty(row.stockOnHand ?? 0)}`,
    row.stockReserved !== null && row.stockReserved !== undefined ? `Res ${fmtQty(row.stockReserved)}` : null,
    row.stockMin !== null && row.stockMin !== undefined ? `Min ${fmtQty(row.stockMin)}` : null,
    row.stockMax !== null && row.stockMax !== undefined ? `Max ${fmtQty(row.stockMax)}` : null,
  ].filter(Boolean);
  return [base, extras.join(' · ')].filter(Boolean).join(' · ');
}

function stockPolicySummary(row: InventoryStock) {
  return [
    row.reorderPoint !== null && row.reorderPoint !== undefined ? `Punto ${fmtQty(row.reorderPoint)}` : null,
    row.reorderQty !== null && row.reorderQty !== undefined ? `Compra ${fmtQty(row.reorderQty)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function stockOnHandTotal(rows: InventoryStock[]) {
  return rows.reduce((sum, row) => sum + Number(row.stockOnHand ?? 0), 0);
}

function movementTypeLabel(value: InventoryMovement['movementType']) {
  switch (value) {
    case 'ENTRY':
      return 'Entrada';
    case 'EXIT':
      return 'Salida';
    case 'ADJUSTMENT':
      return 'Ajuste';
    case 'RESERVATION':
      return 'Reserva';
    case 'RELEASE':
      return 'Liberacion';
    case 'CONSUMPTION':
      return 'Consumo';
    case 'RETURN':
      return 'Devolucion';
    case 'TRANSFER_IN':
      return 'Traslado entrada';
    case 'TRANSFER_OUT':
      return 'Traslado salida';
    default:
      return value;
  }
}

function movementTypeClass(value: InventoryMovement['movementType']) {
  switch (value) {
    case 'ENTRY':
    case 'RETURN':
    case 'TRANSFER_IN':
    case 'RELEASE':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'CONSUMPTION':
    case 'EXIT':
    case 'TRANSFER_OUT':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'ADJUSTMENT':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'RESERVATION':
      return 'bg-sky-50 text-sky-800 border-sky-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function movementSourceLabel(value: InventoryMovement['source']) {
  switch (value) {
    case 'WORK_ORDER':
      return 'OT';
    case 'SERVICE_ORDER':
      return 'OS';
    case 'IMPORT':
      return 'Importacion';
    case 'ADJUSTMENT':
      return 'Ajuste';
    case 'SYSTEM':
      return 'Sistema';
    case 'MANUAL':
      return 'Manual';
    default:
      return value;
  }
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const auth = getAuthFromSession(session);
  const role = (session as any)?.user?.role as string | undefined;
  const isAdmin = role === 'ADMIN';

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [query, setQuery] = useState('');

  const [form, setForm] = useState<InventoryFormState>(() => createEmptyForm());
  const [applicabilityDraft, setApplicabilityDraft] = useState<InventoryApplicability>(() => createEmptyApplicability());
  const [applicabilityRows, setApplicabilityRows] = useState<InventoryApplicability[]>([]);
  const [stockDraft, setStockDraft] = useState<InventoryStock>(() => createEmptyStock());
  const [stockRows, setStockRows] = useState<InventoryStock[]>([]);
  const [creating, setCreating] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  const canCreate = useMemo(() => {
    return !!form.sku.trim() && !!form.name.trim() && !creating;
  }, [creating, form.name, form.sku]);

  const computedStockQty = useMemo(() => Math.round(stockOnHandTotal(stockRows)), [stockRows]);

  async function loadItems(search = query) {
    if (!auth.token || !auth.tenantSlug || !isAdmin) return;
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('q', search.trim());
      const path = qs.toString() ? `/inventory?${qs.toString()}` : '/inventory';
      const movementQs = new URLSearchParams();
      movementQs.set('limit', '25');
      if (search.trim()) movementQs.set('q', search.trim());
      const [list, recentMovements] = await Promise.all([
        apiFetch<InventoryItem[]>(path, {
          token: auth.token,
          tenantSlug: auth.tenantSlug,
        }),
        apiFetch<InventoryMovement[]>(`/inventory/movements?${movementQs.toString()}`, {
          token: auth.token,
          tenantSlug: auth.tenantSlug,
        }),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setMovements(Array.isArray(recentMovements) ? recentMovements : []);
    } catch (e: any) {
      setErr(e?.message || 'Error cargando inventario');
      setItems([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setItems([]);
      setMovements([]);
      return;
    }
    const t = setTimeout(() => {
      loadItems(query);
    }, 180);
    return () => clearTimeout(t);
  }, [auth.token, auth.tenantSlug, isAdmin, query]);

  function updateForm<K extends keyof InventoryFormState>(field: K, value: InventoryFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateApplicability<K extends keyof InventoryApplicability>(field: K, value: InventoryApplicability[K]) {
    setApplicabilityDraft((current) => ({ ...current, [field]: value }));
  }

  function updateStock<K extends keyof InventoryStock>(field: K, value: InventoryStock[K]) {
    setStockDraft((current) => ({ ...current, [field]: value }));
  }

  function addApplicabilityRow() {
    const hasData =
      !!applicabilityDraft.equipmentModel?.trim() ||
      !!applicabilityDraft.variant?.trim() ||
      !!applicabilityDraft.serialFrom?.trim() ||
      !!applicabilityDraft.serialTo?.trim() ||
      !!applicabilityDraft.appliedDateFrom ||
      !!applicabilityDraft.appliedDateTo ||
      !!applicabilityDraft.itemNo?.trim() ||
      (applicabilityDraft.qtyPerEquipment !== null && applicabilityDraft.qtyPerEquipment !== undefined) ||
      !!applicabilityDraft.manualRemark?.trim() ||
      !!applicabilityDraft.manualPageRef?.trim() ||
      !!applicabilityDraft.isOptional;

    if (!hasData) {
      setErr('Agrega al menos un dato en la aplicabilidad antes de guardarla en la lista.');
      return;
    }

    setApplicabilityRows((current) => [...current, applicabilityDraft]);
    setApplicabilityDraft(createEmptyApplicability());
    setErr('');
  }

  function removeApplicabilityRow(index: number) {
    setApplicabilityRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function addStockRow() {
    const hasData =
      !!stockDraft.warehouse?.trim() ||
      !!stockDraft.binLocation?.trim() ||
      Number(stockDraft.stockOnHand ?? 0) > 0 ||
      (stockDraft.stockReserved !== null && stockDraft.stockReserved !== undefined) ||
      (stockDraft.stockMin !== null && stockDraft.stockMin !== undefined) ||
      (stockDraft.stockMax !== null && stockDraft.stockMax !== undefined) ||
      (stockDraft.reorderPoint !== null && stockDraft.reorderPoint !== undefined) ||
      (stockDraft.reorderQty !== null && stockDraft.reorderQty !== undefined);

    if (!hasData) {
      setErr('Agrega al menos un dato de bodega o stock antes de guardarlo en la lista.');
      return;
    }

    setStockRows((current) => [...current, stockDraft]);
    setStockDraft(createEmptyStock());
    setErr('');
  }

  function removeStockRow(index: number) {
    setStockRows((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function createOne(e: FormEvent) {
    e.preventDefault();
    if (!auth.token || !auth.tenantSlug) return;
    if (!canCreate) return;

    try {
      const qty = stockRows.length > 0 ? computedStockQty : parseRequiredNonNegativeInt(form.qty, 'La cantidad');
      const unitPrice = parseOptionalNonNegativeNumber(form.unitPrice, 'El precio unitario');
      const lastCost = parseOptionalNonNegativeNumber(form.lastCost, 'El ultimo costo');
      const avgCost = parseOptionalNonNegativeNumber(form.avgCost, 'El costo promedio');
      const leadTimeDays = parseOptionalNonNegativeInt(form.leadTimeDays, 'El lead time');

      setCreating(true);
      setErr('');
      await apiFetch('/inventory', {
        method: 'POST',
        token: auth.token,
        tenantSlug: auth.tenantSlug,
        body: {
          sku: form.sku.trim(),
          oemPartNo: form.oemPartNo.trim() || null,
          supplierPartNo: form.supplierPartNo.trim() || null,
          name: form.name.trim(),
          description: form.description.trim() || null,
          partType: form.partType,
          uom: form.uom.trim() || null,
          systemGroup: form.systemGroup.trim() || null,
          sectionCode: form.sectionCode.trim() || null,
          sectionName: form.sectionName.trim() || null,
          itemNo: form.itemNo.trim() || null,
          parentOemPartNo: form.parentOemPartNo.trim() || null,
          preferredSupplier: form.preferredSupplier.trim() || null,
          leadTimeDays,
          criticality: form.criticality,
          status: form.status,
          interchangeableWith: form.interchangeableWith.trim() || null,
          notes: form.notes.trim() || null,
          qty,
          unitPrice,
          lastCost,
          avgCost,
          currency: form.currency.trim() || null,
          stocks: stockRows.map((row) => ({
            warehouse: row.warehouse?.trim() || null,
            binLocation: row.binLocation?.trim() || null,
            stockOnHand: row.stockOnHand ?? 0,
            stockReserved: row.stockReserved ?? null,
            stockMin: row.stockMin ?? null,
            stockMax: row.stockMax ?? null,
            reorderPoint: row.reorderPoint ?? null,
            reorderQty: row.reorderQty ?? null,
          })),
          applicability: applicabilityRows.map((row) => ({
            equipmentModel: row.equipmentModel?.trim() || null,
            variant: row.variant?.trim() || null,
            serialFrom: row.serialFrom?.trim() || null,
            serialTo: row.serialTo?.trim() || null,
            appliedDateFrom: row.appliedDateFrom || null,
            appliedDateTo: row.appliedDateTo || null,
            itemNo: row.itemNo?.trim() || null,
            qtyPerEquipment: row.qtyPerEquipment ?? null,
            isOptional: !!row.isOptional,
            manualRemark: row.manualRemark?.trim() || null,
            manualPageRef: row.manualPageRef?.trim() || null,
          })),
        },
      });
      setForm(createEmptyForm());
      setApplicabilityDraft(createEmptyApplicability());
      setApplicabilityRows([]);
      setStockDraft(createEmptyStock());
      setStockRows([]);
      await loadItems(query);
    } catch (e: any) {
      setErr(e?.message || 'Error creando repuesto');
    } finally {
      setCreating(false);
    }
  }

  async function uploadPreview() {
    if (!auth.token || !auth.tenantSlug || !file) return;
    setPreviewing(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${apiBase}/inventory/import/preview`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      setPreview({
        totalRows: Number(json?.totalRows ?? 0),
        errors: Number(json?.errors ?? 0),
        warnings: Number(json?.warnings ?? 0),
        sample: Array.isArray(json?.sample) ? json.sample : [],
      });
    } catch (e: any) {
      setErr(e?.message || 'Error previsualizando archivo');
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  }

  async function commitImport() {
    if (!auth.token || !auth.tenantSlug || !file) return;
    setCommitting(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`${apiBase}/inventory/import/commit`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'x-tenant': auth.tenantSlug,
        },
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`);

      await loadItems(query);
      setPreview(null);
      setFile(null);
    } catch (e: any) {
      setErr(e?.message || 'Error importando archivo');
    } finally {
      setCommitting(false);
    }
  }

  if (!auth.token || !auth.tenantSlug) return <div className="p-6">Inicia sesión.</div>;
  if (!isAdmin) return <div className="p-6">No autorizado. Inventario solo para ADMIN.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Catalogo de repuestos</h1>
          <p className="text-sm text-gray-600">
            Fase 3 del rediseno: catalogo maestro con aplicabilidad OEM y stock multiubicacion por bodega.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/inventory/manuals" className="px-3 py-2 border rounded text-sm hover:bg-gray-50">
            Editor manuales
          </Link>
          <div className="text-xs text-gray-500 border rounded px-3 py-2 bg-gray-50">
            {loading ? 'Cargando catalogo...' : `${items.length} repuesto${items.length === 1 ? '' : 's'} en pantalla`}
          </div>
        </div>
      </div>

      {err ? <div className="p-3 border rounded bg-red-50 text-red-700 text-sm whitespace-pre-wrap">{err}</div> : null}

      <section className="border rounded p-4 space-y-3 bg-gray-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-medium">Busqueda y plantillas</div>
            <div className="text-sm text-gray-600">
              Puedes seguir usando la plantilla simple o migrar a la plantilla extendida del catalogo con aplicabilidad y stock multiubicacion.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a className="text-sm underline" href="/templates/template-inventory.csv" download>
              Plantilla simple
            </a>
            <a className="text-sm underline" href="/templates/template-inventory-extended.csv" download>
              Plantilla extendida
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
          <input
            className="border rounded px-3 py-2 w-full bg-white"
            placeholder="Buscar por SKU, nombre, OEM, proveedor, grupo o seccion..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="px-3 py-2 border rounded bg-white"
            onClick={() => loadItems(query)}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_1fr] gap-4">
        <section className="border rounded p-4 space-y-4">
          <div>
            <h2 className="font-semibold">Ingreso individual</h2>
            <p className="text-sm text-gray-600">
              Registra el catalogo base del repuesto sin cambiar la compatibilidad con OS y OT.
            </p>
          </div>

          <form onSubmit={createOne} className="space-y-4">
            <div className="space-y-3">
              <div className="font-medium text-sm">Identificacion</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">SKU interno</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.sku} onChange={(e) => updateForm('sku', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Nombre</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">No. parte OEM</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.oemPartNo} onChange={(e) => updateForm('oemPartNo', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">No. parte proveedor</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.supplierPartNo} onChange={(e) => updateForm('supplierPartNo', e.target.value)} />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">Descripcion</span>
                  <textarea
                    className="border rounded px-3 py-2 w-full min-h-[84px]"
                    value={form.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-sm">Clasificacion tecnica</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Tipo</span>
                  <select className="border rounded px-3 py-2 w-full" value={form.partType} onChange={(e) => updateForm('partType', e.target.value as PartType)}>
                    {PART_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Unidad</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.uom} onChange={(e) => updateForm('uom', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Criticidad</span>
                  <select
                    className="border rounded px-3 py-2 w-full"
                    value={form.criticality}
                    onChange={(e) => updateForm('criticality', e.target.value as PartCriticality)}
                  >
                    {PART_CRITICALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Grupo de sistema</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.systemGroup} onChange={(e) => updateForm('systemGroup', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Codigo de seccion</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.sectionCode} onChange={(e) => updateForm('sectionCode', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Nombre de seccion</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.sectionName} onChange={(e) => updateForm('sectionName', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Item del manual</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.itemNo} onChange={(e) => updateForm('itemNo', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Parte padre OEM</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.parentOemPartNo} onChange={(e) => updateForm('parentOemPartNo', e.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Intercambiable con</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={form.interchangeableWith}
                    onChange={(e) => updateForm('interchangeableWith', e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-sm">Operacion y costos</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Proveedor preferido</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={form.preferredSupplier}
                    onChange={(e) => updateForm('preferredSupplier', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Lead time (dias)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="border rounded px-3 py-2 w-full"
                    value={form.leadTimeDays}
                    onChange={(e) => updateForm('leadTimeDays', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Estado</span>
                  <select className="border rounded px-3 py-2 w-full" value={form.status} onChange={(e) => updateForm('status', e.target.value as PartStatus)}>
                    {PART_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Stock legacy / total</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="border rounded px-3 py-2 w-full disabled:bg-gray-100 disabled:text-gray-500"
                    value={stockRows.length > 0 ? String(computedStockQty) : form.qty}
                    onChange={(e) => updateForm('qty', e.target.value)}
                    disabled={stockRows.length > 0}
                  />
                  <span className="text-xs text-gray-500">
                    {stockRows.length > 0 ? 'Se calcula automaticamente con las ubicaciones cargadas.' : 'Usado como valor legado mientras no registres ubicaciones.'}
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Precio unitario</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="border rounded px-3 py-2 w-full"
                    value={form.unitPrice}
                    onChange={(e) => updateForm('unitPrice', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Moneda</span>
                  <input className="border rounded px-3 py-2 w-full" value={form.currency} onChange={(e) => updateForm('currency', e.target.value.toUpperCase())} />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Ultimo costo</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="border rounded px-3 py-2 w-full"
                    value={form.lastCost}
                    onChange={(e) => updateForm('lastCost', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Costo promedio</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="border rounded px-3 py-2 w-full"
                    value={form.avgCost}
                    onChange={(e) => updateForm('avgCost', e.target.value)}
                  />
                </label>
                <label className="space-y-1 md:col-span-3">
                  <span className="text-sm font-medium">Notas</span>
                  <textarea
                    className="border rounded px-3 py-2 w-full min-h-[88px]"
                    value={form.notes}
                    onChange={(e) => updateForm('notes', e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-sm">Stock multiubicacion</div>
              <div className="text-sm text-gray-600">
                Registra bodegas, ubicaciones internas y politicas de reorden. Cuando agregas filas aqui, el stock legacy se calcula automaticamente.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Bodega</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.warehouse ?? ''}
                    onChange={(e) => updateStock('warehouse', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Ubicacion</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.binLocation ?? ''}
                    onChange={(e) => updateStock('binLocation', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Disponible</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.stockOnHand ?? ''}
                    onChange={(e) => updateStock('stockOnHand', e.target.value === '' ? 0 : Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Reservado</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.stockReserved ?? ''}
                    onChange={(e) => updateStock('stockReserved', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Stock minimo</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.stockMin ?? ''}
                    onChange={(e) => updateStock('stockMin', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Stock maximo</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.stockMax ?? ''}
                    onChange={(e) => updateStock('stockMax', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Punto de reorden</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.reorderPoint ?? ''}
                    onChange={(e) => updateStock('reorderPoint', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Cantidad sugerida</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={stockDraft.reorderQty ?? ''}
                    onChange={(e) => updateStock('reorderQty', e.target.value === '' ? null : Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" className="px-3 py-2 border rounded" onClick={addStockRow}>
                  Agregar ubicacion
                </button>
                <button
                  type="button"
                  className="px-3 py-2 border rounded"
                  onClick={() => setStockDraft(createEmptyStock())}
                >
                  Limpiar ubicacion
                </button>
                <div className="text-sm text-gray-500">
                  Total disponible cargado: <span className="font-medium">{fmtQty(stockOnHandTotal(stockRows))}</span> {form.uom || 'UND'}
                </div>
              </div>

              <div className="space-y-2">
                {stockRows.map((row, index) => (
                  <div key={`${row.warehouse || 'stock'}-${row.binLocation || 'general'}-${index}`} className="border rounded px-3 py-2 flex items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{stockSummary(row)}</div>
                      <div className="text-xs text-gray-600">{stockPolicySummary(row) || 'Sin politica de reorden'}</div>
                    </div>
                    <button type="button" className="text-sm underline" onClick={() => removeStockRow(index)}>
                      Quitar
                    </button>
                  </div>
                ))}
                {stockRows.length === 0 ? (
                  <div className="text-sm text-gray-500">Sin ubicaciones cargadas manualmente.</div>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-sm">Aplicabilidad OEM</div>
              <div className="text-sm text-gray-600">
                Usa esta seccion cuando el mismo repuesto aplica a varios modelos, variantes o configuraciones con distinta cantidad por equipo.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium">Modelo</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.equipmentModel ?? ''}
                    onChange={(e) => updateApplicability('equipmentModel', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Variante</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.variant ?? ''}
                    onChange={(e) => updateApplicability('variant', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Qty por equipo</span>
                  <input
                    type="number"
                    min={0}
                    step="0.001"
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.qtyPerEquipment ?? ''}
                    onChange={(e) =>
                      updateApplicability(
                        'qtyPerEquipment',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Item manual</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.itemNo ?? ''}
                    onChange={(e) => updateApplicability('itemNo', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Serie desde</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.serialFrom ?? ''}
                    onChange={(e) => updateApplicability('serialFrom', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Serie hasta</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.serialTo ?? ''}
                    onChange={(e) => updateApplicability('serialTo', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Fecha desde</span>
                  <input
                    type="date"
                    className="border rounded px-3 py-2 w-full"
                    value={toDateInput(applicabilityDraft.appliedDateFrom)}
                    onChange={(e) => updateApplicability('appliedDateFrom', e.target.value || null)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Fecha hasta</span>
                  <input
                    type="date"
                    className="border rounded px-3 py-2 w-full"
                    value={toDateInput(applicabilityDraft.appliedDateTo)}
                    onChange={(e) => updateApplicability('appliedDateTo', e.target.value || null)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium">Pagina manual</span>
                  <input
                    className="border rounded px-3 py-2 w-full"
                    value={applicabilityDraft.manualPageRef ?? ''}
                    onChange={(e) => updateApplicability('manualPageRef', e.target.value)}
                  />
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-sm font-medium">Observacion OEM</span>
                  <textarea
                    className="border rounded px-3 py-2 w-full min-h-[72px]"
                    value={applicabilityDraft.manualRemark ?? ''}
                    onChange={(e) => updateApplicability('manualRemark', e.target.value)}
                  />
                </label>
                <label className="space-y-1 flex items-center gap-2 pt-7">
                  <input
                    type="checkbox"
                    checked={!!applicabilityDraft.isOptional}
                    onChange={(e) => updateApplicability('isOptional', e.target.checked)}
                  />
                  <span className="text-sm font-medium">Es opcional</span>
                </label>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" className="px-3 py-2 border rounded" onClick={addApplicabilityRow}>
                  Agregar aplicabilidad
                </button>
                <button
                  type="button"
                  className="px-3 py-2 border rounded"
                  onClick={() => setApplicabilityDraft(createEmptyApplicability())}
                >
                  Limpiar aplicabilidad
                </button>
              </div>

              <div className="space-y-2">
                {applicabilityRows.map((row, index) => (
                  <div key={`${row.equipmentModel || 'row'}-${index}`} className="border rounded px-3 py-2 flex items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">{applicabilitySummary(row)}</div>
                      <div className="text-xs text-gray-600">
                        {[row.serialFrom ? `Serie ${row.serialFrom}` : null, row.serialTo ? `a ${row.serialTo}` : null, row.manualPageRef ? `Pag. ${row.manualPageRef}` : null]
                          .filter(Boolean)
                          .join(' · ') || '-'}
                      </div>
                      {row.manualRemark ? <div className="text-xs text-gray-500 mt-1">{row.manualRemark}</div> : null}
                    </div>
                    <button type="button" className="text-sm underline" onClick={() => removeApplicabilityRow(index)}>
                      Quitar
                    </button>
                  </div>
                ))}
                {applicabilityRows.length === 0 ? (
                  <div className="text-sm text-gray-500">Sin reglas de aplicabilidad cargadas manualmente.</div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button type="submit" disabled={!canCreate} className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50">
                {creating ? 'Guardando...' : 'Crear repuesto'}
              </button>
              <button
                type="button"
                className="px-3 py-2 border rounded"
                onClick={() => {
                  setForm(createEmptyForm());
                  setApplicabilityDraft(createEmptyApplicability());
                  setApplicabilityRows([]);
                  setStockDraft(createEmptyStock());
                  setStockRows([]);
                }}
                disabled={creating}
              >
                Limpiar
              </button>
            </div>
          </form>
        </section>

        <section className="border rounded p-4 space-y-3">
          <div>
            <h2 className="font-semibold">Carga masiva</h2>
            <p className="text-sm text-gray-600">
              La plantilla extendida ya soporta datos OEM del catalogo, aplicabilidad y stock multiubicacion por bodega.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <button
              type="button"
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={!file || previewing || committing}
              onClick={uploadPreview}
            >
              {previewing ? 'Previsualizando...' : 'Previsualizar'}
            </button>
            <button
              type="button"
              className="px-3 py-2 border rounded bg-black text-white disabled:opacity-50"
              disabled={!file || committing}
              onClick={commitImport}
            >
              {committing ? 'Importando...' : 'Importar'}
            </button>
          </div>

          {preview ? (
            <div className="space-y-2">
              <div className="text-sm text-gray-700">
                {preview.totalRows} filas · {preview.errors} con error · {preview.warnings} con advertencia
              </div>
              <div className="border rounded overflow-auto max-h-80">
                <table className="w-full text-sm min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 text-left border-b">Fila</th>
                      <th className="p-2 text-left border-b">SKU</th>
                      <th className="p-2 text-left border-b">Nombre</th>
                      <th className="p-2 text-left border-b">OEM</th>
                      <th className="p-2 text-left border-b">Tipo</th>
                      <th className="p-2 text-left border-b">Aplicabilidad</th>
                      <th className="p-2 text-left border-b">Stock</th>
                      <th className="p-2 text-left border-b">Precio</th>
                      <th className="p-2 text-left border-b">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((row, idx) => {
                      const hasErr = Array.isArray(row._errors) && row._errors.length > 0;
                      const hasWarn = Array.isArray(row._warnings) && row._warnings.length > 0;
                      return (
                        <tr key={`${row._row ?? idx}-${row.sku ?? ''}`} className={hasErr ? 'bg-red-50' : hasWarn ? 'bg-amber-50' : ''}>
                          <td className="p-2 border-b">{row._row ?? idx + 1}</td>
                          <td className="p-2 border-b">{row.sku ?? ''}</td>
                          <td className="p-2 border-b">{row.name ?? ''}</td>
                          <td className="p-2 border-b">{row.oemPartNo ?? '-'}</td>
                          <td className="p-2 border-b">{row.partType ? partTypeLabel(row.partType) : '-'}</td>
                          <td className="p-2 border-b">
                            {[row.equipmentModel, row.variant, row.qtyPerEquipment !== null && row.qtyPerEquipment !== undefined ? `Qty/eq ${row.qtyPerEquipment}` : null]
                              .filter(Boolean)
                              .join(' · ') || '-'}
                          </td>
                          <td className="p-2 border-b">
                            <div>{[row.warehouse, row.binLocation].filter(Boolean).join(' / ') || 'General'}</div>
                            <div className="text-xs text-gray-600">
                              {[`Disp ${fmtQty(row.qty ?? 0)}`, row.stockReserved !== null && row.stockReserved !== undefined ? `Res ${fmtQty(row.stockReserved)}` : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            <div className="text-xs text-gray-500">
                              {[row.stockMin !== null && row.stockMin !== undefined ? `Min ${fmtQty(row.stockMin)}` : null, row.reorderPoint !== null && row.reorderPoint !== undefined ? `Reorden ${fmtQty(row.reorderPoint)}` : null]
                                .filter(Boolean)
                                .join(' · ') || '-'}
                            </div>
                          </td>
                          <td className="p-2 border-b">{fmtMoney(row.unitPrice, row.currency || 'COP')}</td>
                          <td className="p-2 border-b">
                            {hasErr ? (row._errors ?? []).join('; ') : hasWarn ? (row._warnings ?? []).join('; ') : row.status ? statusLabel(row.status) : 'OK'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="border rounded overflow-auto">
        <table className="min-w-[1380px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Repuesto</th>
              <th className="text-left p-2 border-b">OEM / Manual</th>
              <th className="text-left p-2 border-b">Aplicabilidad</th>
              <th className="text-left p-2 border-b">Clasificacion</th>
              <th className="text-left p-2 border-b">Stock / Ubicaciones y costos</th>
              <th className="text-left p-2 border-b">Proveedor</th>
              <th className="text-left p-2 border-b">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={7}>
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={7}>
                  Sin repuestos registrados.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 align-top">
                  <td className="p-2 border-b">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-600">{item.sku}</div>
                    {item.description ? <div className="text-xs text-gray-500 mt-1">{item.description}</div> : null}
                  </td>
                  <td className="p-2 border-b">
                    <div>{item.oemPartNo || '-'}</div>
                    <div className="text-xs text-gray-600">
                      {[item.systemGroup, item.sectionCode].filter(Boolean).join(' / ') || '-'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {[item.sectionName, item.itemNo ? `Item ${item.itemNo}` : null].filter(Boolean).join(' · ') || '-'}
                    </div>
                  </td>
                  <td className="p-2 border-b">
                    {(item.applicability ?? []).length > 0 ? (
                      <div className="space-y-2">
                        {(item.applicability ?? []).slice(0, 2).map((row, index) => (
                          <div key={`${row.id ?? 'app'}-${index}`} className="text-xs">
                            <div className="font-medium text-gray-800">{applicabilitySummary(row)}</div>
                            <div className="text-gray-500">
                              {[row.serialFrom ? `Serie ${row.serialFrom}` : null, row.serialTo ? `a ${row.serialTo}` : null, row.manualPageRef ? `Pag. ${row.manualPageRef}` : null]
                                .filter(Boolean)
                                .join(' · ') || '-'}
                            </div>
                          </div>
                        ))}
                        {(item.applicability ?? []).length > 2 ? (
                          <div className="text-xs text-gray-500">+ {(item.applicability ?? []).length - 2} regla(s) mas</div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Sin aplicabilidad especifica</span>
                    )}
                  </td>
                  <td className="p-2 border-b">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 border rounded text-xs ${partTypeClass(item.partType)}`}>
                        {partTypeLabel(item.partType)}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 border rounded text-xs ${statusClass(item.status)}`}>
                        {statusLabel(item.status)}
                      </span>
                      <span className={`inline-flex px-2 py-0.5 border rounded text-xs ${criticalityClass(item.criticality)}`}>
                        {criticalityLabel(item.criticality)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">U/M: {item.uom || 'UND'}</div>
                    <div className="text-xs text-gray-500">{item.interchangeableWith ? `Equivalencia: ${item.interchangeableWith}` : '-'}</div>
                  </td>
                  <td className="p-2 border-b">
                    {(() => {
                      const totalStock = (item.stocks ?? []).length > 0 ? stockOnHandTotal(item.stocks ?? []) : item.qty;
                      return (
                        <>
                          <div>
                            Stock total: <span className="font-medium">{fmtQty(totalStock)}</span> {item.uom || 'UND'}
                          </div>
                          {(item.stocks ?? []).length > 0 ? (
                            <div className="space-y-2 mt-2">
                              {(item.stocks ?? []).slice(0, 2).map((row, index) => (
                                <div key={`${row.id ?? 'stock'}-${index}`} className="text-xs">
                                  <div className="font-medium text-gray-800">{stockSummary(row)}</div>
                                  <div className="text-gray-500">{stockPolicySummary(row) || 'Sin politica de reorden'}</div>
                                </div>
                              ))}
                              {(item.stocks ?? []).length > 2 ? (
                                <div className="text-xs text-gray-500">+ {(item.stocks ?? []).length - 2} ubicacion(es) mas</div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500 mt-1">Sin desglose por ubicacion.</div>
                          )}
                          <div className="text-xs text-gray-600 mt-2">
                            Precio: {fmtMoney(item.unitPrice, item.currency)} · Ult: {fmtMoney(item.lastCost, item.currency)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Prom: {fmtMoney(item.avgCost, item.currency)} · Moneda: {item.currency || '-'}
                          </div>
                        </>
                      );
                    })()}
                  </td>
                  <td className="p-2 border-b">
                    <div>{item.preferredSupplier || '-'}</div>
                    <div className="text-xs text-gray-600">Cod. proveedor: {item.supplierPartNo || '-'}</div>
                    <div className="text-xs text-gray-500">
                      Lead time: {item.leadTimeDays !== null && item.leadTimeDays !== undefined ? `${item.leadTimeDays} dias` : '-'}
                    </div>
                  </td>
                  <td className="p-2 border-b">
                    <div>{fmtDate(item.updatedAt)}</div>
                    {item.notes ? <div className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{item.notes}</div> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="border rounded overflow-auto">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="font-semibold">Ultimos movimientos de inventario</h2>
          <p className="text-sm text-gray-600">
            Kardex base de consumos y devoluciones registrados automaticamente desde OT y OS.
          </p>
        </div>
        <table className="min-w-[1120px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">Fecha</th>
              <th className="text-left p-2 border-b">Movimiento</th>
              <th className="text-left p-2 border-b">Repuesto</th>
              <th className="text-left p-2 border-b">Cantidad</th>
              <th className="text-left p-2 border-b">Ubicacion</th>
              <th className="text-left p-2 border-b">Referencia</th>
              <th className="text-left p-2 border-b">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={7}>
                  Cargando movimientos...
                </td>
              </tr>
            ) : movements.length === 0 ? (
              <tr>
                <td className="p-4 text-gray-600" colSpan={7}>
                  Aun no hay movimientos registrados para los filtros actuales.
                </td>
              </tr>
            ) : (
              movements.map((movement) => (
                <tr key={movement.id} className="hover:bg-gray-50 align-top">
                  <td className="p-2 border-b whitespace-nowrap">{fmtDate(movement.createdAt)}</td>
                  <td className="p-2 border-b">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex px-2 py-0.5 border rounded text-xs ${movementTypeClass(movement.movementType)}`}>
                        {movementTypeLabel(movement.movementType)}
                      </span>
                      <span className="text-xs text-gray-500">{movementSourceLabel(movement.source)}</span>
                    </div>
                  </td>
                  <td className="p-2 border-b">
                    <div className="font-medium">{movement.inventoryItem?.name || '-'}</div>
                    <div className="text-xs text-gray-600">{movement.inventoryItem?.sku || '-'}</div>
                  </td>
                  <td className="p-2 border-b">
                    <div className={movement.stockDelta < 0 ? 'text-rose-700 font-medium' : 'text-emerald-700 font-medium'}>
                      {movement.stockDelta < 0 ? '-' : '+'}
                      {fmtQty(movement.qty)} {movement.inventoryItem?.uom || 'UND'}
                    </div>
                    {movement.unitCost !== null && movement.unitCost !== undefined ? (
                      <div className="text-xs text-gray-500">
                        {fmtMoney(movement.unitCost, movement.inventoryItem?.currency || 'COP')}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2 border-b">
                    {[movement.warehouse, movement.binLocation].filter(Boolean).join(' / ') || 'General'}
                  </td>
                  <td className="p-2 border-b">
                    <div>{movement.referenceLabel || [movement.referenceType, movement.referenceId].filter(Boolean).join(' · ') || '-'}</div>
                    {movement.note ? <div className="text-xs text-gray-500 mt-1">{movement.note}</div> : null}
                  </td>
                  <td className="p-2 border-b">
                    {movement.balanceAfter !== null && movement.balanceAfter !== undefined
                      ? `${fmtQty(movement.balanceAfter)} ${movement.inventoryItem?.uom || 'UND'}`
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
