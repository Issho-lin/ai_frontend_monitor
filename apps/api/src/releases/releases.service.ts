import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { PostgresService } from '../alerts/postgres.service';

export interface ReleaseRowResult {
  id: string;
  version: string;
  env: string;
  releasedAt: string;
  releasedBy: string;
  commit: string;
  grayscale: string;
  status: 'released' | 'rolling' | 'rolledback';
  activeAlerts: number;
  perfShift: string;
  perfDir: 'up' | 'down' | 'flat';
}

export interface ReleaseDetailResult {
  release: ReleaseRowResult;
  diff: {
    version: string;
    compareTo: string;
    metrics: {
      metric: string;
      unit: string;
      before: number | null;
      after: number | null;
      changePct: number | null;
      bad: boolean;
    }[];
    pages: {
      route: string;
      metric: string;
      before: number | null;
      after: number | null;
      unit: string;
      changePct: number | null;
    }[];
    resources: {
      url: string;
      kind: 'added' | 'removed' | 'changed';
      sizeBefore: number;
      sizeAfter: number;
      chunk: string;
    }[];
    errors: {
      id: string;
      message: string;
      kind: 'new' | 'gone' | 'changed';
      countBefore: number;
      countAfter: number;
    }[];
    apis: {
      api: string;
      kind: 'new' | 'changed';
      p95Before: number | null;
      p95After: number | null;
    }[];
    alerts: {
      id: string;
      title: string;
      severity: string;
      route: string;
      metric: string;
      triggerValue: string;
    }[];
  };
}

interface ReleaseAggRow {
  version: string;
  env: string;
  first_seen: string;
  lcp_p75: number | null;
}

interface MetricBundleRow {
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  api_p95: number | null;
  js_error_rate: number | null;
  lcp_n: number;
  inp_n: number;
  cls_n: number;
  api_n: number;
  pv_n: number;
}

interface PageLcpRow {
  route: string;
  lcp: number | null;
  lcp_n: number;
}

interface ResourceRow {
  url: string;
  size: number;
}

interface ErrorRow {
  id: string;
  hash: string;
  message: string;
  cnt: number;
}

interface ApiRow {
  api: string;
  p95: number;
}

