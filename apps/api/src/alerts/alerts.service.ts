import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { formatMetricValue, METRIC_SPECS } from '@ai-frontend-monitor/schema';
import { NotifyService } from './notify.service';
import { PostgresService } from './postgres.service';

type Severity = 'S0' | 'S1' | 'S2' | 'S3';
type AlertStatus = 'firing' | 'acknowledged' | 'resolved' | 'silenced';

export interface AlertRowResult {
  id: string;
  title: string;
  severity: Severity;
  status: AlertStatus;
  route: string;
  metric: string;
  triggerValue: string;
  baseline: string;
  affectedUsers: number;
  firstSeen: string;
  lastSeen: string;
  release: string;
  linkedTaskId?: string;
}

interface LcpWindowRow {
  route: string;
  lcp_p75: number;
  samples: number;
  affected_users: number;
  release: string;
}

interface BaselineRow {
  route: string;
  baseline: number;
}

interface AlertDbRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  route: string;
  metric: string;
  trigger_value: string;
  baseline: string;
  affected_users: number;
  first_seen: Date;
  last_seen: Date;
  release: string;
  linked_task_id: string | null;
}

const RULE_ID = 'lcp-p75-threshold';
const JS_RULE_ID = 'js-error-rate';
const API_RULE_ID = 'api-error-rate';
const JS_POOR_PCT = 1;
const JS_SEVERE_PCT = 10;
const API_POOR_PCT = 2;
const API_SEVERE_PCT = 10;
const MIN_ERROR_SESSIONS = 5;
const MIN_API_REQUESTS = 20;
const LOOKBACK_MINUTES = 10;
const MIN_SAMPLES = 1;
const LCP_THRESHOLD_MS = METRIC_SPECS.LCP.goodAt;
const LCP_S0_MS = 4000;
const DEGRADATION_RATIO = 1.2;
const EVAL_TTL_MS = 30_000;
const EVAL_INTERVAL_MS = 60_000;

export function isLcpDegraded(currentMs: number, baselineMs: number | null) {
  if (currentMs >= LCP_S0_MS) return true;
  if (currentMs <= LCP_THRESHOLD_MS) return false;
  if (baselineMs == null || baselineMs <= 0) return true;
  return currentMs > baselineMs * DEGRADATION_RATIO;
}

