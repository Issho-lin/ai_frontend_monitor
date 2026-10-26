import { Injectable } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { formatMetricValue, isGoodMetric } from '@ai-frontend-monitor/schema';

type PageTrend = 'up' | 'down' | 'flat';
type ErrorKind = 'js' | 'promise' | 'resource';

const AFFECTED_USERS = `
  uniqExactIf(user_id_hash, user_id_hash != '' AND (
    event_type = 'error'
    OR (event_type = 'web_vital' AND (
      (metric_name = 'LCP' AND metric_value > 4000)
      OR (metric_name = 'INP' AND metric_value > 500)
      OR (metric_name = 'CLS' AND metric_value > 0.25)
      OR (metric_name = 'TTFB' AND metric_value > 1800)
    ))
    OR (event_type = 'api_timing' AND (
      status_code >= 500 OR status_code = 0 OR toBool(attributes.isTimeout)
    ))
  )) AS affected_users`;

export interface PageRowResult {
  route: string;
  pv: number;
  affectedUsers: number;
  lcpP75: number | null;
  fcpP75: number | null;
  inpP75: number | null;
  clsP75: number | null;
  ttfbP75: number | null;
  jsErrorRate: number | null;
  apiP95: number | null;
  passRate: number | null;
  trend: PageTrend;
}

export interface ApiRowResult {
  api: string;
  method: string;
  p95: number;
  p50: number;
  errorRate: number;
  timeoutRate: number;
  qps: number;
  failedQps: number;
  timeoutQps: number;
  requests: number;
  traceCoverage: number;
}

export interface ErrorRowResult {
  id: string;
  message: string;
  type: ErrorKind;
  route: string;
  release: string;
  count: number;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
  status: 'unresolved';
  trend: number[];
}

export interface ResourceRowResult {
  url: string;
  type: 'js' | 'css' | 'img' | 'font' | 'other';
  size: number;
  duration: number;
  cacheHitRate: number;
  failRate: number;
}

export interface SessionRowResult {
  id: string;
  user: string;
  device: string;
  region: string;
  route: string;
  release: string;
  network: string;
  status: '正常' | '缓慢' | '异常';
  duration: string;
  eventCount: number;
  errorCount: number;
  startedAt: string;
}

export interface SessionStepResult {
  at: string;
  title: string;
  detail: string;
  bad: boolean;
}

export interface PageDetailResult {
  page: PageRowResult | null;
  resources: ResourceRowResult[];
  apis: ApiRowResult[];
}

interface RawPageRow {
  route: string;
  pv: number;
  affected_users: number;
  lcp_p75: number | null;
  fcp_p75: number | null;
  inp_p75: number | null;
  cls_p75: number | null;
  ttfb_p75: number | null;
  js_error_rate: number | null;
  api_p95: number | null;
  lcp_n: number;
  fcp_n: number;
  inp_n: number;
  cls_n: number;
  ttfb_n: number;
  api_n: number;
}

interface RawApiRow {
  api: string;
  method: string;
  p50: number;
  p95: number;
  error_rate: number;
  timeout_rate: number;
  total_requests: number;
  traced_requests: number;
  recent_requests: number;
  recent_errors: number;
  recent_timeouts: number;
}

interface RawResourceRow {
  url: string;
  resource_type: string | null;
  size: number;
  duration: number;
  fail_rate: number;
}

interface RawErrorRow {
  id: string;
  message: string;
  error_type: string | null;
  route: string;
  release: string;
  count: number;
  affected_users: number;
  first_seen: string;
  last_seen: string;
}

