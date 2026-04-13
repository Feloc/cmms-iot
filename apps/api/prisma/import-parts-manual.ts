import { PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import * as path from 'path';

type ManifestHotspot = {
  inventoryItemId?: string | null;
  inventoryItemSku?: string | null;
  itemNo?: string;
  label?: string | null;
  oemPartNo?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  qtyHint?: number | null;
  notes?: string | null;
};

type ManifestPage = {
  pageNumber?: number;
  title?: string | null;
  imageUrl?: string;
  hotspots?: ManifestHotspot[];
};

type PartsManualManifest = {
  tenantSlug?: string;
  brand?: string | null;
  equipmentModel?: string;
  variant?: string | null;
  name?: string;
  sourcePdfUrl?: string | null;
  replaceExisting?: boolean | string | number | null;
  pages?: ManifestPage[];
};

const prisma = new PrismaClient();

function truthy(value: unknown) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(normalized);
}

function normalizeText(value: unknown, field: string, required = false) {
  if (value === undefined) {
    if (required) throw new Error(`${field} is required`);
    return undefined;
  }
  if (value === null) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  return text;
}

function normalizeAssetPath(value: unknown, field: string, required = false) {
  const text = normalizeText(value, field, required);
  if (text === undefined || text === null) return text;
  const normalized = text.replace(/\\/g, '/').trim();
  if (!normalized) {
    if (required) throw new Error(`${field} is required`);
    return null;
  }
  if (/^(https?:|data:|blob:)/i.test(normalized)) return normalized;
  if (normalized.startsWith('/')) return normalized;
  const sanitized = normalized.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
  return `/${sanitized}`;
}

function normalizePercent(value: unknown, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 100) {
    throw new Error(`${field} must be a number between 0 and 100`);
  }
  return num;
}

function normalizePositiveFloat(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return num;
}

function usage() {
  console.log('Uso: npm run parts-manual:import -w apps/api -- <manifest.json> [tenant-slug]');
  console.log('Ejemplo: npm run parts-manual:import -w apps/api -- ../../docs/manuals/CBD20J-LI3.parts-manual.template.json acme');
}

async function main() {
  const manifestArg = process.argv[2];
  const tenantSlugArg = process.argv[3];

  if (!manifestArg) {
    usage();
    process.exit(1);
  }

  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw) as PartsManualManifest;

  const tenantSlug = String(tenantSlugArg || normalizeText(manifest.tenantSlug, 'tenantSlug', true));
  const equipmentModel = String(normalizeText(manifest.equipmentModel, 'equipmentModel', true));
  const brand = normalizeText(manifest.brand, 'brand');
  const variant = normalizeText(manifest.variant, 'variant');
  const name = String(normalizeText(manifest.name, 'name', true));
  const sourcePdfUrl = normalizeAssetPath(manifest.sourcePdfUrl, 'sourcePdfUrl');
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];

  if (pages.length === 0) {
    throw new Error('pages must contain at least one page');
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant not found for slug "${tenantSlug}"`);

  const skuSet = new Set<string>();
  for (const page of pages) {
    for (const hotspot of page.hotspots ?? []) {
      const sku = normalizeText(hotspot.inventoryItemSku, 'inventoryItemSku');
      if (sku) skuSet.add(sku);
    }
  }

  const inventoryItems = skuSet.size
    ? await prisma.inventoryItem.findMany({
        where: { tenantId: tenant.id, sku: { in: Array.from(skuSet) } },
        select: { id: true, sku: true },
      })
    : [];
  const inventoryBySku = new Map(inventoryItems.map((item) => [item.sku, item.id]));

  const missingSkus = Array.from(skuSet).filter((sku) => !inventoryBySku.has(sku));
  if (missingSkus.length > 0) {
    throw new Error(`No se encontraron estos SKU en inventario para el tenant ${tenantSlug}: ${missingSkus.join(', ')}`);
  }

  if (truthy(manifest.replaceExisting)) {
    await prisma.partsManual.deleteMany({
      where: {
        tenantId: tenant.id,
        equipmentModel,
        brand: brand ?? null,
        variant: variant ?? null,
      },
    });
  }

  const created = await prisma.partsManual.create({
    data: {
      tenantId: tenant.id,
      brand: brand ?? null,
      equipmentModel,
      variant: variant ?? null,
      name,
      sourcePdfUrl: sourcePdfUrl ?? null,
      pages: {
        create: pages.map((page, pageIndex) => {
          const pageNumber = Number(page.pageNumber ?? pageIndex + 1);
          if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
            throw new Error(`pages[${pageIndex}].pageNumber must be a positive number`);
          }
          const imageUrl = String(normalizeAssetPath(page.imageUrl, `pages[${pageIndex}].imageUrl`, true));
          return {
            tenantId: tenant.id,
            pageNumber: Math.round(pageNumber),
            title: normalizeText(page.title, `pages[${pageIndex}].title`) ?? null,
            imageUrl,
            hotspots: {
              create: (page.hotspots ?? []).map((hotspot, hotspotIndex) => {
                const inventoryItemSku = normalizeText(
                  hotspot.inventoryItemSku,
                  `pages[${pageIndex}].hotspots[${hotspotIndex}].inventoryItemSku`,
                );
                const width = normalizePercent(
                  hotspot.width,
                  `pages[${pageIndex}].hotspots[${hotspotIndex}].width`,
                );
                const height = normalizePercent(
                  hotspot.height,
                  `pages[${pageIndex}].hotspots[${hotspotIndex}].height`,
                );
                if (width <= 0 || height <= 0) {
                  throw new Error(`pages[${pageIndex}].hotspots[${hotspotIndex}] width and height must be greater than 0`);
                }
                return {
                  tenantId: tenant.id,
                  inventoryItemId:
                    normalizeText(hotspot.inventoryItemId, `pages[${pageIndex}].hotspots[${hotspotIndex}].inventoryItemId`) ??
                    (inventoryItemSku ? inventoryBySku.get(inventoryItemSku) ?? null : null),
                  itemNo: String(normalizeText(hotspot.itemNo, `pages[${pageIndex}].hotspots[${hotspotIndex}].itemNo`, true)),
                  label:
                    normalizeText(hotspot.label, `pages[${pageIndex}].hotspots[${hotspotIndex}].label`) ?? null,
                  oemPartNo:
                    normalizeText(hotspot.oemPartNo, `pages[${pageIndex}].hotspots[${hotspotIndex}].oemPartNo`) ?? null,
                  x: normalizePercent(hotspot.x, `pages[${pageIndex}].hotspots[${hotspotIndex}].x`),
                  y: normalizePercent(hotspot.y, `pages[${pageIndex}].hotspots[${hotspotIndex}].y`),
                  width,
                  height,
                  qtyHint:
                    normalizePositiveFloat(hotspot.qtyHint, `pages[${pageIndex}].hotspots[${hotspotIndex}].qtyHint`) ?? null,
                  notes:
                    normalizeText(hotspot.notes, `pages[${pageIndex}].hotspots[${hotspotIndex}].notes`) ?? null,
                };
              }),
            },
          };
        }),
      },
    },
    include: {
      pages: {
        include: {
          hotspots: true,
        },
      },
    },
  });

  const hotspotCount = created.pages.reduce((sum, page) => sum + page.hotspots.length, 0);
  console.log('Manual importado correctamente');
  console.log(
    JSON.stringify(
      {
        tenant: tenant.slug,
        manualId: created.id,
        equipmentModel: created.equipmentModel,
        pages: created.pages.length,
        hotspots: hotspotCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
