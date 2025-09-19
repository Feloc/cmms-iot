import { Controller, Get, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('symptom-codes')
  listSymptoms(
    @Query('q') q?: string,
    @Query('assetType') assetType?: string,
    @Query('limit') limit = '20',
  ) {
    return this.service.listSymptomCodes({ q, assetType, limit: Number(limit) || 20 });
  }

  @Get('cause-codes')
  listCauses(
    @Query('q') q?: string,
    @Query('assetType') assetType?: string,
    @Query('limit') limit = '20',
  ) {
    return this.service.listCauseCodes({ q, assetType, limit: Number(limit) || 20 });
  }

  @Get('remedy-codes')
  listRemedies(
    @Query('q') q?: string,
    @Query('assetType') assetType?: string,
    @Query('limit') limit = '20',
  ) {
    return this.service.listRemedyCodes({ q, assetType, limit: Number(limit) || 20 });
  }
}
