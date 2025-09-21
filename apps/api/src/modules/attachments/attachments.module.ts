import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentsRepository } from './attachments.repository';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsRepository, PrismaService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
//