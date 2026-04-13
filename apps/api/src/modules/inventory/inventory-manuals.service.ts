import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { InventoryService } from './inventory.service';

type ManualQuery = {
  model?: string;
  brand?: string;
  variant?: string;
};

type CreatePartsManualInput = {
  brand?: string | null;
  equipmentModel?: string;
  variant?: string | null;
  name?: string;
  sourcePdfUrl?: string | null;
  replaceExisting?: boolean;
  pages?: unknown[];
};

type CreatePartsManualPageInput = {
  pageNumber?: number;
  title?: string | null;
  imageUrl?: string;
  hotspots?: unknown[];
};

type CreatePartsManualHotspotInput = {
  inventoryItemId?: string | null;
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

type InventoryCandidate = {
  id: string;
  sku: string;
  name: string;
  oemPartNo: string | null;
  itemNo: string | null;
  systemGroup: string | null;
  description: string | null;
  qty: number;
  applicability: Array<{
    equipmentModel: string | null;
    variant: string | null;
    itemNo: string | null;
  }>;
};

type SanitizedHotspot = {
  inventoryItemId?: string | null;
  itemNo: string;
  label?: string | null;
  oemPartNo?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  qtyHint?: number | null;
  notes?: string | null;
};

type SanitizedPage = {
  pageNumber: number;
  title?: string | null;
  imageUrl: string;
  hotspots: SanitizedHotspot[];
};

type ManualIdentity = {
  brand?: string | null;
  equipmentModel: string;
  variant?: string | null;
};

@Injectable()
export class InventoryManualsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private normalizeText(value: unknown, field: string, required = false) {
    if (value === undefined) {
      if (required) throw new BadRequestException(`${field} is required`);
      return undefined;
    }
    if (value === null) {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    const text = String(value).trim();
    if (!text) {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    return text;
  }

  private normalizeAssetPath(value: unknown, field: string, required = false) {
    const text = this.normalizeText(value, field, required);
    if (text === undefined || text === null) return text;
    const normalized = text.replace(/\\/g, '/').trim();
    if (!normalized) {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    if (/^(https?:|data:|blob:)/i.test(normalized)) return normalized;
    if (normalized.startsWith('/')) return normalized;
    const sanitized = normalized.replace(/^(\.\/)+/, '').replace(/^(\.\.\/)+/, '');
    return `/${sanitized}`;
  }

  private normalizePercent(value: unknown, field: string) {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new BadRequestException(`${field} must be a valid number`);
    }
    if (num < 0 || num > 100) {
      throw new BadRequestException(`${field} must be between 0 and 100`);
    }
    return num;
  }

  private normalizePositiveFloat(value: unknown, field: string, required = false) {
    if (value === undefined) {
      if (required) throw new BadRequestException(`${field} is required`);
      return undefined;
    }
    if (value === null || String(value).trim() === '') {
      if (required) throw new BadRequestException(`${field} is required`);
      return null;
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }
    return num;
  }

  private normalizePositiveInt(value: unknown, field: string, required = false) {
    const num = this.normalizePositiveFloat(value, field, required);
    if (num === undefined || num === null) return num;
    return Math.round(num);
  }

  private sameText(a?: string | null, b?: string | null) {
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  }

  private truthy(value: unknown) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'si', 'sí', 'y'].includes(normalized);
  }

  private manualScore(
    manual: { brand: string | null; equipmentModel: string; variant: string | null },
    query: Required<ManualQuery>,
  ) {
    if (!this.sameText(manual.equipmentModel, query.model)) return -1;
    let score = 100;

    if (query.brand) {
      if (manual.brand && this.sameText(manual.brand, query.brand)) score += 20;
      else if (!manual.brand) score += 10;
    } else if (!manual.brand) {
      score += 1;
    }

    if (query.variant) {
      if (manual.variant && this.sameText(manual.variant, query.variant)) score += 10;
      else if (!manual.variant) score += 5;
    } else if (!manual.variant) {
      score += 1;
    }

    return score;
  }

  private sanitizePages(raw: unknown): SanitizedPage[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new BadRequestException('pages must contain at least one page');
    }

    return raw.map((entry, pageIndex) => {
      if (!entry || typeof entry !== 'object') {
        throw new BadRequestException(`pages[${pageIndex}] must be an object`);
      }
      const page = entry as CreatePartsManualPageInput;
      const hotspotsRaw = Array.isArray(page.hotspots) ? page.hotspots : [];
      const hotspots = hotspotsRaw.map((hotspotEntry, hotspotIndex) => {
        if (!hotspotEntry || typeof hotspotEntry !== 'object') {
          throw new BadRequestException(`pages[${pageIndex}].hotspots[${hotspotIndex}] must be an object`);
        }
        const hotspot = hotspotEntry as CreatePartsManualHotspotInput;
        const width = this.normalizePercent(hotspot.width, `pages[${pageIndex}].hotspots[${hotspotIndex}].width`);
        const height = this.normalizePercent(hotspot.height, `pages[${pageIndex}].hotspots[${hotspotIndex}].height`);
        if (width <= 0 || height <= 0) {
          throw new BadRequestException(`pages[${pageIndex}].hotspots[${hotspotIndex}] width and height must be greater than 0`);
        }
        return {
          inventoryItemId: this.normalizeText(hotspot.inventoryItemId, `pages[${pageIndex}].hotspots[${hotspotIndex}].inventoryItemId`),
          itemNo: String(this.normalizeText(hotspot.itemNo, `pages[${pageIndex}].hotspots[${hotspotIndex}].itemNo`, true)),
          label: this.normalizeText(hotspot.label, `pages[${pageIndex}].hotspots[${hotspotIndex}].label`),
          oemPartNo: this.normalizeText(hotspot.oemPartNo, `pages[${pageIndex}].hotspots[${hotspotIndex}].oemPartNo`),
          x: this.normalizePercent(hotspot.x, `pages[${pageIndex}].hotspots[${hotspotIndex}].x`),
          y: this.normalizePercent(hotspot.y, `pages[${pageIndex}].hotspots[${hotspotIndex}].y`),
          width,
          height,
          qtyHint: this.normalizePositiveFloat(hotspot.qtyHint, `pages[${pageIndex}].hotspots[${hotspotIndex}].qtyHint`),
          notes: this.normalizeText(hotspot.notes, `pages[${pageIndex}].hotspots[${hotspotIndex}].notes`),
        };
      });

      return {
        pageNumber: this.normalizePositiveInt(page.pageNumber ?? pageIndex + 1, `pages[${pageIndex}].pageNumber`, true) ?? pageIndex + 1,
        title: this.normalizeText(page.title, `pages[${pageIndex}].title`),
        imageUrl: String(this.normalizeAssetPath(page.imageUrl, `pages[${pageIndex}].imageUrl`, true)),
        hotspots,
      };
    });
  }

  private buildHotspotFreeText(hotspot: {
    itemNo: string;
    label?: string | null;
    oemPartNo?: string | null;
  }) {
    return [hotspot.itemNo ? `Item ${hotspot.itemNo}` : null, hotspot.label, hotspot.oemPartNo].filter(Boolean).join(' · ');
  }

  private async findManualConflicts(
    tenantId: string,
    identity: ManualIdentity,
    excludeId?: string,
  ) {
    return this.prisma.partsManual.findMany({
      where: {
        tenantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        equipmentModel: { equals: identity.equipmentModel, mode: 'insensitive' },
        brand: identity.brand ? { equals: identity.brand, mode: 'insensitive' } : null,
        variant: identity.variant ? { equals: identity.variant, mode: 'insensitive' } : null,
      },
      select: {
        id: true,
        name: true,
        brand: true,
        equipmentModel: true,
        variant: true,
        updatedAt: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private buildManualConflictMessage(identity: ManualIdentity) {
    const scope = [identity.brand, identity.equipmentModel, identity.variant].filter(Boolean).join(' · ');
    return `Ya existe un manual para ${scope || identity.equipmentModel}. Activa la opción "Reemplazar manual existente" o edita el manual ya creado.`;
  }

  private buildPageCreateInput(tenantId: string, pages: SanitizedPage[]) {
    return pages.map((page) => ({
      tenantId,
      pageNumber: page.pageNumber,
      title: page.title ?? null,
      imageUrl: page.imageUrl,
      hotspots: {
        create: page.hotspots.map((hotspot) => ({
          tenantId,
          inventoryItemId: hotspot.inventoryItemId ?? null,
          itemNo: hotspot.itemNo,
          label: hotspot.label ?? null,
          oemPartNo: hotspot.oemPartNo ?? null,
          x: hotspot.x,
          y: hotspot.y,
          width: hotspot.width,
          height: hotspot.height,
          qtyHint: hotspot.qtyHint ?? null,
          notes: hotspot.notes ?? null,
        })),
      },
    }));
  }

  private toManualDetail(
    manual: {
      id: string;
      brand: string | null;
      equipmentModel: string;
      variant: string | null;
      name: string;
      sourcePdfUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
      pages: Array<{
        id: string;
        pageNumber: number;
        title: string | null;
        imageUrl: string;
        hotspots: Array<{
          id: string;
          itemNo: string;
          label: string | null;
          oemPartNo: string | null;
          x: number;
          y: number;
          width: number;
          height: number;
          qtyHint: number | null;
          notes: string | null;
          inventoryItem?: { id: string; sku: string } | null;
        }>;
      }>;
    },
  ) {
    return {
      id: manual.id,
      brand: manual.brand,
      equipmentModel: manual.equipmentModel,
      variant: manual.variant,
      name: manual.name,
      sourcePdfUrl: this.normalizeAssetPath(manual.sourcePdfUrl, 'sourcePdfUrl'),
      createdAt: manual.createdAt,
      updatedAt: manual.updatedAt,
      pageCount: manual.pages.length,
      hotspotCount: manual.pages.reduce((sum, page) => sum + page.hotspots.length, 0),
      pages: manual.pages.map((page) => ({
        id: page.id,
        pageNumber: page.pageNumber,
        title: page.title,
        imageUrl: this.normalizeAssetPath(page.imageUrl, 'imageUrl', true),
        hotspots: page.hotspots.map((hotspot) => ({
          id: hotspot.id,
          itemNo: hotspot.itemNo,
          label: hotspot.label,
          oemPartNo: hotspot.oemPartNo,
          inventoryItemId: hotspot.inventoryItem?.id ?? null,
          inventoryItemSku: hotspot.inventoryItem?.sku ?? null,
          x: hotspot.x,
          y: hotspot.y,
          width: hotspot.width,
          height: hotspot.height,
          qtyHint: hotspot.qtyHint,
          notes: hotspot.notes,
          freeText: this.buildHotspotFreeText(hotspot),
        })),
      })),
    };
  }

  private itemMatchScore(
    item: InventoryCandidate,
    hotspot: {
      inventoryItemId?: string | null;
      itemNo: string;
      oemPartNo?: string | null;
    },
    query: Required<ManualQuery>,
  ) {
    let score = 0;

    if (hotspot.inventoryItemId && item.id === hotspot.inventoryItemId) score += 1000;
    if (hotspot.oemPartNo && item.oemPartNo && this.sameText(item.oemPartNo, hotspot.oemPartNo)) score += 500;
    if (item.itemNo && this.sameText(item.itemNo, hotspot.itemNo)) score += 300;

    for (const applicability of item.applicability ?? []) {
      if (!applicability.itemNo || !this.sameText(applicability.itemNo, hotspot.itemNo)) continue;
      score += 200;
      if (query.model && applicability.equipmentModel && this.sameText(applicability.equipmentModel, query.model)) score += 50;
      if (query.variant && applicability.variant && this.sameText(applicability.variant, query.variant)) score += 25;
    }

    return score;
  }

  async getManualByModel(tenantId: string, query: ManualQuery) {
    await this.inventory.assertAdminOrTech(tenantId);

    const normalized: Required<ManualQuery> = {
      model: String(this.normalizeText(query.model, 'model', true)),
      brand: String(this.normalizeText(query.brand, 'brand') ?? ''),
      variant: String(this.normalizeText(query.variant, 'variant') ?? ''),
    };

    const manuals = await this.prisma.partsManual.findMany({
      where: {
        tenantId,
        equipmentModel: { equals: normalized.model, mode: 'insensitive' },
      },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
          include: {
            hotspots: {
              orderBy: [{ itemNo: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    });

    if (!manuals.length) return null;

    const manual = manuals
      .map((entry) => ({ entry, score: this.manualScore(entry, normalized) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.updatedAt.getTime() - a.entry.updatedAt.getTime() ||
          b.entry.createdAt.getTime() - a.entry.createdAt.getTime() ||
          a.entry.name.localeCompare(b.entry.name) ||
          a.entry.id.localeCompare(b.entry.id),
      )[0]?.entry;

    if (!manual) return null;

    const directIds = new Set<string>();
    const oemValues = new Set<string>();
    const itemNoValues = new Set<string>();

    for (const page of manual.pages) {
      for (const hotspot of page.hotspots) {
        if (hotspot.inventoryItemId) directIds.add(hotspot.inventoryItemId);
        if (hotspot.oemPartNo) oemValues.add(hotspot.oemPartNo);
        if (hotspot.itemNo) itemNoValues.add(hotspot.itemNo);
      }
    }

    let inventoryCandidates: InventoryCandidate[] = [];
    const candidateOr: Array<Record<string, unknown>> = [];
    if (directIds.size) candidateOr.push({ id: { in: Array.from(directIds) } });
    if (oemValues.size) candidateOr.push({ oemPartNo: { in: Array.from(oemValues) } });
    if (itemNoValues.size) {
      candidateOr.push({ itemNo: { in: Array.from(itemNoValues) } });
      candidateOr.push({
        applicability: {
          some: {
            itemNo: { in: Array.from(itemNoValues) },
          },
        },
      });
    }

    if (candidateOr.length > 0) {
      inventoryCandidates = await this.prisma.inventoryItem.findMany({
        where: {
          tenantId,
          OR: candidateOr as any,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          oemPartNo: true,
          itemNo: true,
          systemGroup: true,
          description: true,
          qty: true,
          applicability: {
            select: {
              equipmentModel: true,
              variant: true,
              itemNo: true,
            },
          },
        },
      });
    }

    return {
      id: manual.id,
      brand: manual.brand,
      equipmentModel: manual.equipmentModel,
      variant: manual.variant,
      name: manual.name,
      sourcePdfUrl: this.normalizeAssetPath(manual.sourcePdfUrl, 'sourcePdfUrl'),
      pages: manual.pages.map((page) => ({
        id: page.id,
        pageNumber: page.pageNumber,
        title: page.title,
        imageUrl: this.normalizeAssetPath(page.imageUrl, 'imageUrl', true),
        hotspots: page.hotspots.map((hotspot) => {
          const matches = inventoryCandidates
            .map((item) => ({
              item,
              score: this.itemMatchScore(item, hotspot, normalized),
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

          const seen = new Set<string>();
          const dedupedMatches = matches
            .filter((entry) => {
              if (seen.has(entry.item.id)) return false;
              seen.add(entry.item.id);
              return true;
            })
            .map((entry) => ({
              id: entry.item.id,
              sku: entry.item.sku,
              name: entry.item.name,
              oemPartNo: entry.item.oemPartNo,
              itemNo: entry.item.itemNo,
              systemGroup: entry.item.systemGroup,
              description: entry.item.description,
              qty: entry.item.qty,
            }));

          return {
            id: hotspot.id,
            itemNo: hotspot.itemNo,
            label: hotspot.label,
            oemPartNo: hotspot.oemPartNo,
            x: hotspot.x,
            y: hotspot.y,
            width: hotspot.width,
            height: hotspot.height,
            qtyHint: hotspot.qtyHint,
            notes: hotspot.notes,
            freeText: this.buildHotspotFreeText(hotspot),
            matches: dedupedMatches,
            matchCount: dedupedMatches.length,
          };
        }),
      })),
    };
  }

  async listManuals(tenantId: string, q?: string) {
    await this.inventory.assertAdmin(tenantId);

    const search = String(q ?? '').trim();
    return this.prisma.partsManual.findMany({
      where: {
        tenantId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
                { equipmentModel: { contains: search, mode: 'insensitive' } },
                { variant: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        _count: {
          select: { pages: true },
        },
        pages: {
          select: {
            _count: {
              select: { hotspots: true },
            },
          },
        },
      },
      orderBy: [{ equipmentModel: 'asc' }, { variant: 'asc' }, { updatedAt: 'desc' }],
    }).then((manuals) =>
      manuals.map((manual) => ({
        id: manual.id,
        brand: manual.brand,
        equipmentModel: manual.equipmentModel,
        variant: manual.variant,
        name: manual.name,
        sourcePdfUrl: this.normalizeAssetPath(manual.sourcePdfUrl, 'sourcePdfUrl'),
        createdAt: manual.createdAt,
        updatedAt: manual.updatedAt,
        pageCount: manual._count.pages,
        hotspotCount: manual.pages.reduce((sum, page) => sum + page._count.hotspots, 0),
      })),
    );
  }

  async getManualById(tenantId: string, id: string) {
    await this.inventory.assertAdmin(tenantId);

    const manual = await this.prisma.partsManual.findFirst({
      where: { tenantId, id },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
          include: {
            hotspots: {
              orderBy: [{ itemNo: 'asc' }, { createdAt: 'asc' }],
              include: {
                inventoryItem: {
                  select: { id: true, sku: true },
                },
              },
            },
          },
        },
      },
    });

    if (!manual) throw new NotFoundException('Manual not found');
    return this.toManualDetail(manual);
  }

  async deleteManual(tenantId: string, id: string) {
    await this.inventory.assertAdmin(tenantId);

    const manual = await this.prisma.partsManual.findFirst({
      where: { tenantId, id },
      select: { id: true, name: true, equipmentModel: true },
    });
    if (!manual) throw new NotFoundException('Manual not found');

    await this.prisma.partsManual.delete({
      where: { id: manual.id },
    });

    return { ok: true, id: manual.id, name: manual.name, equipmentModel: manual.equipmentModel };
  }

  async createManual(tenantId: string, input: CreatePartsManualInput) {
    await this.inventory.assertAdmin(tenantId);

    const equipmentModel = String(this.normalizeText(input.equipmentModel, 'equipmentModel', true));
    const brand = this.normalizeText(input.brand, 'brand');
    const variant = this.normalizeText(input.variant, 'variant');
    const name = String(this.normalizeText(input.name, 'name', true));
    const sourcePdfUrl = this.normalizeAssetPath(input.sourcePdfUrl, 'sourcePdfUrl');
    const pages = this.sanitizePages(input.pages);
    const identity = { brand: brand ?? null, equipmentModel, variant: variant ?? null };
    const conflicts = await this.findManualConflicts(tenantId, identity);

    if (this.truthy(input.replaceExisting)) {
      if (conflicts.length > 0) {
        await this.prisma.partsManual.deleteMany({
          where: {
            id: { in: conflicts.map((manual) => manual.id) },
          },
        });
      }
    } else if (conflicts.length > 0) {
      throw new ConflictException(this.buildManualConflictMessage(identity));
    }

    const created = await this.prisma.partsManual.create({
      data: {
        tenantId,
        brand: brand ?? null,
        equipmentModel,
        variant: variant ?? null,
        name,
        sourcePdfUrl: sourcePdfUrl ?? null,
        pages: {
          create: this.buildPageCreateInput(tenantId, pages),
        },
      },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
          include: {
            hotspots: {
              orderBy: [{ itemNo: 'asc' }, { createdAt: 'asc' }],
              include: {
                inventoryItem: {
                  select: { id: true, sku: true },
                },
              },
            },
          },
        },
      },
    });

    return this.toManualDetail(created);
  }

  async updateManual(tenantId: string, id: string, input: CreatePartsManualInput) {
    await this.inventory.assertAdmin(tenantId);

    const current = await this.prisma.partsManual.findFirst({
      where: { tenantId, id },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Manual not found');

    const equipmentModel = String(this.normalizeText(input.equipmentModel, 'equipmentModel', true));
    const brand = this.normalizeText(input.brand, 'brand');
    const variant = this.normalizeText(input.variant, 'variant');
    const name = String(this.normalizeText(input.name, 'name', true));
    const sourcePdfUrl = this.normalizeAssetPath(input.sourcePdfUrl, 'sourcePdfUrl');
    const pages = this.sanitizePages(input.pages);
    const identity = { brand: brand ?? null, equipmentModel, variant: variant ?? null };
    const conflicts = await this.findManualConflicts(tenantId, identity, id);

    if (!this.truthy(input.replaceExisting) && conflicts.length > 0) {
      throw new ConflictException(this.buildManualConflictMessage(identity));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (conflicts.length > 0) {
        await tx.partsManual.deleteMany({
          where: {
            id: { in: conflicts.map((manual) => manual.id) },
          },
        });
      }

      return tx.partsManual.update({
        where: { id },
        data: {
          brand: brand ?? null,
          equipmentModel,
          variant: variant ?? null,
          name,
          sourcePdfUrl: sourcePdfUrl ?? null,
          pages: {
            deleteMany: {},
            create: this.buildPageCreateInput(tenantId, pages),
          },
        },
        include: {
          pages: {
            orderBy: { pageNumber: 'asc' },
            include: {
              hotspots: {
                orderBy: [{ itemNo: 'asc' }, { createdAt: 'asc' }],
                include: {
                  inventoryItem: {
                    select: { id: true, sku: true },
                  },
                },
              },
            },
          },
        },
      });
    });

    return this.toManualDetail(updated);
  }
}
