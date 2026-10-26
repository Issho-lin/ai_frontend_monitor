import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { QueueService } from './queue.service';

@Module({
  controllers: [IngestionController],
  providers: [AuthService, IngestionService, QueueService],
})
export class AppModule {}
