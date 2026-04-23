import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { getTenant } from '../../common/tenant-context';
import type { Response } from 'express';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  private async sendSummaryPdf(
    payload: {
      days?: string | number;
      from?: string;
      to?: string;
      tab?: string;
      sections?: string;
      selectedTechId?: string;
      selectedNegotiationMonth?: string;
      opDim?: string;
      opMetric?: string;
      opSegment?: string;
      chartImages?: Record<string, string[]>;
    },
    res: Response,
  ) {
    const tenantId = getTenant();
    if (!tenantId) {
      res.status(400).send('No tenant in context');
      return;
    }

    const parsedDays = payload.days == null ? undefined : Number(payload.days);
    const file = await this.svc.exportSummaryPdf({
      tenantId,
      days: Number.isFinite(parsedDays) ? parsedDays : undefined,
      from: payload.from,
      to: payload.to,
      tab: payload.tab,
      sections: payload.sections,
      selectedTechId: payload.selectedTechId,
      selectedNegotiationMonth: payload.selectedNegotiationMonth,
      opDim: payload.opDim,
      opMetric: payload.opMetric,
      opSegment: payload.opSegment,
      chartImages: payload.chartImages,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  }

  @Get('scheduled-negotiation-months')
  async scheduledNegotiationMonths() {
    const tenantId = getTenant();
    if (!tenantId) return [];
    return this.svc.scheduledNegotiationMonths({ tenantId });
  }

  @Get('summary')
  async summary(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const tenantId = getTenant();
    if (!tenantId) {
      return {
        range: null,
        assets: null,
        service: null,
        alerts: null,
      };
    }

    const parsedDays = days ? Number(days) : undefined;
    return this.svc.summary({
      tenantId,
      days: Number.isFinite(parsedDays) ? parsedDays : undefined,
      from,
      to,
    });
  }

  @Get('summary/pdf')
  async summaryPdf(
    @Query('days') days: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('tab') tab: string | undefined,
    @Query('sections') sections: string | undefined,
    @Query('selectedTechId') selectedTechId: string | undefined,
    @Query('selectedNegotiationMonth') selectedNegotiationMonth: string | undefined,
    @Query('opDim') opDim: string | undefined,
    @Query('opMetric') opMetric: string | undefined,
    @Query('opSegment') opSegment: string | undefined,
    @Res() res: Response,
  ) {
    return this.sendSummaryPdf(
      {
        days,
        from,
        to,
        tab,
        sections,
        selectedTechId,
        selectedNegotiationMonth,
        opDim,
        opMetric,
        opSegment,
      },
      res,
    );
  }

  @Post('summary/pdf')
  async summaryPdfPost(
    @Body()
    body: {
      days?: string | number;
      from?: string;
      to?: string;
      tab?: string;
      sections?: string;
      selectedTechId?: string;
      selectedNegotiationMonth?: string;
      opDim?: string;
      opMetric?: string;
      opSegment?: string;
      chartImages?: Record<string, string[]>;
    },
    @Res() res: Response,
  ) {
    return this.sendSummaryPdf(body ?? {}, res);
  }
}
