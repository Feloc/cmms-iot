import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    // Prisma 6 ya no soporta $use (middlewares).
    // La lógica multi-tenant la aplicamos en servicios/controladores.
  }
}