@Injectable()
export class ListingsService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  async getPages(projectId: string, env: string, release = '', device = '', country = '', browser = '', hours = 24): Promise<PageRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          countIf(event_type = 'page_view') AS pv,
          ${AFFECTED_USERS},
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'INP') AS inp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'CLS') AS cls_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_p75,
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS js_error_rate,
          quantileIf(0.95)(duration, event_type = 'api_timing') AS api_p95,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'INP') AS inp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'CLS') AS cls_n,
          countIf(event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_n,
          countIf(event_type = 'api_timing') AS api_n
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY route
        HAVING pv > 0
        ORDER BY pv DESC
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawPageRow>();
    return rows.map((row) => this.mapPageRow(row, device));
  }

  async getPageDetail(
    projectId: string,
    env: string,
    route: string,
    release = '',
    device = '',
    country = '', browser = '', hours = 24,
  ): Promise<PageDetailResult> {
    const [pages, resources, apis] = await Promise.all([
      this.getPagesByRoute(projectId, env, route, release, device, country, browser, hours),
      this.getPageResources(projectId, env, route, release, device, country, browser, hours),
      this.getPageApis(projectId, env, route, release, device, country, browser, hours),
    ]);

    return {
      page: pages[0] ?? null,
      resources,
      apis,
    };
  }

  async getPageResources(
    projectId: string,
    env: string,
    route: string,
    release = '',
    device = '',
    country = '', browser = '', hours = 24,
  ): Promise<ResourceRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          resource_url AS url,
          any(resource_type) AS resource_type,
          avg(resource_size) AS size,
          quantile(0.75)(duration) AS duration,
          (countIf(toBool(attributes.failed)) / count()) * 100 AS fail_rate
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'resource_timing'
          AND route = {route:String}
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND resource_url != ''
        GROUP BY resource_url
        ORDER BY duration DESC
        LIMIT 20
      `,
      query_params: { projectId, env, release, device, country, browser, hours, route },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawResourceRow>();

    return rows.map((row) => ({
      url: row.url,
      type: this.normalizeResourceType(row.resource_type),
      size: Math.round(row.size ?? 0),
      duration: Math.round(row.duration ?? 0),
      cacheHitRate: 0,
      failRate: Number((row.fail_rate ?? 0).toFixed(2)),
    }));
  }

  async getPageApis(
    projectId: string,
    env: string,
    route: string,
    release = '',
    device = '',
    country = '', browser = '', hours = 24,
  ): Promise<ApiRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          api_route AS api,
          upper(toString(attributes.method)) AS method,
          quantile(0.5)(duration) AS p50,
          quantile(0.95)(duration) AS p95,
          (countIf(status_code >= 400 OR status_code = 0) / count()) * 100 AS error_rate,
          (countIf(toBool(attributes.isTimeout)) / count()) * 100 AS timeout_rate,
          count() AS total_requests,
          countIf(length(trace_id) > 0) AS traced_requests,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS recent_requests,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE AND (status_code >= 400 OR status_code = 0)) AS recent_errors,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE AND toBool(attributes.isTimeout)) AS recent_timeouts
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'api_timing'
          AND route = {route:String}
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND api_route != ''
        GROUP BY api_route, method
        ORDER BY total_requests DESC, api_route ASC
        LIMIT 4
      `,
      query_params: { projectId, env, release, device, country, browser, hours, route },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawApiRow>();
    return rows.map((row) => this.mapApiRow(row));
  }

  async getApis(projectId: string, env: string, release = '', device = '', country = '', browser = '', hours = 24): Promise<ApiRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          api_route AS api,
          upper(toString(attributes.method)) AS method,
          quantile(0.5)(duration) AS p50,
          quantile(0.95)(duration) AS p95,
          (countIf(status_code >= 400 OR status_code = 0) / count()) * 100 AS error_rate,
          (countIf(toBool(attributes.isTimeout)) / count()) * 100 AS timeout_rate,
          count() AS total_requests,
          countIf(length(trace_id) > 0) AS traced_requests,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS recent_requests,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE AND (status_code >= 400 OR status_code = 0)) AS recent_errors,
          countIf(timestamp >= now() - INTERVAL 5 MINUTE AND toBool(attributes.isTimeout)) AS recent_timeouts
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'api_timing'
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND api_route != ''
        GROUP BY api_route, method
        ORDER BY total_requests DESC, api_route ASC
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawApiRow>();
    return rows.map((row) => this.mapApiRow(row));
  }

  async getApiDetail(projectId: string, env: string, api: string, release = '', device = '', country = '', browser = '', hours = 24) {
    if (!api) {
      return { summary: null, statuses: [], pages: [], trend: [] };
    }

    const scope = `
      project_id = {projectId:String}
      AND env = {env:String}
      AND ({release:String} = '' OR release = {release:String})
      AND ({device:String} = '' OR device_type = {device:String})
      AND ({country:String} = '' OR country = {country:String})
      AND ({browser:String} = '' OR browser = {browser:String})
      AND event_type = 'api_timing'
      AND api_route = {api:String}
      AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
    `;
    const query_params = { projectId, env, release, device, country, browser, hours, api };
    const [summaryResult, statusResult, pageResult, trendResult] = await Promise.all([
      this.clickhouse.query({
        query: `
          SELECT
            api_route AS api,
            upper(any(toString(attributes.method))) AS method,
            quantile(0.5)(duration) AS p50,
            quantile(0.95)(duration) AS p95,
            (countIf(status_code >= 400 OR status_code = 0) / count()) * 100 AS error_rate,
            (countIf(toBool(attributes.isTimeout)) / count()) * 100 AS timeout_rate,
            count() AS total_requests,
            countIf(length(trace_id) > 0) AS traced_requests,
            countIf(timestamp >= now() - INTERVAL 5 MINUTE) AS recent_requests,
            countIf(timestamp >= now() - INTERVAL 5 MINUTE AND (status_code >= 400 OR status_code = 0)) AS recent_errors,
            countIf(timestamp >= now() - INTERVAL 5 MINUTE AND toBool(attributes.isTimeout)) AS recent_timeouts
          FROM afm.rum_events
          WHERE ${scope}
          GROUP BY api_route
        `,
        query_params,
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            multiIf(
              toBool(attributes.isTimeout), '超时',
              status_code = 0, '状态码 0',
              status_code >= 500, '5xx',
              status_code >= 400, '4xx',
              status_code >= 200 AND status_code < 400, '2xx',
              '其他'
            ) AS bucket,
            count() AS requests
          FROM afm.rum_events
          WHERE ${scope}
          GROUP BY bucket
          ORDER BY requests DESC
        `,
        query_params,
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT route, count() AS requests
          FROM afm.rum_events
          WHERE ${scope} AND route != ''
          GROUP BY route
          ORDER BY requests DESC
          LIMIT 8
        `,
        query_params,
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            formatDateTime(${hours > 24 ? 'toStartOfDay(timestamp)' : 'toStartOfHour(timestamp)'}, '${hours > 24 ? '%m-%d' : '%m-%d %H:00'}') AS hour,
            quantile(0.95)(duration) AS p95,
            count() AS requests
          FROM afm.rum_events
          WHERE ${scope}
          GROUP BY ${hours > 24 ? 'toStartOfDay(timestamp)' : 'toStartOfHour(timestamp)'}
          ORDER BY ${hours > 24 ? 'toStartOfDay(timestamp)' : 'toStartOfHour(timestamp)'} ASC
        `,
        query_params,
        format: 'JSONEachRow',
      }),
    ]);

    const summaryRows = await summaryResult.json<RawApiRow>();
    const statuses = await statusResult.json<{ bucket: string; requests: number }>();
    const pages = await pageResult.json<{ route: string; requests: number }>();
    const trend = await trendResult.json<{ hour: string; p95: number; requests: number }>();
    return {
      summary: summaryRows[0] ? this.mapApiRow(summaryRows[0]) : null,
      statuses: statuses.map((row) => ({ bucket: row.bucket, requests: Number(row.requests) })),
      pages: pages.map((row) => ({ route: row.route, requests: Number(row.requests) })),
      trend: trend.map((row) => ({ hour: row.hour, p95: Math.round(Number(row.p95)), requests: Number(row.requests) })),
    };
  }

  async getErrorById(projectId: string, env: string, errorId: string): Promise<ErrorRowResult | null> {
    if (!errorId) return null;
    const result = await this.clickhouse.query({
      query: `
        SELECT
          concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) AS id,
          coalesce(nullIf(argMin(toString(attributes.message), timestamp), ''), any(error_name)) AS message,
          any(toString(attributes.errorType)) AS error_type,
          any(route) AS route,
          release,
          count() AS count,
          uniq(user_id_hash) AS affected_users,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S') AS first_seen,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S') AS last_seen
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'error'
          AND concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) = {errorId:String}
        GROUP BY error_stack_hash, release
        LIMIT 1
      `,
      query_params: { projectId, env, errorId },
      format: 'JSONEachRow',
    });
    const rows = await result.json<RawErrorRow>();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      message: row.message,
      type: this.normalizeErrorType(row.error_type),
      route: row.route,
      release: row.release,
      count: row.count,
      affectedUsers: row.affected_users,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      status: 'unresolved',
      trend: [],
    };
  }

  async getErrors(projectId: string, env: string, release = '', device = '', country = '', browser = '', hours = 24): Promise<ErrorRowResult[]> {
    const bucketExpr = hours > 24 ? 'toStartOfDay(timestamp)' : 'toStartOfHour(timestamp)';
    const [result, trendResult] = await Promise.all([
      this.clickhouse.query({
        query: `
        SELECT
          concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) AS id,
          coalesce(nullIf(argMin(toString(attributes.message), timestamp), ''), any(error_name)) AS message,
          any(toString(attributes.errorType)) AS error_type,
          any(route) AS route,
          release,
          count() AS count,
          uniq(user_id_hash) AS affected_users,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S') AS first_seen,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S') AS last_seen
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'error'
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY error_stack_hash, release
        ORDER BY count DESC, last_seen DESC
      `,
        query_params: { projectId, env, release, device, country, browser, hours },
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
        SELECT
          concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) AS id,
          toUnixTimestamp(${bucketExpr}) AS bucket,
          count() AS count
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'error'
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY error_stack_hash, release, ${bucketExpr}
      `,
        query_params: { projectId, env, release, device, country, browser, hours },
        format: 'JSONEachRow',
      }),
    ]);

    const rows = await result.json<RawErrorRow>();
    const trendRows = await trendResult.json<{ id: string; bucket: number; count: number }>();
    const trends = new Map<string, Map<number, number>>();
    for (const row of trendRows) {
      const buckets = trends.get(row.id) ?? new Map<number, number>();
      buckets.set(Number(row.bucket), Number(row.count));
      trends.set(row.id, buckets);
    }
    const step = hours > 24 ? 86400 : 3600;
    const points = hours > 24 ? Math.round(hours / 24) : 24;
    const now = Math.floor(Date.now() / 1000);
    const currentBucket = hours > 24
      ? Math.floor((now + 8 * 3600) / 86400) * 86400 - 8 * 3600
      : Math.floor(now / 3600) * 3600;

    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      type: this.normalizeErrorType(row.error_type),
      route: row.route,
      release: row.release,
      count: row.count,
      affectedUsers: row.affected_users,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      status: 'unresolved',
      trend: Array.from({ length: points }, (_, index) => {
        const bucket = currentBucket - (points - 1 - index) * step;
        return trends.get(row.id)?.get(bucket) ?? 0;
      }),
    }));
  }

  private async getPagesByRoute(
    projectId: string,
    env: string,
    route: string,
    release = '',
    device = '',
    country = '', browser = '', hours = 24,
  ): Promise<PageRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          countIf(event_type = 'page_view') AS pv,
          ${AFFECTED_USERS},
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'INP') AS inp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'CLS') AS cls_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_p75,
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS js_error_rate,
          quantileIf(0.95)(duration, event_type = 'api_timing') AS api_p95,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'INP') AS inp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'CLS') AS cls_n,
          countIf(event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_n,
          countIf(event_type = 'api_timing') AS api_n
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND route = {route:String}
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY route
      `,
      query_params: { projectId, env, release, device, country, browser, hours, route },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawPageRow>();
    return rows.map((row) => this.mapPageRow(row, device));
  }

  private mapPageRow(row: RawPageRow, device = ''): PageRowResult {
    const lcpP75 = this.sampled(row.lcp_n, row.lcp_p75);
    const fcpP75 = this.sampled(row.fcp_n, row.fcp_p75);
    const inpP75 = this.sampled(row.inp_n, row.inp_p75);
    const clsP75 = this.sampled(row.cls_n, row.cls_p75);
    const ttfbP75 = this.sampled(row.ttfb_n, row.ttfb_p75);
    const jsErrorRate = Number(row.pv) > 0 ? this.finite(row.js_error_rate) : null;
    const apiP95 = this.sampled(row.api_n, row.api_p95);
    const passRate = this.computePagePassRate({
      lcpP75,
      fcpP75,
      inpP75,
      clsP75,
      ttfbP75,
      jsErrorRate,
      apiP95,
    }, device);

    return {
      route: row.route,
      pv: row.pv,
      affectedUsers: row.affected_users,
      lcpP75: this.roundSeconds(lcpP75),
      fcpP75: this.roundSeconds(fcpP75),
      inpP75: this.roundMs(inpP75),
      clsP75: clsP75 == null ? null : Number(clsP75.toFixed(3)),
      ttfbP75: this.roundMs(ttfbP75),
      jsErrorRate: jsErrorRate == null ? null : Number(jsErrorRate.toFixed(2)),
      apiP95: this.roundMs(apiP95),
      passRate,
      trend: this.computeTrend(passRate),
    };
  }

  private mapApiRow(row: RawApiRow): ApiRowResult {
    return {
      api: row.api,
      method: row.method || 'GET',
      p95: Math.round(row.p95),
      p50: Math.round(row.p50),
      errorRate: Number(row.error_rate.toFixed(2)),
      timeoutRate: Number(row.timeout_rate.toFixed(2)),
      qps: Number((row.recent_requests / 300).toFixed(2)),
      failedQps: Number((row.recent_errors / 300).toFixed(2)),
      timeoutQps: Number((row.recent_timeouts / 300).toFixed(2)),
      requests: row.total_requests,
      traceCoverage: row.total_requests > 0
        ? Number(((row.traced_requests / row.total_requests) * 100).toFixed(0))
        : 0,
    };
  }

  private computePagePassRate(metrics: {
    lcpP75: number | null;
    fcpP75: number | null;
    inpP75: number | null;
    clsP75: number | null;
    ttfbP75: number | null;
    jsErrorRate: number | null;
    apiP95: number | null;
  }, device = '') {
    const lcpGoodAt = device === 'mobile' ? 3000 : 2500;
    const checks = [
      metrics.lcpP75 == null ? null : metrics.lcpP75 <= lcpGoodAt,
      metrics.fcpP75 == null ? null : isGoodMetric('FCP', metrics.fcpP75),
      metrics.inpP75 == null ? null : isGoodMetric('INP', metrics.inpP75),
      metrics.clsP75 == null ? null : isGoodMetric('CLS', metrics.clsP75),
      metrics.ttfbP75 == null ? null : isGoodMetric('TTFB', metrics.ttfbP75),
      metrics.jsErrorRate == null ? null : metrics.jsErrorRate <= 0.5,
      metrics.apiP95 == null ? null : metrics.apiP95 <= 800,
    ];
    const present = checks.filter((item): item is boolean => item !== null);
    if (!present.length) return null;
    return Math.round((present.filter(Boolean).length / present.length) * 100);
  }

  private computeTrend(passRate: number | null): PageTrend {
    if (passRate == null) return 'flat';
    if (passRate >= 85) {
      return 'down';
    }
    if (passRate >= 70) {
      return 'flat';
    }
    return 'up';
  }

  private sampled(count: number | null | undefined, value: number | null | undefined) {
    if (!Number.isFinite(Number(count)) || Number(count) <= 0) return null;
    return this.finite(value);
  }

  private finite(value: number | null | undefined) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private roundSeconds(value: number | null) {
    return value == null ? null : Number((value / 1000).toFixed(1));
  }

  private roundMs(value: number | null) {
    return value == null ? null : Math.round(value);
  }

  private normalizeErrorType(value: string | null): ErrorKind {
    if (value === 'promise' || value === 'resource') {
      return value;
    }
    return 'js';
  }

  async getSessions(projectId: string, env: string, release = '', device = '', country = '', browser = '', hours = 24): Promise<SessionRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          session_id,
          any(user_id_hash) AS user_id,
          argMax(route, timestamp) AS last_route,
          argMax(release, timestamp) AS session_release,
          any(network_type) AS network_type,
          any(device_type) AS session_device,
          any(os) AS os,
          any(browser) AS session_browser,
          any(country) AS session_country,
          count() AS event_count,
          countIf(event_type = 'error') AS error_count,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S') AS started_at,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S') AS ended_at,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND session_id != ''
        GROUP BY session_id
        ORDER BY max(timestamp) DESC
        LIMIT 50
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    const rows = await result.json<{
      session_id: string;
      user_id: string;
      last_route: string;
      session_release: string;
      session_device: string;
      os: string;
      session_browser: string;
      session_country: string;
      network_type: string;
      event_count: number;
      error_count: number;
      started_at: string;
      ended_at: string;
      lcp_p75: number | null;
    }>();

    return rows.map((row) => {
      const lcp = Number(row.lcp_p75);
      const slow = Number.isFinite(lcp) && lcp > (row.session_device === 'mobile' ? 3000 : 2500);
      const device = [row.session_device, row.os, row.session_browser].filter((part) => part && part !== 'unknown').join(' · ');
      return {
        id: row.session_id,
        user: row.user_id ? row.user_id.slice(0, 8) : '未标识',
        device: device || '—',
        region: row.session_country && row.session_country !== 'unknown' ? row.session_country : '—',
        route: row.last_route || '—',
        release: row.session_release,
        network: row.network_type && row.network_type !== 'unknown' ? row.network_type : '—',
        status: row.error_count > 0 ? '异常' : slow ? '缓慢' : '正常',
        duration: this.formatDuration(row.started_at, row.ended_at),
        eventCount: Number(row.event_count),
        errorCount: Number(row.error_count),
        startedAt: row.started_at,
      };
    });
  }

  async getErrorContext(projectId: string, env: string, errorId: string, release = '', device = '', country = '', browser = '', hours = 24) {
    if (!errorId) return { stack: '', sessionId: '' };

    const result = await this.clickhouse.query({
      query: `
        SELECT
          argMax(toString(attributes.stack), timestamp) AS stack,
          argMaxIf(session_id, timestamp, session_id != '') AS session_id
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'error'
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) = {errorId:String}
      `,
      query_params: { projectId, env, release, device, country, browser, hours, errorId },
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ stack: string; session_id: string }>();
    const row = rows[0];
    return {
      stack: row?.stack ?? '',
      sessionId: row?.session_id ?? '',
    };
  }

  async getLatestSession(projectId: string, env: string, route: string, release = '', device = '', country = '', browser = '', hours = 24) {
    if (!route) return { sessionId: '' };

    const result = await this.clickhouse.query({
      query: `
        SELECT argMax(session_id, timestamp) AS latest_session
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND route = {route:String}
          AND session_id != ''
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
      `,
      query_params: { projectId, env, release, device, country, browser, hours, route },
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ latest_session: string }>();
    return { sessionId: rows[0]?.latest_session ?? '' };
  }

  async getSessionDetail(
    projectId: string,
    env: string,
    sessionId: string,
    release = '',
    device = '',
    country = '', browser = '', hours = 24,
  ): Promise<SessionStepResult[]> {
    if (!sessionId) return [];

    const result = await this.clickhouse.query({
      query: `
        SELECT
          formatDateTime(timestamp, '%H:%i:%S') AS at,
          event_type,
          route,
          metric_name,
          metric_value,
          duration,
          status_code,
          error_name,
          api_route,
          resource_url,
          toString(attributes.message) AS message,
          toString(attributes.method) AS method,
          toBool(attributes.failed) AS failed,
          toBool(attributes.isTimeout) AS is_timeout
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND session_id = {sessionId:String}
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
          AND (
            event_type IN ('page_view', 'web_vital', 'error', 'api_timing')
            OR (event_type = 'resource_timing' AND toBool(attributes.failed))
          )
        ORDER BY timestamp ASC
        LIMIT 120
      `,
      query_params: { projectId, env, release, device, country, browser, hours, sessionId },
      format: 'JSONEachRow',
    });

    const rows = await result.json<{
      at: string;
      event_type: string;
      route: string;
      metric_name: string;
      metric_value: number;
      duration: number;
      status_code: number;
      error_name: string;
      api_route: string;
      resource_url: string;
      message: string;
      method: string;
      failed: boolean;
      is_timeout: boolean;
    }>();

    return rows.map((row) => this.describeSessionStep(row));
  }

  async getFacets(projectId: string, env: string, release = '', hours = 24) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          groupUniqArrayIf(device_type, device_type != '' AND device_type != 'unknown') AS devices,
          groupUniqArrayIf(country, country != '' AND country != 'unknown') AS countries,
          groupUniqArrayIf(browser, browser != '' AND browser != 'unknown') AS browsers
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
      `,
      query_params: { projectId, env, release, hours },
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ devices: string[]; countries: string[]; browsers: string[] }>();
    const row = rows[0];
    return {
      devices: [...(row?.devices ?? [])].sort(),
      countries: [...(row?.countries ?? [])].sort(),
      browsers: [...(row?.browsers ?? [])].sort(),
    };
  }

  async search(projectId: string, env: string, release: string, q: string, device = '', country = '', browser = '', hours = 24) {
    const [pagesResult, errorsResult, sessionsResult, apisResult] = await Promise.all([
      this.clickhouse.query({
        query: `
          SELECT
            route,
            countIf(event_type = 'page_view') AS pv
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
            AND route != ''
            AND positionCaseInsensitive(route, {q:String}) > 0
          GROUP BY route
          HAVING pv > 0
          ORDER BY pv DESC
          LIMIT 5
        `,
        query_params: { projectId, env, release, device, country, browser, hours, q },
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            concat('err-', lower(hex(cityHash64(concat(error_stack_hash, release))))) AS id,
            coalesce(nullIf(argMin(toString(attributes.message), timestamp), ''), any(error_name)) AS message,
            any(route) AS error_route
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND event_type = 'error'
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
            AND (
              positionCaseInsensitive(toString(attributes.message), {q:String}) > 0
              OR positionCaseInsensitive(error_name, {q:String}) > 0
              OR positionCaseInsensitive(route, {q:String}) > 0
            )
          GROUP BY error_stack_hash, release
          ORDER BY count() DESC
          LIMIT 5
        `,
        query_params: { projectId, env, release, device, country, browser, hours, q },
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            session_id AS session_key,
            argMax(route, timestamp) AS last_route
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ({release:String} = '' OR release = {release:String})
            AND ({device:String} = '' OR device_type = {device:String})
            AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
            AND session_id != ''
            AND (
              positionCaseInsensitive(session_id, {q:String}) > 0
              OR positionCaseInsensitive(route, {q:String}) > 0
            )
          GROUP BY session_id
          ORDER BY max(timestamp) DESC
          LIMIT 5
        `,
        query_params: { projectId, env, release, device, country, browser, hours, q },
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            api_route AS api,
            upper(any(toString(attributes.method))) AS method
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ({release:String} = '' OR release = {release:String})
            AND ({device:String} = '' OR device_type = {device:String})
            AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND event_type = 'api_timing'
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
            AND api_route != ''
            AND positionCaseInsensitive(api_route, {q:String}) > 0
          GROUP BY api_route
          ORDER BY count() DESC
          LIMIT 5
        `,
        query_params: { projectId, env, release, device, country, browser, hours, q },
        format: 'JSONEachRow',
      }),
    ])

    const pages = await pagesResult.json<{ route: string; pv: number }>()
    const errors = await errorsResult.json<{ id: string; message: string; error_route: string }>()
    const sessions = await sessionsResult.json<{ session_key: string; last_route: string }>()
    const apis = await apisResult.json<{ api: string; method: string }>()
    return {
      pages: pages.map((row) => ({ route: row.route, pv: Number(row.pv) })),
      errors: errors.map((row) => ({ id: row.id, message: row.message, route: row.error_route })),
      sessions: sessions.map((row) => ({ id: row.session_key, route: row.last_route })),
      apis: apis.map((row) => ({ api: row.api, method: row.method || 'GET' })),
    }
  }

  private formatDuration(startedAt: string, endedAt: string) {
    const started = Date.parse(startedAt.replace(' ', 'T'));
    const ended = Date.parse(endedAt.replace(' ', 'T'));
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return '—';
    const total = Math.round((ended - started) / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  private describeSessionStep(row: {
    at: string;
    event_type: string;
    route: string;
    metric_name: string;
    metric_value: number;
    duration: number;
    status_code: number;
    error_name: string;
    api_route: string;
    resource_url: string;
    message: string;
    method: string;
    failed: boolean;
    is_timeout: boolean;
  }): SessionStepResult {
    if (row.event_type === 'page_view') {
      return { at: row.at, title: '打开页面', detail: row.route || '—', bad: false };
    }
    if (row.event_type === 'web_vital') {
      const value = formatMetricValue(row.metric_name, Number(row.metric_value));
      return {
        at: row.at,
        title: row.metric_name || '体验指标',
        detail: `${value} · ${row.route || '—'}`,
        bad: !isGoodMetric(row.metric_name, Number(row.metric_value)),
      };
    }
    if (row.event_type === 'error') {
      return {
        at: row.at,
        title: row.error_name || '脚本错误',
        detail: row.message || row.route || '—',
        bad: true,
      };
    }
    if (row.event_type === 'api_timing') {
      const failed = row.status_code >= 400 || row.status_code === 0 || row.is_timeout;
      return {
        at: row.at,
        title: '请求接口',
        detail: `${row.method || 'GET'} ${row.api_route || '—'} · ${Math.round(Number(row.duration))}ms · ${row.status_code}`,
        bad: failed,
      };
    }
    return {
      at: row.at,
      title: '资源失败',
      detail: row.resource_url || row.route || '—',
      bad: true,
    };
  }

  private normalizeResourceType(
    value: string | null,
  ): ResourceRowResult['type'] {
    if (value === 'script' || value === 'js') {
      return 'js';
    }
    if (value === 'css' || value === 'img' || value === 'font') {
      return value;
    }
    return 'other';
  }
}
