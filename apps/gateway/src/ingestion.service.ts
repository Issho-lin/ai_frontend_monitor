import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { IngestPayload, MetricValues, ResourceType, RUMEvent } from '@ai-frontend-monitor/schema';
import { createHash, randomUUID } from 'node:crypto';
import { QueueService } from './queue.service';

const DEMO_PROJECT_ID = 'demo';
const DEMO_TOKEN = 'afm-demo-token';

@Injectable()
export class IngestionService {
  constructor(private readonly queueService: QueueService) {}

  async ingest(payload: IngestPayload, token?: string) {
    this.assertAuthorized(payload.projectId, token);

    const events = this.expandPayload(payload);
    await this.queueService.publish(events);

    return {
      status: 'accepted',
      accepted: events.length,
    };
  }

  private assertAuthorized(projectId: string, token?: string) {
    if (projectId === DEMO_PROJECT_ID) {
      if (token && token === DEMO_TOKEN) {
        return;
      }

      if (!token) {
        return;
      }
    }

    throw new UnauthorizedException('Invalid project token.');
  }

  private expandPayload(payload: IngestPayload): RUMEvent[] {
    const baseEvent = this.buildBaseEvent(payload);
    const events: RUMEvent[] = [
      {
        ...baseEvent,
        event_id: randomUUID(),
        event_type: 'page_view',
        metric_name: 'PV',
        metric_value: 1,
      },
    ];

    const metrics = payload.metrics ?? {};

    for (const [metricName, value] of Object.entries(metrics) as Array<
      [keyof MetricValues, number | undefined]
    >) {
      if (typeof value !== 'number') {
        continue;
      }

      events.push({
        ...baseEvent,
        event_id: randomUUID(),
        event_type: 'web_vital',
        metric_name: metricName.toUpperCase(),
        metric_value: value,
        duration: value,
      });
    }

    for (const error of payload.errors ?? []) {
      const route = error.route ?? payload.route;
      events.push({
        ...baseEvent,
        event_id: randomUUID(),
        event_type: 'error',
        route,
        route_hash: this.hashRoute(route),
        metric_name: '',
        metric_value: 0,
        error_name: error.name,
        error_stack_hash: error.stackHash,
        attributes: {
          ...(payload.context.attributes ?? {}),
          message: error.message,
          stack: error.stack ?? '',
          errorType: this.deriveErrorType(error.name),
        },
      });
    }

    for (const apiTiming of payload.apiTimings ?? []) {
      events.push({
        ...baseEvent,
        event_id: randomUUID(),
        event_type: 'api_timing',
        metric_name: '',
        metric_value: 0,
        api_route: apiTiming.apiRoute,
        duration: apiTiming.duration,
        status_code: apiTiming.statusCode,
        trace_id: apiTiming.traceId ?? baseEvent.trace_id,
        attributes: {
          ...(payload.context.attributes ?? {}),
          method: apiTiming.method,
          url: apiTiming.url ?? '',
          isTimeout: apiTiming.isTimeout ?? false,
        },
      });
    }

    for (const resource of payload.resources ?? []) {
      const route = resource.route ?? payload.route;
      events.push({
        ...baseEvent,
        event_id: randomUUID(),
        event_type: 'resource_timing',
        route,
        route_hash: this.hashRoute(route),
        metric_name: '',
        metric_value: 0,
        resource_type: this.normalizeResourceType(resource.initiatorType),
        resource_url: resource.url,
        resource_size: resource.size,
        duration: resource.duration,
        attributes: {
          ...(payload.context.attributes ?? {}),
          failed: resource.failed ?? false,
          initiatorType: resource.initiatorType,
        },
      });
    }

    return events;
  }

  private buildBaseEvent(payload: IngestPayload): Omit<RUMEvent, 'event_id' | 'event_type' | 'metric_name' | 'metric_value'> {
    return {
      project_id: payload.projectId,
      env: payload.env,
      timestamp: payload.occurredAt,
      page_url: payload.pageUrl,
      route: payload.route,
      route_hash: this.hashRoute(payload.route),
      release: payload.context.release,
      session_id: payload.context.sessionId,
      user_id_hash: payload.context.userIdHash,
      device_type: payload.context.deviceType,
      os: payload.context.os,
      browser: payload.context.browser,
      network_type: payload.context.networkType,
      country: payload.context.country ?? 'unknown',
      api_route: '',
      resource_type: '',
      resource_url: '',
      resource_size: 0,
      duration: 0,
      status_code: 0,
      error_name: '',
      error_stack_hash: '',
      lcp_element: '',
      trace_id: payload.context.traceId ?? '',
      sample_rate: payload.context.sampleRate,
      sdk_version: payload.context.sdkVersion,
      attributes: payload.context.attributes ?? {},
    };
  }

  private hashRoute(route: string) {
    return createHash('sha1').update(route).digest('hex');
  }

  private normalizeResourceType(value: string): ResourceType | '' {
    switch (value) {
      case 'script':
      case 'font':
      case 'fetch':
        return value;
      case 'img':
      case 'image':
        return 'img';
      case 'css':
      case 'link':
      case 'style':
        return 'css';
      default:
        return value ? 'other' : '';
    }
  }

  private deriveErrorType(name: string): 'js' | 'promise' | 'resource' {
    if (name === 'unhandledrejection') {
      return 'promise';
    }

    if (name === 'resource_error') {
      return 'resource';
    }

    return 'js';
  }
}
