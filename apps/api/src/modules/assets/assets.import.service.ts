import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';

function excelSerialToISO(v: any): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const millis = Math.round(n * 86400000);
  const base = Date.UTC(1899, 11, 30);
  const d = new Date(base + millis);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AssetsImportService {
  private readonly logger = new Logger(AssetsImportService.name);
  constructor(private readonly prisma: PrismaService) {}

  async handlePreview(file: Express.Multer.File) {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');

    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
    const upload = await this.prisma.assetImportUpload.create({
      data: {
        tenantId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        sha256,
        storagePath: file.path,
      },
      select: { id: true, createdAt: true },
    });

    const sample = await this.parseSample(file.path, 200);

    return {
      uploadId: upload.id,
      totalRows: sample.totalRows,
      errors: [],
      warnings: [],
      sample: sample.rows,
    };
  }

  async handleCommit(uploadId: string, _options: Record<string, any>) {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('No tenant in context');

    const upload = await this.prisma.assetImportUpload.findFirst({
      where: { id: uploadId, tenantId },
    });
    if (!upload) throw new NotFoundException('uploadId not found');

    const filePath = upload.storagePath;
    if (!filePath || !fs.existsSync(filePath)) throw new NotFoundException('upload file missing');

    const rows = await this.parseAll(filePath);

    let created = 0, updated = 0, failed = 0; const issues: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        try {
          if (!r.code || !r.name) {
            failed++; issues.push({ code: r.code, error: 'code/name required' }); continue;
          }
          const data: any = {
            tenantId,
            code: String(r.code).trim(),
            name: String(r.name).trim(),
            customer: (r as any).customer ?? (r as any).cliente ?? (r as any).Cliente ?? (r as any).CLIENTE ?? null,
            brand: r.brand ?? null,
            model: r.model ?? null,
            serialNumber: r.serialNumber ?? null,
            status: (r.status as any) || 'ACTIVE',
            criticality: (r.criticality as any) || 'MEDIUM',
            nominalPower: r.nominalPower ? Number(r.nominalPower) : null,
            nominalPowerUnit: r.nominalPowerUnit ?? null,
            acquiredOn: r.acquiredOn ? new Date(r.acquiredOn) : null,
            ingestKey: r.ingestKey ?? null,
          };

          const existing = await tx.asset.findFirst({ where: { tenantId, code: data.code }, select: { id: true } });
          if (existing) {
            await tx.asset.update({ where: { id: existing.id }, data });
            updated++;
          } else {
            await tx.asset.create({ data });
            created++;
          }
        } catch (e: any) {
          failed++; issues.push({ code: r.code, error: e?.message || 'unknown' });
        }
      }

      await tx.assetImportUpload.update({ where: { id: uploadId }, data: { status: 'COMMITTED' } });
    });

    try { fs.unlinkSync(filePath); } catch {}

    return { uploadId, created, updated, failed, issues };
  }

  private async parseSample(filePath: string, limit = 200): Promise<{ totalRows: number; rows: any[] }> {
    const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const json = XLSX.utils.sheet_to_json(ws, { raw: true });
    const totalRows = json.length;
    const sliced = (json as any[]).slice(0, limit).map((r, i) => ({
      ...r,
      _row: i + 1,
      acquiredOn: r?.acquiredOn ? excelSerialToISO(r.acquiredOn) : r?.acquiredOn,
    }));
    return { totalRows, rows: sliced };
  }

  private async parseAll(filePath: string): Promise<any[]> {
    const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const json = XLSX.utils.sheet_to_json(ws, { raw: true });
    return (json as any[]).map((r) => ({
      ...r,
      acquiredOn: r?.acquiredOn ? excelSerialToISO(r.acquiredOn) : r?.acquiredOn,
    }));
  }
}
