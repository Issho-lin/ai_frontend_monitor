import { Controller, Get, Param, Query } from '@nestjs/common';
import { ReleasesService } from './releases.service';

@Controller('api/v1/releases')
export class ReleasesController {
  constructor(private readonly releasesService: ReleasesService) {}

  @Get()
  list(@Query('projectId') projectId = 'demo') {
    return this.releasesService.list(projectId);
  }

  @Get(':version')
  getDetail(
    @Param('version') version: string,
    @Query('projectId') projectId = 'demo',
    @Query('env') env?: string,
  ) {
    return this.releasesService.getDetail(projectId, decodeURIComponent(version), env);
  }
}
