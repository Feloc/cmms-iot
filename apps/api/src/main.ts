import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { tenantStorage } from './common/tenant-context';
import { PrismaService } from './prisma.service';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  // Usamos CORS nativo de Nest; desactivamos el flag de factory
  const app = await NestFactory.create(AppModule, { cors: false });
  const prisma = app.get(PrismaService);
  await prisma.$connect();

  // CORS configurable por env (CORS_ORIGINS="http://localhost:3000,https://foo.bar")
  const origins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  app.use(cookieParser());

  const jwt = app.get(JwtService);

  // Middleware tipado: fija tenant en AsyncLocalStorage desde header o JWT
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    const hdr = req.headers as Record<string, string | string[] | undefined>;
    const headerTenant =
      hdr['x-tenant'] ??
      hdr['x-tenant-id'] ??
      hdr['x_org'] ??
      hdr['x-org'];

    let tenantId: string | undefined;
    let userId: string | undefined;

    if (headerTenant) {
      const slug = Array.isArray(headerTenant)
        ? String(headerTenant[0])
        : String(headerTenant);
      const t = await prisma.tenant.findUnique({ where: { slug } });
      tenantId = t?.id;
    }
    
    if (hdr.authorization && typeof hdr.authorization === 'string' && hdr.authorization.startsWith('Bearer ')) {
      try {
        const token = hdr.authorization.substring(7);
        const decoded = jwt.decode(token) as null | string | { [k: string]: any };
        if (decoded && typeof decoded === 'object') {
          tenantId = tenantId ?? (decoded.tenantId as string | undefined);
          userId = decoded.sub as string | undefined;  // típico campo userId
        }
      } catch {
        // no-op: si el token no se puede decodificar, seguimos sin tenantId
      }
    }

    tenantStorage.run({ tenantId, userId }, () => next());
  });

  // Graceful shutdown (sin $on('beforeExit'))
  const shutdown = async () => {
    try { await prisma.$disconnect(); } catch {}
    try { await app.close(); } catch {}
  };
  process.on('SIGINT', async () => { await shutdown(); process.exit(0); });
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0); });

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
}
bootstrap();
