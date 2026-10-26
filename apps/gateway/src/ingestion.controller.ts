import { Body, Controller, Headers, Post, Query, Req } from '@nestjs/common';
import type { IngestPayload } from '@ai-frontend-monitor/schema';
import { IngestionService } from './ingestion.service';

type IngestRequest = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

@Controller()
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('ingest')
  ingest(
    @Body() payload: IngestPayload,
    @Headers('x-project-token') token?: string,
    @Query('projectId') projectIdQuery?: string,
    @Req() req?: IngestRequest,
  ) {
    // Allow projectId from body or query (body wins when present).
    const merged: IngestPayload = {
      ...payload,
      projectId: payload?.projectId || projectIdQuery || '',
    };

    const forwarded = req?.headers?.['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded)
      ? forwarded[0]
      : typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : undefined;
    const clientKey =
      forwardedIp ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      'unknown';

    return this.ingestionService.ingest(merged, token, clientKey);
  }
}
