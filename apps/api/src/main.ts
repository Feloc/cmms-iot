import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { tenantStorage } from './common/tenant-context';
import { PrismaService } from './prisma.service';
import { seedPlatform } from './seed/platform.seed';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const prisma = app.get(PrismaService);
  await prisma.$connect();
  
// Seed automático (idempotente). Útil para bootstrap de platform tenant.
// Activar con: AUTO_SEED=true
if (String(process.env.AUTO_SEED || '').toLowerCase() === 'true') {
  await seedPlatform(prisma);
}
// CORS: permitir headers personalizados y credenciales
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true, exposedHeaders: ['Content-Length','Content-Type'] });

  app.use(cookieParser());
  const jwt = app.get(JwtService);

  // ===== TENANT/USER CONTEXT MIDDLEWARE =====
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const hdr = req.headers as Record<string, string | string[] | undefined>;
    const qs  = (req.query || {}) as Record<string, string | string[] | undefined>;

    // 1) Intentar por headers comunes
    let headerTenant =
      hdr['x-tenant'] ??
      hdr['x-tenant-id'] ??
      hdr['x_org'] ??
      hdr['x-org'];

    // 2) Si no vino por header (caso <img>/<a>), aceptar por query param
    if (!headerTenant) {
      headerTenant = qs['x-tenant'] ?? qs['tenant'] ?? qs['x-tenant-id'] ?? undefined;
    }

    let tenantId: string | undefined;
    let userId: string | undefined;

    if (headerTenant) {
      const slug = Array.isArray(headerTenant) ? String(headerTenant[0]) : String(headerTenant);
      try {
        const t = await prisma.tenant.findUnique({ where: { slug } });
        tenantId = t?.id;
      } catch {
        // noop
      }
    }

    // 3) Intentar leer tenantId también del JWT si existe
    if (hdr.authorization && typeof hdr.authorization === 'string' && hdr.authorization.startsWith('Bearer ')) {
      try {
        const token = hdr.authorization.substring(7);
        const decoded = jwt.decode(token) as null | string | { [k: string]: any };
        if (decoded && typeof decoded === 'object') {
          tenantId = tenantId ?? (decoded.tenantId as string | undefined);
          userId = decoded.sub as string | undefined;
        }
      } catch {
        // noop
      }
    }

    tenantStorage.run({ tenantId, userId }, () => next());
  });

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
}
bootstrap();
