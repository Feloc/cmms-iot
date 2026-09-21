import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EngineeringController } from './engineering.controller';
import { EngineeringService } from './engineering.service';

@Module({ controllers: [EngineeringController], providers: [EngineeringService, PrismaService] })
export class EngineeringModule {}
