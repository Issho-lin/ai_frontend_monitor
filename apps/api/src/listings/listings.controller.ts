import { Controller, Get, Query } from '@nestjs/common';
import { ListingsService } from './listings.service';

@Controller('api/v1')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get('pages')
  getPages(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.listingsService.getPages(projectId, env);
  }

  @Get('pages/detail')
  getPageDetail(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('route') route = '/home',
  ) {
    return this.listingsService.getPageDetail(projectId, env, route);
  }

  @Get('pages/resources')
  getPageResources(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('route') route = '/home',
  ) {
    return this.listingsService.getPageResources(projectId, env, route);
  }

  @Get('apis')
  getApis(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.listingsService.getApis(projectId, env);
  }

  @Get('errors')
  getErrors(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.listingsService.getErrors(projectId, env);
  }
}
