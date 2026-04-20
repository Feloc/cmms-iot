import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ListTenantsQuery } from './dto/list-tenants.query';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { UpdateTenantBrandingDto } from './dto/update-tenant-branding.dto';

const DASHBOARD_DAY_DEFS = [
  {
    label: 'Lunes',
    enabledField: 'dashboardWorkMonday',
    startField: 'dashboardWorkMondayStartTime',
    endField: 'dashboardWorkMondayEndTime',
    mealField: 'dashboardWorkMondayMealBreakMinutes',
  },
  {
    label: 'Martes',
    enabledField: 'dashboardWorkTuesday',
    startField: 'dashboardWorkTuesdayStartTime',
    endField: 'dashboardWorkTuesdayEndTime',
    mealField: 'dashboardWorkTuesdayMealBreakMinutes',
  },
  {
    label: 'Miercoles',
    enabledField: 'dashboardWorkWednesday',
    startField: 'dashboardWorkWednesdayStartTime',
    endField: 'dashboardWorkWednesdayEndTime',
    mealField: 'dashboardWorkWednesdayMealBreakMinutes',
  },
  {
    label: 'Jueves',
    enabledField: 'dashboardWorkThursday',
    startField: 'dashboardWorkThursdayStartTime',
    endField: 'dashboardWorkThursdayEndTime',
    mealField: 'dashboardWorkThursdayMealBreakMinutes',
  },
  {
    label: 'Viernes',
    enabledField: 'dashboardWorkFriday',
    startField: 'dashboardWorkFridayStartTime',
    endField: 'dashboardWorkFridayEndTime',
    mealField: 'dashboardWorkFridayMealBreakMinutes',
  },
  {
    label: 'Sabado',
    enabledField: 'dashboardWorkSaturday',
    startField: 'dashboardWorkSaturdayStartTime',
    endField: 'dashboardWorkSaturdayEndTime',
    mealField: 'dashboardWorkSaturdayMealBreakMinutes',
  },
  {
    label: 'Domingo',
    enabledField: 'dashboardWorkSunday',
    startField: 'dashboardWorkSundayStartTime',
    endField: 'dashboardWorkSundayEndTime',
    mealField: 'dashboardWorkSundayMealBreakMinutes',
  },
] as const;

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  private readonly brandingSelect = {
    id: true,
    slug: true,
    name: true,
    legalName: true,
    taxId: true,
    address: true,
    phone: true,
    email: true,
    website: true,
    logoUrl: true,
    dashboardWorkHoursPerDay: true,
    dashboardWorkMonday: true,
    dashboardWorkMondayStartTime: true,
    dashboardWorkMondayEndTime: true,
    dashboardWorkMondayMealBreakMinutes: true,
    dashboardWorkTuesday: true,
    dashboardWorkTuesdayStartTime: true,
    dashboardWorkTuesdayEndTime: true,
    dashboardWorkTuesdayMealBreakMinutes: true,
    dashboardWorkWednesday: true,
    dashboardWorkWednesdayStartTime: true,
    dashboardWorkWednesdayEndTime: true,
    dashboardWorkWednesdayMealBreakMinutes: true,
    dashboardWorkThursday: true,
    dashboardWorkThursdayStartTime: true,
    dashboardWorkThursdayEndTime: true,
    dashboardWorkThursdayMealBreakMinutes: true,
    dashboardWorkFriday: true,
    dashboardWorkFridayStartTime: true,
    dashboardWorkFridayEndTime: true,
    dashboardWorkFridayMealBreakMinutes: true,
    dashboardWorkSaturday: true,
    dashboardWorkSaturdayStartTime: true,
    dashboardWorkSaturdayEndTime: true,
    dashboardWorkSaturdayMealBreakMinutes: true,
    dashboardWorkSunday: true,
    dashboardWorkSundayStartTime: true,
    dashboardWorkSundayEndTime: true,
    dashboardWorkSundayMealBreakMinutes: true,
    dashboardExcludeNonWorkingDates: true,
    dashboardNonWorkingDates: true,
    updatedAt: true,
  } as const;

  private toNullableTrimmed(value?: string | null) {
    const s = String(value ?? '').trim();
    return s ? s : null;
  }

  private toWorkHoursPerDay(value?: number | null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 24) {
      throw new BadRequestException('Las horas laborales por dia deben ser un numero entre 0.25 y 24.');
    }
    return Math.round(n * 100) / 100;
  }

  private normalizeClock(value: unknown, label: string) {
    const s = String(value ?? '').trim();
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
    if (!match) {
      throw new BadRequestException(`${label}: el formato debe ser HH:MM.`);
    }
    return `${match[1]}:${match[2]}`;
  }

  private clockToMinutes(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private toMealBreakMinutes(value: unknown, label: string) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 600) {
      throw new BadRequestException(`${label}: debe ser un numero entre 0 y 600 minutos.`);
    }
    return Math.trunc(n);
  }

  private normalizeNonWorkingDates(value: unknown) {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException('Las fechas no laboradas deben enviarse como una lista.');
    }

    const normalized = Array.from(
      new Set(
        value
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
          .map((item) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(item)) {
              throw new BadRequestException(`Fecha no laborada invalida: ${item}. Usa el formato YYYY-MM-DD.`);
            }
            return item;
          }),
      ),
    ).sort();

    if (normalized.length > 366) {
      throw new BadRequestException('No se permiten mas de 366 fechas no laboradas configuradas.');
    }

    return normalized;
  }

  async list(q: ListTenantsQuery) {
    const page = Math.max(1, Number(q.page ?? 1));
    const size = Math.min(100, Math.max(1, Number(q.size ?? 20)));
    const skip = (page - 1) * size;

    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { slug: { contains: q.q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
        select: { id: true, name: true, slug: true, createdAt: true },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { items, total, page, size };
  }

  async create(dto: CreateTenantDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const exists = await this.prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (exists) throw new BadRequestException('Ya existe un tenant con ese slug.');

    return this.prisma.tenant.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true, createdAt: true },
    });
  }

  async provision(dto: ProvisionTenantDto) {
    const name = dto.name.trim();
    const slug = dto.slug.trim().toLowerCase();

    const adminName = dto.adminName.trim();
    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const adminPassword = dto.adminPassword;

    const exists = await this.prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
    if (exists) throw new BadRequestException('Ya existe un tenant con ese slug.');

    const passwordHash = await bcrypt.hash(adminPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name, slug },
        select: { id: true, name: true, slug: true, createdAt: true },
      });

      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: adminName,
          email: adminEmail,
          role: 'ADMIN',
          password: passwordHash,
        } as any,
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      return { tenant, admin };
    });
  }

  async getBranding(tenantId: string) {
    return this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: this.brandingSelect,
    });
  }

  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto) {
    const data: Record<string, string | number | boolean | string[] | null> = {};

    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: this.brandingSelect,
    });

    if (!current) throw new BadRequestException('Tenant no encontrado.');

    if (dto.legalName !== undefined) data.legalName = this.toNullableTrimmed(dto.legalName);
    if (dto.taxId !== undefined) data.taxId = this.toNullableTrimmed(dto.taxId);
    if (dto.address !== undefined) data.address = this.toNullableTrimmed(dto.address);
    if (dto.phone !== undefined) data.phone = this.toNullableTrimmed(dto.phone);
    if (dto.email !== undefined) data.email = this.toNullableTrimmed(dto.email);
    if (dto.website !== undefined) data.website = this.toNullableTrimmed(dto.website);
    if (dto.logoUrl !== undefined) data.logoUrl = this.toNullableTrimmed(dto.logoUrl);
    if (dto.dashboardExcludeNonWorkingDates !== undefined) {
      data.dashboardExcludeNonWorkingDates = dto.dashboardExcludeNonWorkingDates;
    }
    if (dto.dashboardNonWorkingDates !== undefined) {
      data.dashboardNonWorkingDates = this.normalizeNonWorkingDates(dto.dashboardNonWorkingDates);
    }

    let activeDays = 0;
    let totalHoursPerDay = 0;

    for (const day of DASHBOARD_DAY_DEFS) {
      const enabled = Boolean((dto as any)[day.enabledField] ?? (current as any)[day.enabledField]);
      const startTime = this.normalizeClock((dto as any)[day.startField] ?? (current as any)[day.startField] ?? '08:00', `${day.label} inicio`);
      const endTime = this.normalizeClock((dto as any)[day.endField] ?? (current as any)[day.endField] ?? '17:00', `${day.label} fin`);
      const mealBreakMinutes = this.toMealBreakMinutes(
        (dto as any)[day.mealField] ?? (current as any)[day.mealField] ?? 60,
        `${day.label} alimentacion`,
      );

      data[day.enabledField] = enabled;
      data[day.startField] = startTime;
      data[day.endField] = endTime;
      data[day.mealField] = mealBreakMinutes;

      if (!enabled) continue;

      activeDays += 1;
      const workingMinutes = this.clockToMinutes(endTime) - this.clockToMinutes(startTime) - mealBreakMinutes;
      if (workingMinutes <= 0) {
        throw new BadRequestException(
          `${day.label}: la hora fin debe ser mayor a la hora inicio y al tiempo de alimentacion.`,
        );
      }
      totalHoursPerDay += workingMinutes / 60;
    }

    if (!activeDays) {
      throw new BadRequestException('Debes seleccionar al menos un dia laboral para el dashboard.');
    }

    data.dashboardWorkHoursPerDay =
      dto.dashboardWorkHoursPerDay !== undefined
        ? this.toWorkHoursPerDay(dto.dashboardWorkHoursPerDay)
        : this.toWorkHoursPerDay(totalHoursPerDay / activeDays);

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: this.brandingSelect,
    });
  }
}
