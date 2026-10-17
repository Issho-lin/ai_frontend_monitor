import { Body, Controller, Get, NotFoundException, Param, Patch, Query } from '@nestjs/common';
import { AlertsService } from './alerts.service';

interface AlertActionBody {
  action?: string;
  silenceHours?: number;
}

@Controller('api/v1/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  getAlerts(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.alertsService.list(projectId, env);
  }

  @Get(':id')
  async getAlert(
    @Param('id') id: string,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    const alert = await this.alertsService.getById(id, projectId, env);
    if (!alert) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return alert;
  }

  @Patch(':id')
  applyAction(
    @Param('id') id: string,
    @Body() body: AlertActionBody,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.alertsService.applyAction(
      id,
      projectId,
      env,
      body.action ?? '',
      body.silenceHours,
    );
  }
}
