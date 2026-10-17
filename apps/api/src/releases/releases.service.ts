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
      before: number;
      after: number;
      changePct: number;
      bad: boolean;
    }[];
    pages: {
      route: string;
      metric: string;
      before: number;
      after: number;
      unit: string;
      changePct: number;
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
      p95Before: number;
      p95After: number;
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
}

interface PageLcpRow {
  route: string;
  lcp: number | null;
}

interface ResourceRow {
  url: string;
  size: number;
}

interface ErrorRow {
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
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS js_error_rate
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
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release = {version:String}
          AND route != ''
        GROUP BY route
        HAVING lcp > 0
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
    const pairs: { metric: string; unit: string; beforeRaw: number; afterRaw: number; scale: number; badIfUp: boolean }[] = [
      { metric: 'LCP P75', unit: 's', beforeRaw: before?.lcp ?? 0, afterRaw: after?.lcp ?? 0, scale: 1000, badIfUp: true },
      { metric: 'INP P75', unit: 'ms', beforeRaw: before?.inp ?? 0, afterRaw: after?.inp ?? 0, scale: 1, badIfUp: true },
      { metric: 'CLS P75', unit: '', beforeRaw: before?.cls ?? 0, afterRaw: after?.cls ?? 0, scale: 1, badIfUp: true },
      { metric: 'API P95', unit: 'ms', beforeRaw: before?.api_p95 ?? 0, afterRaw: after?.api_p95 ?? 0, scale: 1, badIfUp: true },
      { metric: 'JS Error Rate', unit: '%', beforeRaw: before?.js_error_rate ?? 0, afterRaw: after?.js_error_rate ?? 0, scale: 1, badIfUp: true },
    ];

    return pairs.map((item) => {
      const beforeValue = item.scale === 1000 ? this.toSeconds(item.beforeRaw) : this.round(item.beforeRaw, item.unit === '' ? 3 : 1);
      const afterValue = item.scale === 1000 ? this.toSeconds(item.afterRaw) : this.round(item.afterRaw, item.unit === '' ? 3 : 1);
      const changePct = this.changePct(beforeValue, afterValue);
      return {
        metric: item.metric,
        unit: item.unit,
        before: beforeValue,
        after: afterValue,
        changePct,
        bad: item.badIfUp ? changePct > 5 : changePct < -5,
      };
    });
  }

  private buildPages(before: PageLcpRow[], after: PageLcpRow[]) {
    const beforeMap = new Map(before.map((row) => [row.route, this.toSeconds(row.lcp)]));
    const routes = new Set([...before.map((row) => row.route), ...after.map((row) => row.route)]);
    return [...routes]
      .map((route) => {
        const beforeValue = beforeMap.get(route) ?? 0;
        const afterValue = this.toSeconds(after.find((row) => row.route === route)?.lcp ?? null);
        return {
          route,
          metric: 'LCP P75',
          before: beforeValue,
          after: afterValue,
          unit: 's',
          changePct: this.changePct(beforeValue, afterValue),
        };
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
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
        id: hash.slice(0, 10),
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
      const p95Before = beforeMap.get(api) ?? 0;
      const p95After = afterMap.get(api) ?? 0;
      if (beforeMap.has(api) && Math.abs(p95After - p95Before) < 20) continue;
      rows.push({
        api,
        kind: beforeMap.has(api) ? 'changed' : 'new',
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
    if (Math.abs(pct) < 5) {
      return { shift: '基本持平', dir: 'flat' as const };
    }
    const sign = pct > 0 ? '+' : '';
    return {
      shift: `LCP ${sign}${pct}%`,
      dir: (pct > 0 ? 'up' : 'down') as 'up' | 'down',
    };
  }

  private changePct(before: number, after: number) {
    if (!before) {
      return after ? 100 : 0;
    }
    return Number((((after - before) / before) * 100).toFixed(1));
  }

  private toSeconds(ms: number | null | undefined) {
    if (ms == null || Number.isNaN(Number(ms)) || Number(ms) === 0) {
      return 0;
    }
    return Number((Number(ms) / 1000).toFixed(1));
  }

  private round(value: number, digits: number) {
    return Number(Number(value || 0).toFixed(digits));
  }

  private releaseId(version: string) {
    return `rel-${createHash('sha1').update(version).digest('hex').slice(0, 8)}`;
  }

  private formatTime(value: string) {
    return value.replace('T', ' ').slice(0, 16);
  }
}
