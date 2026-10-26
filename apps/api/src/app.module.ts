import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AlertsModule } from './alerts/alerts.module';
import { ReleasesModule } from './releases/releases.module';
import { TasksModule } from './tasks/tasks.module';
import { ListingsController } from './listings/listings.controller';
import { ListingsService } from './listings/listings.service';
import { OverviewController } from './overview/overview.controller';
import { OverviewService } from './overview/overview.service';
import { IssuesModule } from './issues/issues.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    AlertsModule,
    TasksModule,
    ReleasesModule,
    IssuesModule,
    ProjectsModule,
  ],
  controllers: [AppController, OverviewController, ListingsController],
  providers: [AppService, OverviewService, ListingsService],
})
export class AppModule {}
