import { Module } from '@nestjs/common';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { NotifyService } from './notify.service';
import { PostgresService } from './postgres.service';

@Module({
  controllers: [AlertsController, AlertRulesController],
  providers: [PostgresService, NotifyService, AlertRulesService, AlertsService],
  exports: [AlertsService, AlertRulesService, PostgresService],
})
export class AlertsModule {}
