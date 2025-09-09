import { Body, Controller, Delete, Get, Param, Post, Put, UsePipes, ValidationPipe } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Controller('assets')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  findAll() {
    return this.assets.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assets.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.assets.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assets.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assets.remove(id);
  }
}
