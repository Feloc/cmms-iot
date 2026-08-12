import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import express from 'express';
import { tenantStorage } from './common/tenant-context';
import { PrismaService } from './prisma.service';
import { seedPlatform } from './seed/platform.seed';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const prisma = app.get(PrismaService);
  await prisma.$connect();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
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
  app.enableCors({
    // El navegador accede por el proxy same-origin de Next.js. Sólo habilitar
    // acceso cross-origin directo cuando se configure una lista explícita.
    origin: origins.length ? origins : false,
    credentials: true,
    exposedHeaders: ['Content-Length', 'Content-Type', 'Content-Disposition'],
  });

  app.use(cookieParser());
  // ===== TENANT/USER CONTEXT MIDDLEWARE =====
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    tenantStorage.run({}, () => next());
  });

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 3001;
  await app.listen(port);
}
bootstrap();