@Injectable()
export class ReleasesService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  constructor(private readonly postgres: PostgresService) {}

  async list(projectId: string): Promise<ReleaseRowResult[]> {
    const [rows, alertCounts] = await Promise.all([
      this.fetchReleaseAggs(projectId),
      this.fetchAlertCounts(projectId),
    ]);

    const newestFirst = [...rows].sort(
      (a, b) => new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime(),
    );

    return newestFirst.map((row) => {
      const older = newestFirst.find(
        (item) =>
          item.env === row.env &&
          new Date(item.first_seen).getTime() < new Date(row.first_seen).getTime(),
      );
      const after = this.toSeconds(row.lcp_p75);
      const before = this.toSeconds(older?.lcp_p75 ?? null);
      const { shift, dir } = this.lcpShift(before, after);
      return {
        id: this.releaseId(`${row.env}:${row.version}`),
        version: row.version,
        env: row.env || 'production',
        releasedAt: this.formatTime(row.first_seen),
        releasedBy: 'SDK 上报',
        commit: '—',
        grayscale: '100%',
        status: 'released' as const,
        activeAlerts: alertCounts.get(`${row.version}|${row.env}`) ?? 0,
        perfShift: shift,
        perfDir: dir,
      };
    });
  }

  async getDetail(
    projectId: string,
    version: string,
    env?: string,
  ): Promise<ReleaseDetailResult> {
    const releases = await this.list(projectId);
    const release = releases.find(
      (item) =>
        item.version === version && (!env || item.env === env),
    );
    if (!release) {
      throw new NotFoundException(`Release ${version} not found`);
    }

    const older = this.findPrevious(releases, release);
    const compareTo = older?.version ?? '';
    const releaseEnv = release.env;
    const [after, before, pagesAfter, pagesBefore, resAfter, resBefore, errAfter, errBefore, apiAfter, apiBefore, alerts] =
      await Promise.all([
        this.fetchMetrics(projectId, releaseEnv, version),
        compareTo ? this.fetchMetrics(projectId, releaseEnv, compareTo) : Promise.resolve(null),
        this.fetchPageLcp(projectId, releaseEnv, version),
        compareTo ? this.fetchPageLcp(projectId, releaseEnv, compareTo) : Promise.resolve([]),
        this.fetchResources(projectId, releaseEnv, version),
        compareTo ? this.fetchResources(projectId, releaseEnv, compareTo) : Promise.resolve([]),
        this.fetchErrors(projectId, releaseEnv, version),
        compareTo ? this.fetchErrors(projectId, releaseEnv, compareTo) : Promise.resolve([]),
        this.fetchApis(projectId, releaseEnv, version),
        compareTo ? this.fetchApis(projectId, releaseEnv, compareTo) : Promise.resolve([]),
        this.fetchAlerts(projectId, releaseEnv, version),
      ]);

    return {
      release,
      diff: {
        version,
        compareTo: compareTo || '—',
        metrics: this.buildMetrics(before, after),
        pages: this.buildPages(pagesBefore, pagesAfter),
        resources: this.buildResources(resBefore, resAfter),
        errors: this.buildErrors(errBefore, errAfter),
        apis: this.buildApis(apiBefore, apiAfter),
        alerts,
      },
    };
  }

  private async fetchReleaseAggs(projectId: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          release AS version,
          env,
          formatDateTime(min(timestamp), '%Y-%m-%d %H:%i:%S') AS first_seen,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND release != ''
        GROUP BY release, env
        ORDER BY min(timestamp) DESC
      `,
      query_params: { projectId },
      format: 'JSONEachRow',
    });
    return result.json<ReleaseAggRow>();
  }

  private async fetchAlertCounts(projectId: string) {
    const result = await this.postgres.query<{ release: string; env: string; count: number }>(
      `
        SELECT release, env, count(*)::int AS count
        FROM alerts
        WHERE project_id = $1
          AND status IN ('firing', 'acknowledged')
          AND release != ''
        GROUP BY release, env
      `,
      [projectId],
    );
    return new Map(result.rows.map((row) => [`${row.release}|${row.env}`, row.count]));
  }

  private async fetchAlerts(projectId: string, env: string, version: string) {
    const result = await this.postgres.query<{
      id: string;
      title: string;
      severity: string;
      route: string;
      metric: string;
      trigger_value: string;
    }>(
      `
        SELECT id, title, severity, route, metric, trigger_value
        FROM alerts
        WHERE project_id = $1 AND env = $2 AND release = $3
        ORDER BY last_seen DESC
        LIMIT 20
      `,
      [projectId, env, version],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      route: row.route,
      metric: row.metric,
      triggerValue: row.trigger_value,
    }));
  }

  private async fetchMetrics(projectId: string, env: string, version: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'INP') AS inp,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'CLS') AS cls,
          quantileIf(0.95)(duration, event_type = 'api_timing') AS api_p95,
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS js_error_rate,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'INP') AS inp_n,
          countIf(event_type = 'web_vital' AND metric_name = 'CLS') AS cls_n,
          countIf(event_type = 'api_timing') AS api_n,
          countIf(event_type = 'page_view') AS pv_n
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
      `,
      query_params: { projectId, env, version },
      format: 'JSONEachRow',
    });
    const rows = await result.json<MetricBundleRow>();
    return rows[0] ?? null;
  }

  private async fetchPageLcp(projectId: string, env: string, version: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_n
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
          AND route != ''
        GROUP BY route
        HAVING lcp_n > 0
        ORDER BY lcp DESC
        LIMIT 10
      `,
      query_params: { projectId, env, version },
      format: 'JSONEachRow',
    });
    return result.json<PageLcpRow>();
  }

  private async fetchResources(projectId: string, env: string, version: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          resource_url AS url,
          avg(resource_size) AS size
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
          AND event_type = 'resource_timing'
          AND resource_url != ''
        GROUP BY resource_url
        ORDER BY size DESC
        LIMIT 30
      `,
      query_params: { projectId, env, version },
      format: 'JSONEachRow',
    });
    return result.json<ResourceRow>();
  }

  private async fetchErrors(projectId: string, env: string, version: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          concat('err-', lower(hex(cityHash64(concat(error_stack_hash, {version:String}))))) AS id,
          error_stack_hash AS hash,
          coalesce(nullIf(argMin(toString(attributes.message), timestamp), ''), any(error_name)) AS message,
          count() AS cnt
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
          AND event_type = 'error'
        GROUP BY error_stack_hash
        ORDER BY cnt DESC
        LIMIT 20
      `,
      query_params: { projectId, env, version },
      format: 'JSONEachRow',
    });
    return result.json<ErrorRow>();
  }

  private async fetchApis(projectId: string, env: string, version: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          api_route AS api,
          quantile(0.95)(duration) AS p95
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
          AND event_type = 'api_timing'
          AND api_route != ''
        GROUP BY api_route
        ORDER BY p95 DESC
        LIMIT 20
      `,
      query_params: { projectId, env, version },
      format: 'JSONEachRow',
    });
    return result.json<ApiRow>();
  }

  private buildMetrics(before: MetricBundleRow | null, after: MetricBundleRow | null) {
    const pairs: { metric: string; unit: string; before: number | null; after: number | null }[] = [
      {
        metric: 'LCP P75',
        unit: 's',
        before: this.metricValue(before, 'lcp', 'lcp_n', 1000),
        after: this.metricValue(after, 'lcp', 'lcp_n', 1000),
      },
      {
        metric: 'INP P75',
        unit: 'ms',
        before: this.metricValue(before, 'inp', 'inp_n', 1),
        after: this.metricValue(after, 'inp', 'inp_n', 1),
      },
      {
        metric: 'CLS P75',
        unit: '',
        before: this.metricValue(before, 'cls', 'cls_n', 1),
        after: this.metricValue(after, 'cls', 'cls_n', 1),
      },
      {
        metric: 'API P95',
        unit: 'ms',
        before: this.metricValue(before, 'api_p95', 'api_n', 1),
        after: this.metricValue(after, 'api_p95', 'api_n', 1),
      },
      {
        metric: 'JS Error Rate',
        unit: '%',
        before: this.errorRate(before),
        after: this.errorRate(after),
      },
    ];

    return pairs
      .filter((item) => item.before != null || item.after != null)
      .map((item) => {
        const changePct = this.changePct(item.before, item.after);
        return {
          metric: item.metric,
          unit: item.unit,
          before: item.before,
          after: item.after,
          changePct,
          bad: changePct != null && changePct > 5,
        };
      });
  }

  private buildPages(before: PageLcpRow[], after: PageLcpRow[]) {
    const beforeMap = new Map(before.map((row) => [row.route, this.metricSeconds(row.lcp, row.lcp_n)]));
    const afterMap = new Map(after.map((row) => [row.route, this.metricSeconds(row.lcp, row.lcp_n)]));
    const routes = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    return [...routes]
      .map((route) => {
        const beforeValue = beforeMap.get(route) ?? null;
        const afterValue = afterMap.get(route) ?? null;
        return {
          route,
          metric: 'LCP P75',
          before: beforeValue,
          after: afterValue,
          unit: 's',
          changePct: this.changePct(beforeValue, afterValue),
        };
      })
      .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
      .slice(0, 8);
  }

  private buildResources(before: ResourceRow[], after: ResourceRow[]) {
    const beforeMap = new Map(before.map((row) => [row.url, Math.round(row.size)]));
    const afterMap = new Map(after.map((row) => [row.url, Math.round(row.size)]));
    const urls = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const rows: ReleaseDetailResult['diff']['resources'] = [];
    for (const url of urls) {
      const sizeBefore = beforeMap.get(url) ?? 0;
      const sizeAfter = afterMap.get(url) ?? 0;
      let kind: 'added' | 'removed' | 'changed' = 'changed';
      if (!beforeMap.has(url)) kind = 'added';
      else if (!afterMap.has(url)) kind = 'removed';
      else if (Math.abs(sizeAfter - sizeBefore) < 1024) continue;
      rows.push({ url, kind, sizeBefore, sizeAfter, chunk: '' });
    }
    return rows.slice(0, 10);
  }

  private buildErrors(before: ErrorRow[], after: ErrorRow[]) {
    const beforeMap = new Map(before.map((row) => [row.hash, row]));
    const afterMap = new Map(after.map((row) => [row.hash, row]));
    const hashes = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const rows: ReleaseDetailResult['diff']['errors'] = [];
    for (const hash of hashes) {
      const prev = beforeMap.get(hash);
      const next = afterMap.get(hash);
      let kind: 'new' | 'gone' | 'changed' = 'changed';
      if (!prev) kind = 'new';
      else if (!next) kind = 'gone';
      rows.push({
        id: next?.id || prev?.id || hash,
        message: next?.message || prev?.message || hash,
        kind,
        countBefore: prev?.cnt ?? 0,
        countAfter: next?.cnt ?? 0,
      });
    }
    return rows.sort((a, b) => b.countAfter + b.countBefore - (a.countAfter + a.countBefore)).slice(0, 8);
  }

  private buildApis(before: ApiRow[], after: ApiRow[]) {
    const beforeMap = new Map(before.map((row) => [row.api, Math.round(row.p95)]));
    const afterMap = new Map(after.map((row) => [row.api, Math.round(row.p95)]));
    const apis = new Set([...beforeMap.keys(), ...afterMap.keys()]);
    const rows: ReleaseDetailResult['diff']['apis'] = [];
    for (const api of apis) {
      const p95Before = beforeMap.has(api) ? beforeMap.get(api)! : null;
      const p95After = afterMap.has(api) ? afterMap.get(api)! : null;
      if (p95Before != null && p95After != null && Math.abs(p95After - p95Before) < 20) continue;
      rows.push({
        api,
        kind: p95Before == null ? 'new' : 'changed',
        p95Before,
        p95After,
      });
    }
    return rows.slice(0, 8);
  }

  private findPrevious(newestFirst: ReleaseRowResult[], current: ReleaseRowResult) {
    const sameEnv = newestFirst.filter((item) => item.env === current.env);
    const index = sameEnv.findIndex(
      (item) => item.version === current.version && item.env === current.env,
    );
    return index >= 0 ? sameEnv[index + 1] : undefined;
  }

  private lcpShift(before: number, after: number) {
    if (!before || !after) {
      return { shift: '—', dir: 'flat' as const };
    }
    const pct = this.changePct(before, after);
    if (pct == null || Math.abs(pct) < 5) {
      return { shift: '基本持平', dir: 'flat' as const };
    }
    const sign = pct > 0 ? '+' : '';
    return {
      shift: `LCP ${sign}${pct}%`,
      dir: (pct > 0 ? 'up' : 'down') as 'up' | 'down',
    };
  }

  private changePct(before: number | null, after: number | null) {
    if (before == null || after == null || before === 0) return null;
    return Number((((after - before) / before) * 100).toFixed(1));
  }

  private metricValue(
    row: MetricBundleRow | null,
    valueKey: 'lcp' | 'inp' | 'cls' | 'api_p95',
    countKey: 'lcp_n' | 'inp_n' | 'cls_n' | 'api_n',
    scale: number,
  ) {
    if (!row || !Number.isFinite(Number(row[countKey])) || Number(row[countKey]) <= 0) return null;
    const numeric = Number(row[valueKey]);
    if (!Number.isFinite(numeric)) return null;
    const value = scale === 1000 ? numeric / 1000 : numeric;
    const digits = valueKey === 'cls' ? 3 : scale === 1000 ? 1 : 0;
    return Number(value.toFixed(digits));
  }

  private metricSeconds(ms: number | null, count: number) {
    if (!Number.isFinite(Number(count)) || Number(count) <= 0) return null;
    const numeric = Number(ms);
    if (!Number.isFinite(numeric)) return null;
    return Number((numeric / 1000).toFixed(1));
  }

  private errorRate(row: MetricBundleRow | null) {
    if (!row || !Number.isFinite(Number(row.pv_n)) || Number(row.pv_n) <= 0) return null;
    const numeric = Number(row.js_error_rate);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
  }

  private toSeconds(ms: number | null | undefined) {
    if (ms == null || Number.isNaN(Number(ms)) || Number(ms) === 0) {
      return 0;
    }
    return Number((Number(ms) / 1000).toFixed(1));
  }

  private releaseId(version: string) {
    return `rel-${createHash('sha1').update(version).digest('hex').slice(0, 8)}`;
  }

  private formatTime(value: string) {
    return value.replace('T', ' ').slice(0, 16);
  }
}
