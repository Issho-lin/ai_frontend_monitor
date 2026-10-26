import { Controller, Get, Query } from '@nestjs/common';
import { OverviewService } from './overview.service';
import { normalizeChoice, normalizeRelease, normalizeWindow } from '../scope';

@Controller('api/v1/overview')
export class OverviewController {
  constructor(private readonly overviewService: OverviewService) {}

  @Get()
  getOverview(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.overviewService.getOverview(projectId, env, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }
}
