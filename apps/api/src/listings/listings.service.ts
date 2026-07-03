import { Injectable } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { isGoodMetric } from '@ai-frontend-monitor/schema';

type PageTrend = 'up' | 'down' | 'flat';
type ErrorKind = 'js' | 'promise' | 'resource';

export interface PageRowResult {
  route: string;
  pv: number;
  affectedUsers: number;
  lcpP75: number;
  inpP75: number;
  clsP75: number;
  jsErrorRate: number;
  apiP95: number;
}

export interface ApiRowResult {
  api: string;
  method: string;
  p95: number;
  p50: number;
  errorRate: number;
  timeoutRate: number;
  qps: number;
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
}

interface RawPageRow {
  route: string;
  pv: number;
  affected_users: number;
  lcp_p75: number | null;
  inp_p75: number | null;
  cls_p75: number | null;
  js_error_rate: number | null;
  api_p95: number | null;
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

  async getPages(projectId: string, env: string): Promise<PageRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          countIf(event_type = 'page_view') AS pv,
          uniqIf(user_id_hash, event_type = 'page_view') AS affected_users,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'INP') AS inp_p75,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'CLS') AS cls_p75,
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS js_error_rate,
          quantileIf(0.95)(duration, event_type = 'api_timing') AS api_p95
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY route
        HAVING pv > 0
        ORDER BY pv DESC
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawPageRow>();

    return rows.map((row) => {
      const lcpP75 = row.lcp_p75 ?? 0;
      const inpP75 = row.inp_p75 ?? 0;
      const clsP75 = row.cls_p75 ?? 0;
      const jsErrorRate = row.js_error_rate ?? 0;
      const apiP95 = row.api_p95 ?? 0;
      const passRate = this.computePagePassRate({
        lcpP75,
        inpP75,
        clsP75,
        jsErrorRate,
        apiP95,
      });

      return {
        route: row.route,
        pv: row.pv,
        affectedUsers: row.affected_users,
        lcpP75: this.roundMetric(lcpP75, 1000),
        inpP75: Math.round(inpP75),
        clsP75: Number(clsP75.toFixed(3)),
        jsErrorRate: Number(jsErrorRate.toFixed(2)),
        apiP95: Math.round(apiP95),
        passRate,
        trend: this.computeTrend(passRate),
      };
    });
  }

  async getApis(projectId: string, env: string): Promise<ApiRowResult[]> {
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
          countIf(length(trace_id) > 0) AS traced_requests
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'api_timing'
          AND timestamp >= now() - INTERVAL 24 HOUR
          AND api_route != ''
        GROUP BY api_route, method
        ORDER BY total_requests DESC, api_route ASC
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawApiRow>();

    return rows.map((row) => ({
      api: row.api,
      method: row.method || 'GET',
      p95: Math.round(row.p95),
      p50: Math.round(row.p50),
      errorRate: Number(row.error_rate.toFixed(2)),
      timeoutRate: Number(row.timeout_rate.toFixed(2)),
      qps: Number((row.total_requests / 86400).toFixed(2)),
      traceCoverage: row.total_requests > 0
        ? Number(((row.traced_requests / row.total_requests) * 100).toFixed(0))
        : 0,
    }));
  }

  async getErrors(projectId: string, env: string): Promise<ErrorRowResult[]> {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          concat('err-', lower(hex(cityHash64(error_stack_hash)))) AS id,
          coalesce(nullIf(argMin(toString(attributes.message), timestamp), ''), any(error_name)) AS message,
          any(toString(attributes.errorType)) AS error_type,
          any(route) AS route,
          any(release) AS release,
          count() AS count,
          uniq(user_id_hash) AS affected_users,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S') AS first_seen,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S') AS last_seen
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'error'
          AND timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY error_stack_hash
        ORDER BY count DESC, last_seen DESC
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });

    const rows = await result.json<RawErrorRow>();

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
    }));
  }

  private computePagePassRate(metrics: {
    lcpP75: number;
    inpP75: number;
    clsP75: number;
    jsErrorRate: number;
    apiP95: number;
  }) {
    const checks = [
      isGoodMetric('LCP', metrics.lcpP75),
      isGoodMetric('INP', metrics.inpP75),
      isGoodMetric('CLS', metrics.clsP75),
      metrics.jsErrorRate <= 0.5,
      metrics.apiP95 <= 800,
    ];

    const passed = checks.filter(Boolean).length;
    return Math.round((passed / checks.length) * 100);
  }

  private computeTrend(passRate: number): PageTrend {
    if (passRate >= 85) {
      return 'down';
    }
    if (passRate >= 70) {
      return 'flat';
    }
    return 'up';
  }

  private roundMetric(value: number, divisor: number) {
    return Number((value / divisor).toFixed(1));
  }

  private normalizeErrorType(value: string | null): ErrorKind {
    if (value === 'promise' || value === 'resource') {
      return value;
    }
    return 'js';
  }
}
