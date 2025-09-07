import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma.service';

@Module({
  imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET || 'dev', signOptions: { expiresIn: '2d' } })],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
  exports: [AuthService]
})
export class AuthModule {}
