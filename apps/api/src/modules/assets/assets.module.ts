import { Module } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';
import { PrismaService } from '../../prisma.service';

@Module({ controllers: [AssetsController], providers: [AssetsService, PrismaService], exports: [AssetsService] })
export class AssetsModule {}
