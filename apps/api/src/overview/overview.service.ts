import { Injectable } from '@nestjs/common';
import type {
  MetricPoint,
  MetricSummary,
  OverviewMetricCard,
  OverviewPayload,
} from '@ai-frontend-monitor/schema';
import { formatMetricValue, isGoodMetric } from '@ai-frontend-monitor/schema';
import { createClient } from '@clickhouse/client';

interface MetricRow {
  metric_name: string;
  avg_value: number;
  p50_value: number;
  p75_value: number;
  p95_value: number;
  sample_count: number;
}

interface TrendRow {
  minute: string;
  p75_value: number;
}

@Injectable()
export class OverviewService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  async getOverview(projectId: string, env: string): Promise<OverviewPayload> {
    const [metricRows, lcpTrendRows] = await Promise.all([
      this.fetchMetricRows(projectId, env),
      this.fetchTrendRows(projectId, env, 'LCP'),
    ]);

    return {
      health: {
        status: metricRows.length > 0 ? 'warning' : 'healthy',
        activeAlerts: 0,
        affectedUsers: 0,
        latestRelease: 'v0.1.0',
        latestReleaseAt: new Date().toISOString(),
      },
      coreMetrics: this.buildCoreMetrics(metricRows),
      trendSeries: {
        lcp: { points: this.mapTrendPoints(lcpTrendRows) },
        inp: { points: [] },
        apiP95: { points: [] },
        jsError: { points: [] },
      },
      topProblems: [],
    };
  }

  private async fetchMetricRows(projectId: string, env: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          metric_name,
          avg(metric_value) AS avg_value,
          quantile(0.5)(metric_value) AS p50_value,
          quantile(0.75)(metric_value) AS p75_value,
          quantile(0.95)(metric_value) AS p95_value,
          count() AS sample_count
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'web_vital'
        GROUP BY metric_name
        ORDER BY metric_name ASC
      `,
      query_params: {
        projectId,
        env,
      },
      format: 'JSONEachRow',
    });

    return result.json<MetricRow>();
  }

  private async fetchTrendRows(projectId: string, env: string, metricName: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          formatDateTime(toStartOfMinute(timestamp), '%Y-%m-%d %H:%i:%S') AS minute,
          quantile(0.75)(metric_value) AS p75_value
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'web_vital'
          AND metric_name = {metricName:String}
        GROUP BY toStartOfMinute(timestamp)
        ORDER BY toStartOfMinute(timestamp) ASC
      `,
      query_params: {
        projectId,
        env,
        metricName,
      },
      format: 'JSONEachRow',
    });

    return result.json<TrendRow>();
  }

  private buildCoreMetrics(rows: MetricRow[]): OverviewMetricCard[] {
    return rows.map((row) => ({
      key: row.metric_name.toLowerCase(),
      label: `${row.metric_name} P75`,
      value: this.formatMetricValue(row.metric_name, row.p75_value),
      delta: '--',
      deltaDir: 'flat',
      good: this.isGoodMetric(row.metric_name, row.p75_value),
      summary: this.mapSummary(row),
    }));
  }

  private mapSummary(row: MetricRow): MetricSummary {
    return {
      avg: row.avg_value,
      p50: row.p50_value,
      p75: row.p75_value,
      p95: row.p95_value,
      count: row.sample_count,
    };
  }

  private mapTrendPoints(rows: TrendRow[]): MetricPoint[] {
    return rows.map((row) => ({
      timestamp: row.minute,
      value: row.p75_value,
    }));
  }

  private formatMetricValue(metricName: string, value: number) {
    return formatMetricValue(metricName, value);
  }

  private isGoodMetric(metricName: string, value: number) {
    return isGoodMetric(metricName, value);
  }
}
