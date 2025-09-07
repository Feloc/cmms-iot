import { Module } from '@nestjs/common';
import { WorkordersController } from './workorders.controller';
import { WorkordersService } from './workorders.service';
import { PrismaService } from '../../prisma.service';

@Module({ controllers: [WorkordersController], providers: [WorkordersService, PrismaService] })
export class WorkordersModule {}
