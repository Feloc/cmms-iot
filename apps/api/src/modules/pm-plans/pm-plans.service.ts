import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';
import { CreatePmPlanDto } from './dto/create-pm-plan.dto';
import { UpdatePmPlanDto } from './dto/update-pm-plan.dto';

@Injectable()
export class PmPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private getTenantId(): string {
    const ctx = tenantStorage.getStore();
    const tenantId = ctx?.tenantId;
    if (!tenantId) throw new BadRequestException('Missing tenant');
    return tenantId;
  }

  async list(includeInactive = false) {
    const tenantId = this.getTenantId();
    return this.prisma.pmPlan.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { active: true }),
      },
      orderBy: [{ intervalHours: 'asc' }, { name: 'asc' }],
    });
  }

  async getOne(id: string) {
    const tenantId = this.getTenantId();
    const plan = await this.prisma.pmPlan.findFirst({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException('PM plan not found');
    return plan;
  }

  async create(dto: CreatePmPlanDto) {
    const tenantId = this.getTenantId();

    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('name is required');

    const intervalHours = Number(dto.intervalHours);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      throw new BadRequestException('intervalHours must be a positive number');
    }

    const defaultDurationMin =
      dto.defaultDurationMin === undefined || dto.defaultDurationMin === null
        ? 60
        : Math.max(15, Math.round(Number(dto.defaultDurationMin)));

    return this.prisma.pmPlan.create({
      data: {
        tenantId,
        name,
        intervalHours: Math.round(intervalHours),
        description: dto.description ?? null,
        defaultDurationMin,
        checklist: (dto.checklist as any) ?? null,
        active: dto.active ?? true,
      } as any,
    });
  }

  async update(id: string, dto: UpdatePmPlanDto) {
    const tenantId = this.getTenantId();
    await this.getOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description ?? null;

    if (dto.intervalHours !== undefined) {
      const intervalHours = Number(dto.intervalHours);
      if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
        throw new BadRequestException('intervalHours must be a positive number');
      }
      data.intervalHours = Math.round(intervalHours);
    }

    if (dto.defaultDurationMin !== undefined) {
      if (dto.defaultDurationMin === null) data.defaultDurationMin = 60;
      else {
        const n = Number(dto.defaultDurationMin);
        if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('defaultDurationMin must be positive');
        data.defaultDurationMin = Math.max(15, Math.round(n));
      }
    }

    if (dto.checklist !== undefined) data.checklist = (dto.checklist as any) ?? null;
    if (dto.active !== undefined) data.active = !!dto.active;

    return this.prisma.pmPlan.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.getOne(id);
    return this.prisma.pmPlan.update({
      where: { id },
      data: { active: false },
    });
  }
}