export function isRateDegraded(currentPct: number, baselinePct: number | null, poorAt: number, severeAt: number) {
  if (currentPct >= severeAt) return true;
  if (currentPct <= poorAt) return false;
  if (baselinePct == null || baselinePct <= 0) return true;
  return currentPct > baselinePct * DEGRADATION_RATIO;
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  private readonly logger = new Logger(AlertsService.name);
  private readonly lastEvalAt = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private evaluating = false;

  constructor(
    private readonly postgres: PostgresService,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    void this.runScheduledEvaluation();
    this.timer = setInterval(() => {
      void this.runScheduledEvaluation();
    }, EVAL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async list(projectId: string, env: string, release = '', hours = 24): Promise<AlertRowResult[]> {
    await this.refresh(projectId, env);
    const result = await this.postgres.query<AlertDbRow>(
      `
        SELECT
          id, title, severity, status, route, metric,
          trigger_value, baseline, affected_users,
          first_seen, last_seen, release, linked_task_id
        FROM alerts
        WHERE project_id = $1 AND env = $2
          AND ($3 = '' OR release = $3)
          AND last_seen >= now() - make_interval(hours => $4::int)
        ORDER BY
          CASE status
            WHEN 'firing' THEN 0
            WHEN 'acknowledged' THEN 1
            WHEN 'silenced' THEN 2
            ELSE 3
          END,
          last_seen DESC
      `,
      [projectId, env, release, hours],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async countActive(projectId: string, env: string, release = ''): Promise<number> {
    const result = await this.postgres.query<{ count: number }>(
      `
        SELECT count(*)::int AS count
        FROM alerts
        WHERE project_id = $1
          AND env = $2
          AND status IN ('firing', 'acknowledged')
          AND ($3 = '' OR release = $3)
      `,
      [projectId, env, release],
    );
    return result.rows[0]?.count ?? 0;
  }

  async applyAction(
    id: string,
    projectId: string,
    env: string,
    action: string,
    silenceHours?: number,
  ): Promise<AlertRowResult> {
    const current = await this.getStored(id, projectId, env);
    if (!current) {
      throw new NotFoundException(`Alert ${id} not found`);
    }

    const now = new Date();
    let status = current.status;
    let silencedUntil: Date | null = current.silenced_until;
    let resolution = current.resolution;

    if (action === 'acknowledge') {
      if (current.status === 'resolved') {
        throw new BadRequestException('Resolved alerts cannot be acknowledged');
      }
      status = 'acknowledged';
    } else if (action === 'silence') {
      const hours = silenceHours === 4 || silenceHours === 24 ? silenceHours : 1;
      status = 'silenced';
      silencedUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
    } else if (action === 'false_positive') {
      status = 'resolved';
      resolution = 'false_positive';
      silencedUntil = null;
    } else {
      throw new BadRequestException(`Unknown alert action: ${action}`);
    }

    const result = await this.postgres.query<AlertDbRow>(
      `
        UPDATE alerts
        SET
          status = $4,
          silenced_until = $5,
          resolution = $6,
          updated_at = $7
        WHERE id = $1 AND project_id = $2 AND env = $3
        RETURNING
          id, title, severity, status, route, metric,
          trigger_value, baseline, affected_users,
          first_seen, last_seen, release, linked_task_id
      `,
      [id, projectId, env, status, silencedUntil, resolution, now],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException(`Alert ${id} not found`);
    }
    return this.mapRow(updated);
  }

  private async getStored(
    id: string,
    projectId: string,
    env: string,
  ): Promise<(AlertDbRow & { silenced_until: Date | null; resolution: string | null }) | null> {
    const result = await this.postgres.query<
      AlertDbRow & { silenced_until: Date | null; resolution: string | null }
    >(
      `
        SELECT
          id, title, severity, status, route, metric,
          trigger_value, baseline, affected_users,
          first_seen, last_seen, release, linked_task_id, silenced_until, resolution
        FROM alerts
        WHERE id = $1 AND project_id = $2 AND env = $3
      `,
      [id, projectId, env],
    );
    return result.rows[0] ?? null;
  }

  async getById(
    id: string,
    projectId: string,
    env: string,
  ): Promise<AlertRowResult | null> {
    await this.refresh(projectId, env);
    const result = await this.postgres.query<AlertDbRow>(
      `
        SELECT
          id, title, severity, status, route, metric,
          trigger_value, baseline, affected_users,
          first_seen, last_seen, release, linked_task_id
        FROM alerts
        WHERE id = $1 AND project_id = $2 AND env = $3
      `,
      [id, projectId, env],
    );

    const row = result.rows[0];
    return row ? this.mapRow(row) : null;
  }

  private async refresh(projectId: string, env: string) {
    const key = `${projectId}:${env}`;
    const last = this.lastEvalAt.get(key) ?? 0;
    if (Date.now() - last < EVAL_TTL_MS) {
      return;
    }

    try {
      await this.evaluate(projectId, env);
      this.lastEvalAt.set(key, Date.now());
    } catch (err) {
      this.lastEvalAt.set(key, Date.now());
      console.error('alert evaluation failed', err);
    }
  }

  private async runScheduledEvaluation() {
    if (this.evaluating) return;
    this.evaluating = true;
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT project_id, env
          FROM afm.rum_events
          WHERE timestamp >= now() - INTERVAL 24 HOUR
          GROUP BY project_id, env
        `,
        format: 'JSONEachRow',
      });
      const scopes = await result.json<{ project_id: string; env: string }>();
      for (const scope of scopes) {
        await this.evaluate(scope.project_id, scope.env);
        this.lastEvalAt.set(`${scope.project_id}:${scope.env}`, Date.now());
      }
    } catch (err) {
      this.logger.error('scheduled alert evaluation failed', err);
    } finally {
      this.evaluating = false;
    }
  }

  private async evaluate(projectId: string, env: string) {
    await this.evaluateLcp(projectId, env);
    await this.evaluateJsErrors(projectId, env);
    await this.evaluateApiErrors(projectId, env);
  }

  private async evaluateLcp(projectId: string, env: string) {
    const [breaches, baselines] = await Promise.all([
      this.fetchLcpBreaches(projectId, env),
      this.fetchLcpBaselines(projectId, env),
    ]);

    const baselineByRoute = new Map(
      baselines.map((row) => [row.route, row.baseline]),
    );
    const now = new Date();
    const activeFingerprints: string[] = [];

    for (const breach of breaches) {
      const baselineMs = baselineByRoute.get(breach.route) ?? null;
      if (!isLcpDegraded(breach.lcp_p75, baselineMs)) continue;
      const fingerprint = this.fingerprint(projectId, env, breach.route);
      activeFingerprints.push(fingerprint);
      const severity = this.severityFor(breach.lcp_p75);
      const title = `${breach.route} LCP P75 劣化`;
      const triggerValue = formatMetricValue('LCP', breach.lcp_p75);
      const baseline = baselineMs == null ? '—' : formatMetricValue('LCP', baselineMs);
      const id = `alrt-${fingerprint}`;

      await this.postgres.query(
        `
          INSERT INTO alerts (
            id, project_id, env, fingerprint, title, severity, status,
            route, metric, trigger_value, baseline, trigger_value_ms, baseline_ms,
            affected_users, first_seen, last_seen, release, rule_id, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'firing',
            $7, 'LCP P75', $8, $9, $10, $11,
            $12, $13, $13, $14, $15, $13
          )
          ON CONFLICT (fingerprint) DO UPDATE SET
            title = EXCLUDED.title,
            severity = EXCLUDED.severity,
            status = CASE
              WHEN alerts.resolution = 'false_positive' THEN 'resolved'
              WHEN alerts.status = 'silenced'
                AND alerts.silenced_until IS NOT NULL
                AND alerts.silenced_until > now() THEN 'silenced'
              WHEN alerts.status = 'acknowledged' THEN 'acknowledged'
              ELSE 'firing'
            END,
            trigger_value = EXCLUDED.trigger_value,
            baseline = EXCLUDED.baseline,
            trigger_value_ms = EXCLUDED.trigger_value_ms,
            baseline_ms = EXCLUDED.baseline_ms,
            affected_users = EXCLUDED.affected_users,
            last_seen = EXCLUDED.last_seen,
            release = EXCLUDED.release,
            updated_at = EXCLUDED.updated_at
        `,
        [
          id,
          projectId,
          env,
          fingerprint,
          title,
          severity,
          breach.route,
          triggerValue,
          baseline,
          breach.lcp_p75,
          baselineMs,
          Math.round(breach.affected_users),
          now,
          breach.release || '',
          RULE_ID,
        ],
      );

      await this.notify.maybeNotify({
        id,
        projectId,
        env,
        fingerprint,
        title,
        severity,
        route: breach.route,
        metric: 'LCP P75',
        triggerValue,
        baseline,
        release: breach.release || '',
      });
    }

    if (activeFingerprints.length === 0) {
      await this.postgres.query(
        `
          UPDATE alerts
          SET status = 'resolved', last_seen = $3, updated_at = $3
          WHERE project_id = $1
            AND env = $2
            AND rule_id = $4
            AND status IN ('firing', 'acknowledged')
        `,
        [projectId, env, now, RULE_ID],
      );
      return;
    }

    await this.postgres.query(
      `
        UPDATE alerts
        SET status = 'resolved', last_seen = $3, updated_at = $3
        WHERE project_id = $1
          AND env = $2
          AND rule_id = $4
          AND status IN ('firing', 'acknowledged')
          AND NOT (fingerprint = ANY($5::text[]))
      `,
      [projectId, env, now, RULE_ID, activeFingerprints],
    );
  }

  private async evaluateJsErrors(projectId: string, env: string) {
    const [current, baselines] = await Promise.all([
      this.fetchSessionErrorRates(projectId, env, false),
      this.fetchSessionErrorRates(projectId, env, true),
    ]);
    const baselineByRoute = new Map(baselines.map((row) => [row.route, this.percent(row.error_sessions, row.sessions)]));
    const now = new Date();
    const active: string[] = [];
    for (const row of current) {
      if (row.sessions < MIN_ERROR_SESSIONS || !row.route) continue;
      const rate = this.percent(row.error_sessions, row.sessions);
      const baseline = baselineByRoute.get(row.route) ?? null;
      if (!isRateDegraded(rate, baseline, JS_POOR_PCT, JS_SEVERE_PCT)) continue;
      const fingerprint = this.fingerprint(projectId, env, row.route, 'JS_ERROR');
      active.push(fingerprint);
      await this.persistAlert({
        id: `alrt-${fingerprint}`,
        projectId,
        env,
        fingerprint,
        title: `${row.route} JS 错误率升高`,
        severity: rate >= JS_SEVERE_PCT ? 'S0' : 'S1',
        route: row.route,
        metric: 'JS 错误率',
        triggerValue: `${rate.toFixed(2)}%`,
        baseline: baseline == null ? '—' : `${baseline.toFixed(2)}%`,
        triggerMs: rate,
        baselineMs: baseline,
        affectedUsers: Math.round(row.affected_users),
        release: row.latest_release || '',
        ruleId: JS_RULE_ID,
        now,
      });
    }
    await this.resolveStale(projectId, env, JS_RULE_ID, active, now);
  }

  private async evaluateApiErrors(projectId: string, env: string) {
    const [current, baselines] = await Promise.all([
      this.fetchApiErrorRates(projectId, env, false),
      this.fetchApiErrorRates(projectId, env, true),
    ]);
    const baselineByApi = new Map(baselines.map((row) => [row.api, this.percent(row.failed, row.requests)]));
    const now = new Date();
    const active: string[] = [];
    for (const row of current) {
      if (row.requests < MIN_API_REQUESTS || !row.api) continue;
      const rate = this.percent(row.failed, row.requests);
      const baseline = baselineByApi.get(row.api) ?? null;
      if (!isRateDegraded(rate, baseline, API_POOR_PCT, API_SEVERE_PCT)) continue;
      const fingerprint = this.fingerprint(projectId, env, row.api, 'API_ERROR');
      active.push(fingerprint);
      await this.persistAlert({
        id: `alrt-${fingerprint}`,
        projectId,
        env,
        fingerprint,
        title: `${row.api} 接口错误率升高`,
        severity: rate >= API_SEVERE_PCT ? 'S0' : 'S1',
        route: row.api,
        metric: 'API 错误率',
        triggerValue: `${rate.toFixed(2)}%`,
        baseline: baseline == null ? '—' : `${baseline.toFixed(2)}%`,
        triggerMs: rate,
        baselineMs: baseline,
        affectedUsers: Math.round(row.affected_users),
        release: row.latest_release || '',
        ruleId: API_RULE_ID,
        now,
      });
    }
    await this.resolveStale(projectId, env, API_RULE_ID, active, now);
  }

  private percent(part: number, total: number) {
    if (!total) return 0;
    return (Number(part) / Number(total)) * 100;
  }

  private async fetchSessionErrorRates(projectId: string, env: string, baseline: boolean) {
    const window = baseline
      ? `timestamp >= now() - INTERVAL 24 HOUR AND timestamp < now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE`
      : `timestamp >= now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE`;
    const result = await this.clickhouse.query({
      query: `
        SELECT
          last_route AS route,
          count() AS sessions,
          countIf(errors > 0) AS error_sessions,
          uniqExactIf(user_id, user_id != '' AND errors > 0) AS affected_users,
          any(session_release) AS latest_release
        FROM (
          SELECT
            session_id,
            argMax(route, timestamp) AS last_route,
            countIf(event_type = 'error') AS errors,
            any(user_id_hash) AS user_id,
            argMax(release, timestamp) AS session_release
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND ${window}
            AND session_id != ''
          GROUP BY session_id
        )
        GROUP BY last_route
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });
    return result.json<{ route: string; sessions: number; error_sessions: number; affected_users: number; latest_release: string }>();
  }

  private async fetchApiErrorRates(projectId: string, env: string, baseline: boolean) {
    const window = baseline
      ? `timestamp >= now() - INTERVAL 24 HOUR AND timestamp < now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE`
      : `timestamp >= now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE`;
    const result = await this.clickhouse.query({
      query: `
        SELECT
          api_route AS api,
          count() AS requests,
          countIf(status_code >= 400 OR status_code = 0 OR toBool(attributes.isTimeout)) AS failed,
          uniqExactIf(user_id_hash, user_id_hash != '') AS affected_users,
          argMax(release, timestamp) AS latest_release
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'api_timing'
          AND ${window}
          AND api_route != ''
        GROUP BY api_route
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });
    return result.json<{ api: string; requests: number; failed: number; affected_users: number; latest_release: string }>();
  }

  private async persistAlert(input: {
    id: string;
    projectId: string;
    env: string;
    fingerprint: string;
    title: string;
    severity: Severity;
    route: string;
    metric: string;
    triggerValue: string;
    baseline: string;
    triggerMs: number;
    baselineMs: number | null;
    affectedUsers: number;
    release: string;
    ruleId: string;
    now: Date;
  }) {
    await this.postgres.query(
      `
        INSERT INTO alerts (
          id, project_id, env, fingerprint, title, severity, status,
          route, metric, trigger_value, baseline, trigger_value_ms, baseline_ms,
          affected_users, first_seen, last_seen, release, rule_id, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, 'firing',
          $7, $8, $9, $10, $11, $12,
          $13, $14, $14, $15, $16, $14
        )
        ON CONFLICT (fingerprint) DO UPDATE SET
          title = EXCLUDED.title,
          severity = EXCLUDED.severity,
          status = CASE
            WHEN alerts.resolution = 'false_positive' THEN 'resolved'
            WHEN alerts.status = 'silenced'
              AND alerts.silenced_until IS NOT NULL
              AND alerts.silenced_until > now() THEN 'silenced'
            WHEN alerts.status = 'acknowledged' THEN 'acknowledged'
            ELSE 'firing'
          END,
          metric = EXCLUDED.metric,
          trigger_value = EXCLUDED.trigger_value,
          baseline = EXCLUDED.baseline,
          trigger_value_ms = EXCLUDED.trigger_value_ms,
          baseline_ms = EXCLUDED.baseline_ms,
          affected_users = EXCLUDED.affected_users,
          last_seen = EXCLUDED.last_seen,
          release = EXCLUDED.release,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.id,
        input.projectId,
        input.env,
        input.fingerprint,
        input.title,
        input.severity,
        input.route,
        input.metric,
        input.triggerValue,
        input.baseline,
        input.triggerMs,
        input.baselineMs,
        input.affectedUsers,
        input.now,
        input.release,
        input.ruleId,
      ],
    );

    await this.notify.maybeNotify({
      id: input.id,
      projectId: input.projectId,
      env: input.env,
      fingerprint: input.fingerprint,
      title: input.title,
      severity: input.severity,
      route: input.route,
      metric: input.metric,
      triggerValue: input.triggerValue,
      baseline: input.baseline,
      release: input.release,
    });
  }

  private async resolveStale(projectId: string, env: string, ruleId: string, activeFingerprints: string[], now: Date) {
    if (activeFingerprints.length === 0) {
      await this.postgres.query(
        `
          UPDATE alerts
          SET status = 'resolved', last_seen = $3, updated_at = $3
          WHERE project_id = $1 AND env = $2 AND rule_id = $4
            AND status IN ('firing', 'acknowledged')
        `,
        [projectId, env, now, ruleId],
      );
      return;
    }
    await this.postgres.query(
      `
        UPDATE alerts
        SET status = 'resolved', last_seen = $3, updated_at = $3
        WHERE project_id = $1 AND env = $2 AND rule_id = $4
          AND status IN ('firing', 'acknowledged')
          AND NOT (fingerprint = ANY($5::text[]))
      `,
      [projectId, env, now, ruleId, activeFingerprints],
    );
  }

  private async fetchLcpBreaches(projectId: string, env: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          quantile(0.75)(metric_value) AS lcp_p75,
          count() AS samples,
          uniq(user_id_hash) AS affected_users,
          argMax(release, timestamp) AS release
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'web_vital'
          AND metric_name = 'LCP'
          AND timestamp >= now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE
        GROUP BY route
        HAVING lcp_p75 > {threshold:Float64}
           AND samples >= {minSamples:UInt32}
           AND route != ''
      `,
      query_params: {
        projectId,
        env,
        threshold: LCP_THRESHOLD_MS,
        minSamples: MIN_SAMPLES,
      },
      format: 'JSONEachRow',
    });

    return result.json<LcpWindowRow>();
  }

  private async fetchLcpBaselines(projectId: string, env: string) {
    const result = await this.clickhouse.query({
      query: `
        SELECT
          route,
          quantile(0.75)(metric_value) AS baseline
        FROM afm.rum_events
        WHERE project_id = {projectId:String}
          AND env = {env:String}
          AND event_type = 'web_vital'
          AND metric_name = 'LCP'
          AND timestamp >= now() - INTERVAL 24 HOUR
          AND timestamp < now() - INTERVAL ${LOOKBACK_MINUTES} MINUTE
        GROUP BY route
      `,
      query_params: { projectId, env },
      format: 'JSONEachRow',
    });

    return result.json<BaselineRow>();
  }

  private fingerprint(projectId: string, env: string, route: string, metric = 'LCP') {
    return createHash('sha1')
      .update(`${projectId}|${env}|${route}|${metric}`)
      .digest('hex')
      .slice(0, 12);
  }

  private severityFor(lcpP75: number): Severity {
    return lcpP75 >= LCP_S0_MS ? 'S0' : 'S1';
  }

  private mapRow(row: AlertDbRow): AlertRowResult {
    return {
      id: row.id,
      title: row.title,
      severity: row.severity as Severity,
      status: row.status as AlertStatus,
      route: row.route,
      metric: row.metric,
      triggerValue: row.trigger_value,
      baseline: row.baseline,
      affectedUsers: row.affected_users,
      firstSeen: this.formatSeen(row.first_seen),
      lastSeen: this.formatSeen(row.last_seen),
      release: row.release,
      linkedTaskId: row.linked_task_id || undefined,
    };
  }

  private formatSeen(value: Date) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
