import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: process.env.DEMO_TENANT || 'acme' },
    update: {},
    create: { slug: process.env.DEMO_TENANT || 'acme', name: 'Acme Corp' },
  });

  const password = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD || 'admin123', 10);

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local',
      password,
      role: Role.ADMIN,
      name: 'Admin'
    },
  });

  await prisma.asset.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'pump-001' } },
    update: {},
    create: { tenantId: tenant.id, code: 'pump-001', name: 'Bomba Principal', location: 'Planta A' },
  });

  // Regla THRESHOLD: temp > 80
  await prisma.rule.create({
    data: {
      tenantId: tenant.id, assetCode: 'pump-001', sensor: 'temp', type: 'THRESHOLD', operator: '>', value: 80,
      enabled: true
    }
  });

  // Regla ROC: delta temp en 60s > 15
  await prisma.rule.create({
    data: {
      tenantId: tenant.id, assetCode: 'pump-001', sensor: 'temp', type: 'ROC', windowSec: 60, rocValue: 15, enabled: true
    }
  });

  console.log('Seed listo. Tenant acme, usuario admin@acme.local / admin123');
}

main().finally(() => prisma.$disconnect());
