import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ListingsController } from './listings/listings.controller';
import { ListingsService } from './listings/listings.service';
import { OverviewController } from './overview/overview.controller';
import { OverviewService } from './overview/overview.service';

@Module({
  imports: [],
  controllers: [AppController, OverviewController, ListingsController],
  providers: [AppService, OverviewService, ListingsService],
})
export class AppModule {}
