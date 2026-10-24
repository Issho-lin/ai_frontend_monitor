import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { NotifyService } from './notify.service';
import { PostgresService } from './postgres.service';

@Module({
  controllers: [AlertsController],
  providers: [PostgresService, NotifyService, AlertsService],
  exports: [AlertsService, PostgresService],
})
export class AlertsModule {}
