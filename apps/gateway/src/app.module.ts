import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { QueueService } from './queue.service';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, QueueService],
})
export class AppModule {}
