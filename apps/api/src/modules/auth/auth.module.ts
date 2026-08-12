import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../../prisma.service';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginAttemptsService } from './login-attempts.service';

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-secret');
if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio en producción');

@Module({
  imports: [JwtModule.register({ global: true, secret: jwtSecret, signOptions: { expiresIn: '12h' } })],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginAttemptsService,
    PrismaService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [AuthService]
})
export class AuthModule {}
