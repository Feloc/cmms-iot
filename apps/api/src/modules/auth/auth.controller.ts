import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() body: { tenant: string; email: string; password: string }) {
    return this.auth.validate(body.tenant, body.email, body.password);
  }
}
