import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EngineeringController } from './engineering.controller';
import { EngineeringService } from './engineering.service';
import { ManufacturingModule } from '../manufacturing/manufacturing.module';

@Module({ imports: [ManufacturingModule], controllers: [EngineeringController], providers: [EngineeringService, PrismaService] })
export class EngineeringModule {}
