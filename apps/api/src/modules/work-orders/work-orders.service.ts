import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { AddAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';
import { StartWorkDto, PauseWorkDto, StopWorkDto } from './dto/worklog.dto';
import { Prisma, NoticeStatus } from "@prisma/client";
import { UpsertResolutionDto } from './dto/resolution.dto';
import { CreatePartDto, UpdatePartDto } from './dto/part.dto';
import { CreateMeasurementDto, UpdateMeasurementDto } from './dto/measurement.dto';
import { CreateAttachmentDto } from './dto/attachment.dto';
import { CreateNoteDto } from './dto/note.dto';


@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const t = tenantStorage.getStore();
    if (!t?.tenantId) throw new Error('No tenant in context');
    return t.tenantId;
  }

  private getUserId(): string {
    const t = tenantStorage.getStore();
    if (!t?.userId) throw new Error('No user in context');
    return t.userId;
  }

  private async ensureWO(id: string, tenantId: string) {
    const wo = await this.prisma.workOrder.findFirst({ where: { id, tenantId } });
    if (!wo) throw new Error('WO not found');
    return wo;
  }

  private async holdIfNoOpenLogs(tx: PrismaService | Prisma.TransactionClient, tenantId: string, workOrderId: string) {
    const openCount = await tx.workLog.count({
        where: { tenantId, workOrderId, endedAt: null },
    });
    if (openCount === 0) {
        await tx.workOrder.update({
        where: { id: workOrderId },
        data: { status: 'ON_HOLD' as any },
        });
    }
    }

  async findAll() {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.findFirst({
      where: { id, tenantId },
      include: {
        assignments: true, // si quieres incluir user info, debes tener relación User; si no, deja IDs
        workLogs: true,
      },
    });
  }

  async create(dto: CreateWorkOrderDto) {
    const tenantId = this.getTenantId();
    return this.prisma.workOrder.create({
      data: {
        tenantId,
        title: dto.title,
        description: dto.description,
        assetCode: dto.assetCode,
        priority: dto.priority as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        ...(dto.noticeId ? { noticeId: dto.noticeId } : {}),
      },
    });
  }

  update(id: string, dto: UpdateWorkOrderDto) {
    const tenantId = this.getTenantId();
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.status !== undefined ? { status: dto.status as any } : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority as any } : {}),
          ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
          ...(dto.startedAt !== undefined ? { startedAt: dto.startedAt ? new Date(dto.startedAt) : null } : {}),
          ...(dto.completedAt !== undefined ? { completedAt: dto.completedAt ? new Date(dto.completedAt) : null } : {}),
          tenantId,
        },
        include: {notice: true},
      });

      if (dto.status === 'COMPLETED') {
        await tx.workLog.updateMany({
          where: { tenantId, workOrderId: id, endedAt: null },
          data: { endedAt: new Date() },
        });

        if (wo.noticeId) {
            await tx.notice.update({
                where: { id: wo.noticeId },
                data: {
                    status: 'CLOSED',
                    resolvedAt: new Date(),
                },
            });
        }
      }

      if (dto.status === 'COMPLETED') {
        // Validar resolución mínima: causa y remedio (por codeId u “Other”)
        const res = await this.prisma.workOrderResolution.findFirst({ where: { tenantId, workOrderId: id } });
        const hasCause = !!(res?.causeCodeId || res?.causeOther);
        const hasRemedy = !!(res?.remedyCodeId || res?.remedyOther);
        if (!hasCause || !hasRemedy) {
          throw new Error('Cannot complete: resolution requires cause and remedy');
        }
      }

      if (dto.status === 'IN_PROGRESS' && wo.noticeId) {
        await tx.notice.update({
            where: { id: wo.noticeId },
            data: { status: NoticeStatus.IN_PROGRESS as any },
        });
      }

      return wo;
    });
  }

  async addAssignment(woId: string, dto: AddAssignmentDto) {
    const tenantId = this.getTenantId();
    await this.ensureWO(woId, tenantId);

    const existing = await this.prisma.wOAssignment.findFirst({
      where: { tenantId, workOrderId: woId, userId: dto.userId, state: 'ACTIVE' },
    });
    if (existing) return existing; // idempotente

    return this.prisma.wOAssignment.create({
      data: {
        tenantId,
        workOrderId: woId,
        userId: dto.userId,
        role: dto.role,
        state: 'ACTIVE',
      },
    });
  }

  async updateAssignment(woId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const tenantId = this.getTenantId();
    await this.ensureWO(woId, tenantId);
    // opcional: validar que el assignment pertenece al mismo tenant
    return this.prisma.wOAssignment.update({
      where: { id: assignmentId },
      data: { state: dto.state, note: dto.note },
    });
  }

  async startWork(woId: string, dto: StartWorkDto) {
        const tenantId = this.getTenantId();
        const userId = this.getUserId();

        const wo = await this.ensureWO(woId, tenantId);

        // Solo permitir log en ciertos estados
        const ALLOWED: Array<string> = ['OPEN', 'IN_PROGRESS', 'ON_HOLD']; // permitimos ON_HOLD para reanudar
        if (!ALLOWED.includes(wo.status)) {
            throw new Error(`Work Order status ${wo.status} does not allow starting work`);
        }

        // (Opcional) exigir assignment activo
        const assigned = await this.prisma.wOAssignment.findFirst({
            where: { tenantId, workOrderId: woId, userId, state: 'ACTIVE' },
        });
        if (!assigned) throw new Error('User not assigned to this Work Order');

        // Si ya hay abierto aquí → idempotente (a menos que force)
        const openHere = await this.prisma.workLog.findFirst({
            where: { tenantId, workOrderId: woId, userId, endedAt: null },
        });
        if (openHere && !dto.force) return openHere;

        // ¿Tiene abierto en otra OT?
        const openElsewhere = await this.prisma.workLog.findFirst({
            where: { tenantId, userId, endedAt: null, NOT: { workOrderId: woId } },
        });

        return this.prisma.$transaction(async (tx) => {
            // Si hay abierto en otra OT:
            if (openElsewhere) {
            if (!dto.force) {
                throw new Error('User already has an open work log in another Work Order');
            }
            // Cierra el otro y, si quedó sin abiertos, ON_HOLD en esa otra OT
            await tx.workLog.update({
                where: { id: openElsewhere.id },
                data: { endedAt: new Date(), note: dto.note ?? openElsewhere.note },
            });
            await this.holdIfNoOpenLogs(tx, tenantId, openElsewhere.workOrderId);
            }

            // Crear (o recrear) tramo abierto en esta OT
            const created = await tx.workLog.create({
            data: {
                tenantId, workOrderId: woId, userId,
                startedAt: new Date(), note: dto.note, source: 'MANUAL',
            },
            });

            // Si la OT está OPEN u ON_HOLD, súbela a IN_PROGRESS y marca startedAt si no lo tenía
            if (wo.status === 'OPEN' || wo.status === 'ON_HOLD') {
            await tx.workOrder.update({
                where: { id: woId },
                data: {
                status: 'IN_PROGRESS' as any,
                startedAt: wo.startedAt ?? new Date(),
                },
            });

            // Si la OT tiene Notice ligado, opcional: acompasar Notice a IN_PROGRESS
            if (wo.noticeId) {
                await tx.notice.update({
                where: { id: wo.noticeId },
                data: { status: NoticeStatus.IN_PROGRESS },
                });
            }
        }

        return created;
    });
  }

  async pauseWork(woId: string, dto: PauseWorkDto) {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.ensureWO(woId, tenantId);

    const open = await this.prisma.workLog.findFirst({
        where: { tenantId, workOrderId: woId, userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
    });
    if (!open) throw new Error('No open work log');

    return this.prisma.$transaction(async (tx) => {
        const updated = await tx.workLog.update({
        where: { id: open.id },
        data: { endedAt: new Date(), note: dto.note ?? open.note },
        });
        await this.holdIfNoOpenLogs(tx, tenantId, woId);
        return updated;
    });
  }

  async stopWork(woId: string, dto: StopWorkDto) {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.ensureWO(woId, tenantId);

    const open = await this.prisma.workLog.findFirst({
        where: { tenantId, workOrderId: woId, userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
    });

    return this.prisma.$transaction(async (tx) => {
        if (open) {
        const updated = await tx.workLog.update({
            where: { id: open.id },
            data: { endedAt: new Date(), note: dto.note ?? open.note },
        });
        await this.holdIfNoOpenLogs(tx, tenantId, woId);
        return updated;
        }
        // Si no había abierto, puedes: (a) lanzar error; (b) crear burst 0 min; (c) no hacer nada.
        // Mantengo burst 0 min para UX, pero NO cambia estado (seguirá IN_PROGRESS/ON_HOLD según otros usuarios).
        const now = new Date();
        const burst = await tx.workLog.create({
        data: {
            tenantId, workOrderId: woId, userId,
            startedAt: now, endedAt: now, note: dto.note, source: 'MANUAL',
        },
        });
        await this.holdIfNoOpenLogs(tx, tenantId, woId);
        return burst;
    });
  }

  //-----------------
  // --- Resolución ---
async getResolution(woId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);

  const res = await this.prisma.workOrderResolution.findFirst({
    where: { tenantId, workOrderId: woId },
    include: {
      symptomCode: { select: { id: true, code: true, name: true } },
      causeCode:   { select: { id: true, code: true, name: true } },
      remedyCode:  { select: { id: true, code: true, name: true } },
    },
  });

  if (!res) return { workOrderId: woId };

  const label = (obj?: {code:string;name:string}|null, other?: string|null) =>
    obj ? `${obj.code} — ${obj.name}` : (other ?? null);

  return {
    ...res,
    symptomLabel: label(res.symptomCode, res.symptomOther),
    causeLabel:   label(res.causeCode,   res.causeOther),
    remedyLabel:  label(res.remedyCode,  res.remedyOther),
  };
}


async upsertResolution(woId: string, dto: UpsertResolutionDto) {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  await this.ensureWO(woId, tenantId);

  const existing = await this.prisma.workOrderResolution.findFirst({
    where: { tenantId, workOrderId: woId },
  });

  const data = {
    tenantId,
    workOrderId: woId,
    symptomCodeId: dto.symptomCodeId,
    symptomOther: dto.symptomOther,
    causeCodeId: dto.causeCodeId,
    causeOther: dto.causeOther,
    rootCauseText: dto.rootCauseText,
    remedyCodeId: dto.remedyCodeId,
    remedyOther: dto.remedyOther,
    solutionSummary: dto.solutionSummary,
    preventiveRecommendation: dto.preventiveRecommendation,
    resolvedByUserId: userId,
    resolvedAt: new Date(),
  };

  return existing
    ? this.prisma.workOrderResolution.update({ where: { id: existing.id }, data })
    : this.prisma.workOrderResolution.create({ data });
}

// --- Partes ---
async getParts(woId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workOrderPartUsed.findMany({ where: { tenantId, workOrderId: woId }, orderBy: { createdAt: 'desc' } });
}
async addPart(woId: string, dto: CreatePartDto) {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  await this.ensureWO(woId, tenantId);
  const totalCost = dto.unitCost != null ? dto.unitCost * dto.qty : null;
  return this.prisma.workOrderPartUsed.create({
    data: {
      tenantId, workOrderId: woId,
      inventoryItemId: dto.inventoryItemId,
      freeText: dto.freeText,
      qty: dto.qty,
      unitCost: dto.unitCost ?? undefined,
      totalCost: totalCost ?? undefined,
      createdByUserId: userId,
    },
  });
}
async updatePart(woId: string, partId: string, dto: UpdatePartDto) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  const part = await this.prisma.workOrderPartUsed.findFirstOrThrow({ where: { id: partId, tenantId, workOrderId: woId } });
  const unitCost = dto.unitCost ?? part.unitCost ?? null;
  const qty = dto.qty ?? part.qty;
  const totalCost = unitCost != null ? unitCost * qty : null;
  return this.prisma.workOrderPartUsed.update({
    where: { id: partId },
    data: {
      ...(dto.inventoryItemId !== undefined ? { inventoryItemId: dto.inventoryItemId } : {}),
      ...(dto.freeText !== undefined ? { freeText: dto.freeText } : {}),
      ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
      ...(dto.unitCost !== undefined ? { unitCost: dto.unitCost } : {}),
      ...(totalCost != null ? { totalCost } : { totalCost: null }),
    },
  });
}
async deletePart(woId: string, partId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  await this.prisma.workOrderPartUsed.findFirstOrThrow({ where: { id: partId, tenantId, workOrderId: woId } });
  await this.prisma.workOrderPartUsed.delete({ where: { id: partId } });
  return { ok: true };
}

