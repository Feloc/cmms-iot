import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';


const prisma = new PrismaClient();

async function main() {
  // Asegurar tenant "acme"
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      slug: 'acme',
      name: 'Acme Corp',
    },
  });

  const password = await bcrypt.hash(process.env.DEMO_ADMIN_PASSWORD || 'admin123', 10);

/*   // Admin ya debería existir (admin@acme.local)
  const admin = await prisma.user.upsert({
    where: {  tenantId_email: { tenantId: tenant.id, email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local' } },
    update: {},
    create: {
      email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local',
      password, // "admin123" bcrypt
      name: 'Admin',
      role: Role.ADMIN,
      tenantId: tenant.id,
    },
  });
 */
  // 👷 Técnico demo
  const tech = await prisma.user.upsert({
    where: {  tenantId_email: { tenantId: tenant.id, email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local' } },
    update: {},
    create: {
      email: process.env.DEMO_ADMIN_EMAIL || 'admin@acme.local',
      password, // "admin123"
      name: 'Técnico Demo',
      role: Role.TECH,
      tenantId: tenant.id,
    },
  });

  console.log('Seed listo:', { tenant, /* admin, */ tech });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
