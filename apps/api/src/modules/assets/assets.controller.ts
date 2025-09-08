import { Controller, Get, Post, Put, Delete, Body, Param /*, UseGuards*/ } from '@nestjs/common';
import { AssetsService, CreateAssetDto, UpdateAssetDto } from './assets.service';
// Si tienes guardia JWT en modules/auth:
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('assets')
// @UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get() findAll() { return this.assets.findAll(); }

  @Post() create(@Body() dto: CreateAssetDto) { return this.assets.create(dto); }

  @Put(':id') update(@Param('id') id: string, @Body() dto: UpdateAssetDto) { return this.assets.update(id, dto); }

  @Delete(':id') remove(@Param('id') id: string) { return this.assets.remove(id); }
}
