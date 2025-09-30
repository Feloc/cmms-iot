// apps/api/src/prisma.tenant-mw.ts
import { Prisma } from '@prisma/client';

export function withTenant<R>(prisma: any, tenantId: string, fn: () => Promise<R>) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(); // aquí haces tus tx.$queryRaw a v_telemetry(_5m) o Prisma models
  });
}
