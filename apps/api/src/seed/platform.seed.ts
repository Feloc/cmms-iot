import * as bcrypt from 'bcrypt';

/**
 * Seed idempotente para:
 * - crear tenant "platform" (o el slug definido en PLATFORM_TENANT_SLUG)
 * - crear el primer usuario ADMIN dentro de ese tenant
 *
 * Controlado por env:
 * - AUTO_SEED=true (lo llama main.ts)
 * - PLATFORM_TENANT_SLUG=platform
 * - PLATFORM_ADMIN_EMAIL=platform@local
 * - PLATFORM_ADMIN_PASSWORD=admin123 (cámbialo en prod)
 * - PLATFORM_ADMIN_NAME=Platform Admin
 */
export async function seedPlatform(prisma: any) {
  const platformSlug = (process.env.PLATFORM_TENANT_SLUG || 'platform').trim().toLowerCase();

  const adminEmail = (process.env.PLATFORM_ADMIN_EMAIL || 'platform-admin@local').trim().toLowerCase();
  const adminName = (process.env.PLATFORM_ADMIN_NAME || 'Platform Admin').trim();
  const adminPassword = String(process.env.PLATFORM_ADMIN_PASSWORD || 'admin123');

  if (!process.env.PLATFORM_ADMIN_PASSWORD) {
    // En dev está bien, en prod NO.
    // eslint-disable-next-line no-console
    console.warn('[seed] PLATFORM_ADMIN_PASSWORD no definido. Usando default "admin123" (solo dev).');
  }

  // 1) Tenant platform
  let tenant = await prisma.tenant.findFirst({
    where: { slug: platformSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { slug: platformSlug, name: 'Platform' },
      select: { id: true, slug: true, name: true },
    });
    // eslint-disable-next-line no-console
    console.log(`[seed] Tenant creado: ${tenant.slug} (${tenant.id})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed] Tenant existe: ${tenant.slug} (${tenant.id})`);
  }

  // 2) Usuario admin inicial
  const existingAdmin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: adminEmail },
    select: { id: true, email: true, role: true },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const created = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        name: adminName,
        role: 'ADMIN',
        password: passwordHash,
      },
      select: { id: true, email: true, role: true },
    });

    // eslint-disable-next-line no-console
    console.log(`[seed] Admin creado: ${created.email} (role=${created.role})`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed] Admin existe: ${existingAdmin.email} (role=${existingAdmin.role})`);
  }
}
