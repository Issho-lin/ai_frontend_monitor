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
