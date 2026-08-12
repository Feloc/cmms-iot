import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/public.decorator';

@Controller()
export class AppController {
  @Get('health')
  @Public()
  health() {
    return {
      ok: true,
      service: 'api',
      timestamp: new Date().toISOString(),
    };
  }
}
