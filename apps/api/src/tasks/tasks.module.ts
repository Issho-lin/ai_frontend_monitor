import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [AlertsModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
