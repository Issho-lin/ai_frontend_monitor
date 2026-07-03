import { Body, Controller, Headers, Post } from '@nestjs/common';
import type { IngestPayload } from '@ai-frontend-monitor/schema';
import { IngestionService } from './ingestion.service';

@Controller()
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('ingest')
  ingest(
    @Body() payload: IngestPayload,
    @Headers('x-project-token') token?: string,
  ) {
    return this.ingestionService.ingest(payload, token);
  }
}
