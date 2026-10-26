import { Injectable } from '@nestjs/common';
import type {
  MetricPoint,
  MetricSummary,
  OverviewExperienceItem,
  OverviewMetricCard,
  OverviewPayload,
} from '@ai-frontend-monitor/schema';
import { formatMetricValue } from '@ai-frontend-monitor/schema';
import { createClient } from '@clickhouse/client';
import { AlertsService } from '../alerts/alerts.service';

interface TrendRow {
  minute: string;
  value: number;
}

interface BlankRow {
  win: string;
  settled_sessions: number;
  blank_sessions: number;
}

interface HeadlineRow {
  win: string;
  affected_users: number;
  visitors: number;
  lcp_p75: number | null;
  lcp_count: number;
  api_count: number;
  api_ok: number;
  page_views: number;
}

interface SessionRow {
  win: string;
  sessions: number;
  error_sessions: number;
}

interface RouteStatRow {
  pv: number;
  lcp_p75: number | null;
  lcp_n: number;
  fcp_p75: number | null;
  fcp_n: number;
  inp_p75: number | null;
  inp_n: number;
  cls_p75: number | null;
  cls_n: number;
  ttfb_p75: number | null;
  ttfb_n: number;
  api_count: number;
  api_ok: number;
}

const EMPTY_SUMMARY: MetricSummary = {
  avg: 0,
  p50: 0,
  p75: 0,
  p95: 0,
  count: 0,
};

const ERROR_FREE_TARGET = 99.5;
const API_SUCCESS_TARGET = 99.5;
const BLANK_TARGET = 0.05;
const PASS_TARGET = 75;

