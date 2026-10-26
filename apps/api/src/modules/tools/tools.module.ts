import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

@Module({ controllers: [ToolsController], providers: [ToolsService, PrismaService] })
export class ToolsModule {}
