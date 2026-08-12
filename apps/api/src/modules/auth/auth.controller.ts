import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException, UsePipes, ValidationPipe } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/auth/public.decorator';
import { LoginDto } from './dto/login.dto';
import { tenantStorage } from '../../common/tenant-context';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  login(@Body() body: LoginDto) {
    return this.auth.validate(body.tenant, body.email, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    const { userId, tenantId } = tenantStorage.getStore() || {};
    if (!userId || !tenantId) throw new UnauthorizedException();
    return this.auth.revoke(userId, tenantId);
  }
}