@Injectable()
export class OverviewService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  constructor(private readonly alertsService: AlertsService) {}

  async getOverview(projectId: string, env: string, release = '', device = '', country = '', browser = '', hours = 24): Promise<OverviewPayload> {
    const [headlineRows, sessionRows, routeRows, blankRows, lcpTrendRows, inpTrendRows, apiTrendRows, errorTrendRows, activeAlerts, latest] = await Promise.all([
      this.fetchHeadline(projectId, env, release, device, country, browser, hours),
      this.fetchSessions(projectId, env, release, device, country, browser, hours),
      this.fetchRouteStats(projectId, env, release, device, country, browser, hours),
      this.fetchBlankSessions(projectId, env, release, device, country, browser, hours),
      this.fetchVitalTrend(projectId, env, release, device, country, browser, hours, 'LCP'),
      this.fetchVitalTrend(projectId, env, release, device, country, browser, hours, 'INP'),
      this.fetchApiTrend(projectId, env, release, device, country, browser, hours),
      this.fetchErrorTrend(projectId, env, release, device, country, browser, hours),
      this.alertsService.countActive(projectId, env, release).catch(() => 0),
      this.fetchLatestRelease(projectId, env, hours),
    ]);

    const current = this.pickWindow(headlineRows, 'current');
    const previous = this.pickWindow(headlineRows, 'previous');
    const lcpGoodAt = device === 'mobile' ? 3000 : 2500;
    const currentSessions = this.pickWindow(sessionRows, 'current');
    const previousSessions = this.pickWindow(sessionRows, 'previous');
    const currentBlank = this.pickWindow(blankRows, 'current');
    const previousBlank = this.pickWindow(blankRows, 'previous');
    const affectedUsers = this.num(current?.affected_users);

    return {
      health: {
        status: activeAlerts > 0 ? 'warning' : 'healthy',
        activeAlerts,
        affectedUsers,
        latestRelease: latest?.release || '',
        latestReleaseAt: latest?.seen_at || '',
      },
      coreMetrics: this.buildHeadlineCards(current, previous, currentSessions, previousSessions, currentBlank, previousBlank, lcpGoodAt, this.windowText(hours)),
      experience: this.buildExperience(routeRows, lcpGoodAt),
      trendSeries: {
        lcp: { points: this.mapTrendPoints(lcpTrendRows) },
        inp: { points: this.mapTrendPoints(inpTrendRows) },
        apiP95: { points: this.mapTrendPoints(apiTrendRows) },
        jsError: { points: this.mapTrendPoints(errorTrendRows, 2) },
      },
      topProblems: [],
    };
  }

  private async fetchHeadline(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const span = hours * 2
    const result = await this.clickhouse.query({
      query: `
        SELECT
          if(timestamp >= now() - INTERVAL {hours:UInt32} HOUR, 'current', 'previous') AS win,
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
          )) AS affected_users,
          uniqExactIf(user_id_hash, user_id_hash != '') AS visitors,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_count,
          countIf(event_type = 'api_timing') AS api_count,
          countIf(
            event_type = 'api_timing'
            AND status_code >= 200 AND status_code < 400
            AND NOT toBool(attributes.isTimeout)
          ) AS api_ok,
          countIf(event_type = 'page_view') AS page_views
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND timestamp >= now() - INTERVAL {span:UInt32} HOUR
        GROUP BY win
      `,
      query_params: { projectId, env, release, device, country, browser, hours, span },
      format: 'JSONEachRow',
    });

    return result.json<HeadlineRow>();
  }

  private async fetchSessions(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const span = hours * 2
    const result = await this.clickhouse.query({
      query: `
        SELECT
          win,
          count() AS sessions,
          countIf(had_error) AS error_sessions
        FROM (
          SELECT
            session_id,
            if(timestamp >= now() - INTERVAL {hours:UInt32} HOUR, 'current', 'previous') AS win,
            max(event_type = 'error') AS had_error
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND timestamp >= now() - INTERVAL {span:UInt32} HOUR
            AND session_id != ''
          GROUP BY session_id, win
        )
        GROUP BY win
      `,
      query_params: { projectId, env, release, device, country, browser, hours, span },
      format: 'JSONEachRow',
    });

    return result.json<SessionRow>();
  }

  private async fetchRouteStats(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          countIf(event_type = 'page_view') AS pv,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_n,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'FCP') AS fcp_n,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'INP') AS inp_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'INP') AS inp_n,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'CLS') AS cls_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'CLS') AS cls_n,
          quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_p75,
          countIf(event_type = 'web_vital' AND metric_name = 'TTFB') AS ttfb_n,
          countIf(event_type = 'api_timing') AS api_count,
          countIf(
            event_type = 'api_timing'
            AND status_code >= 200 AND status_code < 400
            AND NOT toBool(attributes.isTimeout)
          ) AS api_ok
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY route
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    return result.json<RouteStatRow>();
  }

  private buildHeadlineCards(
    current: HeadlineRow | undefined,
    previous: HeadlineRow | undefined,
    currentSessions: SessionRow | undefined,
    previousSessions: SessionRow | undefined,
    currentBlank: BlankRow | undefined,
    previousBlank: BlankRow | undefined,
    lcpGoodAt: number,
    windowLabel: string,
  ): OverviewMetricCard[] {
    const errorFree = this.rate(
      this.num(currentSessions?.sessions) - this.num(currentSessions?.error_sessions),
      this.num(currentSessions?.sessions),
    );
    const errorFreePrev = this.rate(
      this.num(previousSessions?.sessions) - this.num(previousSessions?.error_sessions),
      this.num(previousSessions?.sessions),
    );
    const affected = this.num(current?.affected_users);
    const affectedPrev = this.num(previous?.affected_users);
    const visitors = this.num(current?.visitors);
    const visitorsPrev = this.num(previous?.visitors);
    const lcp = this.sample(current?.lcp_count, current?.lcp_p75);
    const lcpPrev = this.sample(previous?.lcp_count, previous?.lcp_p75);
    const apiSuccess = this.rate(current?.api_ok, current?.api_count);
    const apiSuccessPrev = this.rate(previous?.api_ok, previous?.api_count);
    const blank = this.rate(currentBlank?.blank_sessions, currentBlank?.settled_sessions);
    const blankPrev = this.rate(previousBlank?.blank_sessions, previousBlank?.settled_sessions);

    return [
      this.rateCard('error_free_session', '无错误会话率', errorFree, errorFreePrev, ERROR_FREE_TARGET, true, '目标 99.5%', 1),
      this.volumeCard('visitors', '独立用户', visitors, visitorsPrev, `${windowLabel}去重`),
      this.countCard('affected_users', '受影响用户', affected, affectedPrev, '当前活跃问题'),
      this.durationCard('lcp_p75', 'P75 LCP', lcp, lcpPrev, lcpGoodAt, lcpGoodAt === 3000 ? '手机良好线 3.0s' : '良好线 2.5s'),
      this.rateCard('api_success', 'API 成功率', apiSuccess, apiSuccessPrev, API_SUCCESS_TARGET, true, '目标 99.5%', 2),
      this.rateCard('blank_rate', '白屏率', blank, blankPrev, BLANK_TARGET, false, '目标 < 0.05%', 2),
    ];
  }

  private buildExperience(rows: RouteStatRow[], lcpGoodAt: number): OverviewExperienceItem[] {
    const apiCount = rows.reduce((sum, row) => sum + this.num(row.api_count), 0);
    const apiOk = rows.reduce((sum, row) => sum + this.num(row.api_ok), 0);
    return [
      this.passItem('LCP 达标率', rows, 'lcp_p75', 'lcp_n', lcpGoodAt),
      this.passItem('FCP 达标率', rows, 'fcp_p75', 'fcp_n', 1800),
      this.passItem('INP 达标率', rows, 'inp_p75', 'inp_n', 200),
      this.passItem('CLS 达标率', rows, 'cls_p75', 'cls_n', 0.1),
      this.passItem('TTFB 达标率', rows, 'ttfb_p75', 'ttfb_n', 800),
      this.rateItem('请求成功率', this.rate(apiOk, apiCount), API_SUCCESS_TARGET),
    ];
  }

  private passItem(
    name: string,
    rows: RouteStatRow[],
    p75Key: 'lcp_p75' | 'fcp_p75' | 'inp_p75' | 'cls_p75' | 'ttfb_p75',
    countKey: 'lcp_n' | 'fcp_n' | 'inp_n' | 'cls_n' | 'ttfb_n',
    goodAt: number,
  ): OverviewExperienceItem {
    const usable = rows.filter((row) => this.num(row[countKey]) > 0 && Number.isFinite(this.num(row[p75Key])));
    if (!usable.length) {
      return { name, value: null, note: '暂无样本', warn: false };
    }
    const weight = (row: RouteStatRow) => (this.num(row.pv) > 0 ? this.num(row.pv) : this.num(row[countKey]));
    const total = usable.reduce((sum, row) => sum + weight(row), 0);
    const good = usable
      .filter((row) => this.num(row[p75Key]) <= goodAt)
      .reduce((sum, row) => sum + weight(row), 0);
    const value = Math.round((good / total) * 1000) / 10;
    return {
      name,
      value,
      note: value >= PASS_TARGET ? '良好' : '待优化',
      warn: value < PASS_TARGET,
    };
  }

  private rateItem(name: string, value: number | null, target: number): OverviewExperienceItem {
    if (value == null) {
      return { name, value: null, note: '暂无样本', warn: false };
    }
    return {
      name,
      value: Math.round(value * 10) / 10,
      note: value >= target ? '良好' : '待优化',
      warn: value < target,
    };
  }

  private rateCard(
    key: string,
    label: string,
    value: number | null,
    previous: number | null,
    target: number,
    higherIsBetter: boolean,
    hint: string,
    digits: number,
  ): OverviewMetricCard {
    const delta = this.pointDelta(value, previous);
    return {
      key,
      label,
      value: value == null ? '—' : `${value.toFixed(digits)}%`,
      delta: delta.text,
      deltaDir: delta.dir,
      ...(value == null ? {} : { good: higherIsBetter ? value >= target : value <= target }),
      hint,
      summary: { ...EMPTY_SUMMARY, count: value == null ? 0 : 1, avg: value ?? 0 },
    };
  }

  private volumeCard(
    key: string,
    label: string,
    value: number,
    previous: number,
    hint: string,
  ): OverviewMetricCard {
    const delta = this.countDelta(value, previous);
    return {
      key,
      label,
      value: value.toLocaleString('en-US'),
      delta: delta.text,
      deltaDir: delta.dir,
      hint,
      summary: { ...EMPTY_SUMMARY, count: value, avg: value },
    };
  }

  private countCard(
    key: string,
    label: string,
    value: number,
    previous: number,
    hint: string,
  ): OverviewMetricCard {
    const delta = this.countDelta(value, previous);
    return {
      key,
      label,
      value: value.toLocaleString('en-US'),
      delta: delta.text,
      deltaDir: delta.dir,
      good: delta.dir !== 'up',
      hint,
      summary: { ...EMPTY_SUMMARY, count: value, avg: value },
    };
  }

  private durationCard(
    key: string,
    label: string,
    value: number | null,
    previous: number | null,
    goodAt: number,
    hint: string,
  ): OverviewMetricCard {
    const delta = this.durationDelta(value, previous);
    return {
      key,
      label,
      value: value == null ? '—' : formatMetricValue('LCP', value),
      delta: delta.text,
      deltaDir: delta.dir,
      ...(value == null ? {} : { good: value <= goodAt }),
      hint,
      summary: { ...EMPTY_SUMMARY, count: value == null ? 0 : 1, p75: value ?? 0, avg: value ?? 0 },
    };
  }

  private pointDelta(value: number | null, previous: number | null) {
    if (value == null || previous == null) {
      return { text: '—', dir: 'flat' as const };
    }
    const diff = Math.round((value - previous) * 10) / 10;
    if (diff === 0) return { text: '持平', dir: 'flat' as const };
    const text = `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`;
    return { text, dir: diff > 0 ? 'up' as const : 'down' as const };
  }

  private countDelta(value: number, previous: number) {
    if (previous <= 0) {
      if (value <= 0) return { text: '持平', dir: 'flat' as const };
      return { text: `+${value.toLocaleString('en-US')}`, dir: 'up' as const };
    }
    const diff = Math.round(((value - previous) / previous) * 1000) / 10;
    if (diff === 0) return { text: '持平', dir: 'flat' as const };
    return {
      text: `${diff > 0 ? '+' : ''}${diff}%`,
      dir: diff > 0 ? 'up' as const : 'down' as const,
    };
  }

  private durationDelta(value: number | null, previous: number | null) {
    if (value == null || previous == null) {
      return { text: '—', dir: 'flat' as const };
    }
    const diff = value - previous;
    if (Math.abs(diff) < 50) return { text: '持平', dir: 'flat' as const };
    const text = diff >= 1000 || previous >= 1000
      ? `${diff > 0 ? '+' : ''}${(diff / 1000).toFixed(1)}s`
      : `${diff > 0 ? '+' : ''}${Math.round(diff)}ms`;
    return { text, dir: diff > 0 ? 'up' as const : 'down' as const };
  }

  private rate(part: number | null | undefined, total: number | null | undefined) {
    const denominator = this.num(total);
    if (denominator <= 0) return null;
    return (this.num(part) / denominator) * 100;
  }

  private sample(count: number | null | undefined, value: number | null | undefined) {
    if (this.num(count) <= 0) return null;
    const numeric = this.num(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private pickWindow<T extends { win: string }>(rows: T[], win: string) {
    return rows.find((row) => row.win === win);
  }

  private num(value: number | null | undefined) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private async fetchLatestRelease(projectId: string, env: string, hours = 24) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          argMax(release, timestamp) AS latest_release,
          formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S') AS seen_at
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND release != ''
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
      `,
      query_params: { projectId, env, hours },
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ latest_release: string; seen_at: string }>();
    const row = rows[0];
    return row ? { release: row.latest_release, seen_at: row.seen_at } : undefined;
  }

  private async fetchBlankSessions(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const span = hours * 2
    const result = await this.clickhouse.query({
      query: `
        SELECT
          win,
          count() AS settled_sessions,
          countIf(painted = 0) AS blank_sessions
        FROM (
          SELECT
            session_id,
            if(min(timestamp) >= now() - INTERVAL {hours:UInt32} HOUR, 'current', 'previous') AS win,
            max(event_type = 'web_vital' AND metric_name IN ('LCP', 'FCP') AND metric_value > 0) AS painted,
            max(timestamp) AS last_ts
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
            AND timestamp >= now() - INTERVAL {span:UInt32} HOUR
            AND session_id != ''
          GROUP BY session_id
          HAVING countIf(event_type = 'page_view') > 0
            AND last_ts <= now() - INTERVAL 1 MINUTE
        )
        GROUP BY win
      `,
      query_params: { projectId, env, release, device, country, browser, hours, span },
      format: 'JSONEachRow',
    });

    return result.json<BlankRow>();
  }

  private async fetchVitalTrend(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24, metricName = '') {
    const grain = this.trendGrain(hours)
    const result = await this.clickhouse.query({
      query: `
        SELECT
          formatDateTime(${grain.expr}, '${grain.format}') AS minute,
          quantile(0.75)(metric_value) AS value
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'web_vital'
          AND metric_name = {metricName:String}
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY ${grain.expr}
        ORDER BY ${grain.expr} ASC
      `,
      query_params: { projectId, env, release, device, country, browser, hours, metricName },
      format: 'JSONEachRow',
    });

    return result.json<TrendRow>();
  }

  private async fetchApiTrend(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const grain = this.trendGrain(hours)
    const result = await this.clickhouse.query({
      query: `
        SELECT
          formatDateTime(${grain.expr}, '${grain.format}') AS minute,
          quantile(0.95)(duration) AS value
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type = 'api_timing'
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY ${grain.expr}
        ORDER BY ${grain.expr} ASC
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    return result.json<TrendRow>();
  }

  private async fetchErrorTrend(projectId: string, env: string, release: string, device = '', country = '', browser = '', hours = 24) {
    const grain = this.trendGrain(hours)
    const result = await this.clickhouse.query({
      query: `
        SELECT
          formatDateTime(${grain.expr}, '${grain.format}') AS minute,
          (countIf(event_type = 'error') / nullIf(countIf(event_type = 'page_view'), 0)) * 100 AS value
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND ({release:String} = '' OR release = {release:String})
          AND ({device:String} = '' OR device_type = {device:String})
          AND ({country:String} = '' OR country = {country:String})
          AND ({browser:String} = '' OR browser = {browser:String})
          AND event_type IN ('error', 'page_view')
          AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
        GROUP BY ${grain.expr}
        HAVING countIf(event_type = 'page_view') > 0
        ORDER BY ${grain.expr} ASC
      `,
      query_params: { projectId, env, release, device, country, browser, hours },
      format: 'JSONEachRow',
    });

    return result.json<TrendRow>();
  }

  private windowText(hours: number) {
    if (hours >= 720) return '近 30 天';
    if (hours >= 168) return '近 7 天';
    return '近 24 小时';
  }

  private trendGrain(hours: number) {
    if (hours >= 720) return { expr: 'toStartOfDay(timestamp)', format: '%m-%d' };
    if (hours > 24) return { expr: 'toStartOfHour(timestamp)', format: '%m-%d %H:00' };
    return { expr: 'toStartOfMinute(timestamp)', format: '%Y-%m-%d %H:%i:%S' };
  }

  private mapTrendPoints(rows: TrendRow[], digits = 0): MetricPoint[] {
    const factor = 10 ** digits;
    return rows.map((row) => ({
      timestamp: row.minute,
      value: Math.round(Number(row.value) * factor) / factor,
    }));
  }

}
