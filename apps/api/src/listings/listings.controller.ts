import { Controller, Get, Query } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { ListingsService } from './listings.service';
import { normalizeChoice, normalizeRelease, normalizeWindow } from '../scope';

@Controller('api/v1')
export class ListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly alertsService: AlertsService,
  ) {}

  @Get('search')
  async search(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
    @Query('q') q = '',
  ) {
    const query = q.trim()
    if (!query) return { pages: [], errors: [], alerts: [], sessions: [], apis: [] }
    const scope = normalizeRelease(release)
    const [hits, alerts] = await Promise.all([
      this.listingsService.search(projectId, env, scope, query, normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window)),
      this.alertsService.list(projectId, env, scope, normalizeWindow(window)),
    ])
    const needle = query.toLowerCase()
    return {
      ...hits,
      alerts: alerts
        .filter((row) => `${row.title} ${row.route}`.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((row) => ({ id: row.id, title: row.title, route: row.route, status: row.status })),
    }
  }

  @Get('facets')
  getFacets(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
  ) {
    return this.listingsService.getFacets(projectId, env, normalizeRelease(release));
  }

  @Get('pages')
  getPages(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getPages(projectId, env, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('pages/detail')
  getPageDetail(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('route') route = '/home',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getPageDetail(projectId, env, route, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('pages/resources')
  getPageResources(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('route') route = '/home',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getPageResources(projectId, env, route, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('apis/detail')
  getApiDetail(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
    @Query('api') api = '',
  ) {
    return this.listingsService.getApiDetail(projectId, env, api, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('apis')
  getApis(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getApis(projectId, env, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('errors/context')
  getErrorContext(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
    @Query('errorId') errorId = '',
  ) {
    return this.listingsService.getErrorContext(projectId, env, errorId, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('errors/item')
  getErrorItem(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('errorId') errorId = '',
  ) {
    return this.listingsService.getErrorById(projectId, env, errorId);
  }

  @Get('errors')
  getErrors(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getErrors(projectId, env, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('sessions')
  getSessions(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
  ) {
    return this.listingsService.getSessions(projectId, env, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('sessions/latest')
  getLatestSession(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
    @Query('route') route = '',
  ) {
    return this.listingsService.getLatestSession(projectId, env, route, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }

  @Get('sessions/detail')
  getSessionDetail(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('release') release = '',
    @Query('device') device = '',
    @Query('country') country = '',
    @Query('browser') browser = '',
    @Query('window') window = '',
    @Query('sessionId') sessionId = '',
  ) {
    return this.listingsService.getSessionDetail(projectId, env, sessionId, normalizeRelease(release), normalizeChoice(device), normalizeChoice(country), normalizeChoice(browser), normalizeWindow(window));
  }
}