// --- Mediciones ---
async getMeasurements(woId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workMeasurement.findMany({ where: { tenantId, workOrderId: woId }, orderBy: { takenAt: 'desc' } });
}
async addMeasurement(woId: string, dto: CreateMeasurementDto) {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workMeasurement.create({
    data: {
      tenantId, workOrderId: woId,
      type: dto.type,
      valueNumeric: dto.valueNumeric ?? undefined,
      valueText: dto.valueText ?? undefined,
      unit: dto.unit ?? undefined,
      phase: dto.phase ?? 'OTHER',
      takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date(),
      createdByUserId: userId,
    },
  });
}
async updateMeasurement(woId: string, measurementId: string, dto: UpdateMeasurementDto) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  await this.prisma.workMeasurement.findFirstOrThrow({ where: { id: measurementId, tenantId, workOrderId: woId } });
  return this.prisma.workMeasurement.update({
    where: { id: measurementId },
    data: {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.valueNumeric !== undefined ? { valueNumeric: dto.valueNumeric } : {}),
      ...(dto.valueText !== undefined ? { valueText: dto.valueText } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.phase !== undefined ? { phase: dto.phase } : {}),
      ...(dto.takenAt !== undefined ? { takenAt: dto.takenAt ? new Date(dto.takenAt) : new Date() } : {}),
    },
  });
}
async deleteMeasurement(woId: string, measurementId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  await this.prisma.workMeasurement.findFirstOrThrow({ where: { id: measurementId, tenantId, workOrderId: woId } });
  await this.prisma.workMeasurement.delete({ where: { id: measurementId } });
  return { ok: true };
}

