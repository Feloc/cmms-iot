import { PrismaClient, MeasurementPhase, AttachmentKind, NoticeStatus, WorkOrderStatus, WorkOrderPriority, AssignmentRole, AssignmentState, WorkLogSource } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// bcrypt de "admin123"
const HASH = '$2b$10$3ED7iJYMGa3FvC/UWxiF1OdIVT1TnN.AAj/3rZ8CGvgnPPg6z9LOq';

async function main() {
   // Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: { slug: 'acme', name: 'Acme Corp' },
  });

  const password = await bcrypt.hash(process.env.DEMO_TECH_PASSWORD || 'tech123', 10);  

  // Usuarios
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local' } },
    update: {},
    create: {  email: 'admin@acme.local', password: HASH, name: 'Admin', role: 'ADMIN', tenantId: tenant.id  },
  });
  const tech = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'tech@acme.local' } },
    update: {},
    create: { email: 'tech1@acme.local', password: password, name: 'Técnico Demo', role: 'TECH', tenantId: tenant.id },
  });

  // Asset demo
  await prisma.asset.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'pump-001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'pump-001',
      name: 'Bomba Centrífuga 001',
      location: 'Planta A / Línea 1',
    },
  });

  // Catálogos
  const vib = await prisma.symptomCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'VIB' } },
    update: {},
    create: { tenantId: tenant.id, code: 'VIB', name: 'Vibración alta' },
  });
  const leak = await prisma.symptomCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'LEAK' } },
    update: {},
    create: { tenantId: tenant.id, code: 'LEAK', name: 'Fuga' },
  });

  const misalign = await prisma.causeCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MISALIGN' } },
    update: {},
    create: { tenantId: tenant.id, code: 'MISALIGN', name: 'Desalineación' },
  });
  const wornBearing = await prisma.causeCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'BEAR_WORN' } },
    update: {},
    create: { tenantId: tenant.id, code: 'BEAR_WORN', name: 'Rodamiento desgastado' },
  });

  const align = await prisma.remedyCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ALIGN' } },
    update: {},
    create: { tenantId: tenant.id, code: 'ALIGN', name: 'Alinear acople' },
  });
  const replaceBearing = await prisma.remedyCode.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'RB-6204' } },
    update: {},
    create: { tenantId: tenant.id, code: 'RB-6204', name: 'Reemplazar rodamiento 6204' },
  });

  // Notice OPEN
  const notice = await prisma.notice.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: admin.id,
      source: 'MANUAL',
      assetCode: 'pump-001',
      title: 'Vibración inusual en bomba 001',
      body: 'Se detecta vibración por encima del umbral durante operación.',
      category: 'INCIDENT',
      severity: 'MEDIUM',
      status: NoticeStatus.OPEN,
      tags: ['bomba', 'vibración'],
    },
  });

  // Work Order desde el Notice (queda OPEN por ahora)
  const wo = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      noticeId: notice.id,
      assetCode: notice.assetCode,
      title: `OT: ${notice.title}`,
      description: notice.body ?? undefined,
      priority: WorkOrderPriority.MEDIUM,
      status: WorkOrderStatus.OPEN,
      dueDate: new Date(Date.now() + 72 * 3600 * 1000),
    },
  });

  // Asignación del técnico
  await prisma.wOAssignment.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      userId: tech.id,
      role: AssignmentRole.TECHNICIAN,
      state: AssignmentState.ACTIVE,
    },
  });

  // Resolución parcial (síntoma ya identificado)
  await prisma.workOrderResolution.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      symptomCodeId: vib.id,
      solutionSummary: 'Se detectó vibración elevada. Pendiente diagnóstico de causa.',
    },
  });

  // Partes (una línea con costo)
  await prisma.workOrderPartUsed.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      freeText: 'Rodamiento 6204',
      qty: 1,
      unitCost: 12.5,
      totalCost: 12.5,
      createdByUserId: admin.id,
    },
  });

  // Mediciones (antes / después)
  await prisma.workMeasurement.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      type: 'Vibración RMS',
      valueNumeric: 12.3,
      unit: 'mm/s',
      phase: MeasurementPhase.BEFORE,
      takenAt: new Date(Date.now() - 3600 * 1000),
      createdByUserId: admin.id,
    },
  });
  await prisma.workMeasurement.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      type: 'Temperatura cojinete',
      valueNumeric: 78.5,
      unit: '°C',
      phase: MeasurementPhase.BEFORE,
      takenAt: new Date(Date.now() - 1800 * 1000),
      createdByUserId: admin.id,
    },
  });

  // Adjunto
  await prisma.workAttachment.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      kind: AttachmentKind.PHOTO,
      url: 'https://picsum.photos/seed/cmms-vib/800/450',
      label: 'Foto diagnóstico',
      uploadedByUserId: admin.id,
    },
  });

  // Nota técnica
  await prisma.workNote.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      note: 'Se programa alineación láser para turno tarde.',
      addedByUserId: admin.id,
    },
  });

  // Log de trabajo ABIERTO del técnico (para que la OT aparezca IN_PROGRESS cuando pulses “Iniciar”)
  // Si ya tienes la lógica que sube a IN_PROGRESS al iniciar, puedes crear el log abierto directamente:
  await prisma.workLog.create({
    data: {
      tenantId: tenant.id,
      workOrderId: wo.id,
      userId: tech.id,
      source: WorkLogSource.MANUAL,
      note: 'Inicio de diagnóstico',
      startedAt: new Date(Date.now() - 15 * 60 * 1000), // hace 15 min
      endedAt: null,
    },
  });

  console.log('Seed listo:', {
    tenant: tenant.slug,
    admin: admin.email,
    tech: tech.email,
    noticeId: notice.id,
    workOrderId: wo.id,
  });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
