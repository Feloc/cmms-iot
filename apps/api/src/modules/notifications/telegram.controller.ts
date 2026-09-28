import { ConflictException, Body, Controller, Delete, Get, Headers, HttpCode, Patch, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Public } from '../../common/auth/public.decorator';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { telegramReceiveMode } from './telegram.config';
import { TelegramService, verifyTelegramSecret } from './telegram.service';
import { TelegramMessageDto, TelegramPreferencesDto } from './telegram.dto';

@Controller('telegram')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TelegramController {
  constructor(private readonly service: TelegramService) {}
  @Get('me') me() { return this.service.me(); }
  @Post('link') link() { return this.service.link(); }
  @Patch('me') preferences(@Body() dto: TelegramPreferencesDto) { return this.service.preferences(dto); }
  @Delete('me') disconnect() { return this.service.disconnect(); }
  @Get('history') history() { return this.service.history(false); }
  @Get('recipients') @UseGuards(TenantAdminGuard) recipients() { return this.service.recipients(); }
  @Post('messages') @UseGuards(TenantAdminGuard) manual(@Body() dto: TelegramMessageDto) { return this.service.manual(dto); }
  @Get('messages') @UseGuards(TenantAdminGuard) allHistory() { return this.service.history(true); }
  @Public() @Post('webhook') @HttpCode(200)
  webhook(@Headers('x-telegram-bot-api-secret-token') secret: string, @Body() body: unknown) {
    if (telegramReceiveMode() === 'polling') throw new ConflictException('La recepción está configurada mediante polling');
    verifyTelegramSecret(secret);
    return this.service.webhook(body);
  }
}
