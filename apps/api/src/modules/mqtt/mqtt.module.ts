import { Module, forwardRef } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { RulesModule } from '../rules/rules.module';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [
    forwardRef(() => RulesModule), // solo aquí usamos forwardRef en el módulo
  ],
  providers: [MqttService, PrismaService],
  exports: [MqttService],
})
export class MqttModule {}
