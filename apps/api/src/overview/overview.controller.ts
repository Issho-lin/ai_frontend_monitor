import { Controller, Get, Query } from '@nestjs/common';
import { OverviewService } from './overview.service';

@Controller('api/v1/overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  getOverview(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.overviewService.getOverview(projectId, env);
  }
}