// --- Adjuntos ---
async getAttachments(woId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workAttachment.findMany({ where: { tenantId, workOrderId: woId }, orderBy: { createdAt: 'desc' } });
}
async addAttachment(woId: string, dto: CreateAttachmentDto) {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workAttachment.create({
    data: {
      tenantId, workOrderId: woId,
      kind: dto.kind,
      url: dto.url,
      label: dto.label ?? undefined,
      meta: dto.meta ?? undefined,
      uploadedByUserId: userId,
    },
  });
}
async deleteAttachment(woId: string, attachmentId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  await this.prisma.workAttachment.findFirstOrThrow({ where: { id: attachmentId, tenantId, workOrderId: woId } });
  await this.prisma.workAttachment.delete({ where: { id: attachmentId } });
  return { ok: true };
}

// --- Notas ---
async getNotes(woId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workNote.findMany({ where: { tenantId, workOrderId: woId }, orderBy: { addedAt: 'desc' } });
}
async addNote(woId: string, dto: CreateNoteDto) {
  const tenantId = this.getTenantId();
  const userId = this.getUserId();
  await this.ensureWO(woId, tenantId);
  return this.prisma.workNote.create({
    data: { tenantId, workOrderId: woId, note: dto.note, addedByUserId: userId },
  });
}
async deleteNote(woId: string, noteId: string) {
  const tenantId = this.getTenantId();
  await this.ensureWO(woId, tenantId);
  await this.prisma.workNote.findFirstOrThrow({ where: { id: noteId, tenantId, workOrderId: woId } });
  await this.prisma.workNote.delete({ where: { id: noteId } });
  return { ok: true };
}

  
}
