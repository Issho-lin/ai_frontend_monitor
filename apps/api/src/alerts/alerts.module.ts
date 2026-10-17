import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { PostgresService } from './postgres.service';

@Module({
  controllers: [AlertsController],
  providers: [PostgresService, AlertsService],
  exports: [AlertsService, PostgresService],
})
export class AlertsModule {}
