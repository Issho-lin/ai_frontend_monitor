import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { formatMetricValue, METRIC_SPECS } from '@ai-frontend-monitor/schema';
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
const LOOKBACK_MINUTES = 10;
const MIN_SAMPLES = 1;
const LCP_THRESHOLD_MS = METRIC_SPECS.LCP.goodAt;
const LCP_S0_MS = 4000;
const EVAL_TTL_MS = 30_000;

@Injectable()
export class AlertsService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  private readonly lastEvalAt = new Map<string, number>();

  constructor(private readonly postgres: PostgresService) {}

  async list(projectId: string, env: string): Promise<AlertRowResult[]> {
    await this.refresh(projectId, env);
    const result = await this.postgres.query<AlertDbRow>(
      `
        SELECT
          id, title, severity, status, route, metric,
          trigger_value, baseline, affected_users,
          first_seen, last_seen, release, linked_task_id
        FROM alerts
        WHERE project_id = $1 AND env = $2
        ORDER BY
          CASE status
            WHEN 'firing' THEN 0
            WHEN 'acknowledged' THEN 1
            WHEN 'silenced' THEN 2
            ELSE 3
          END,
          last_seen DESC
      `,
      [projectId, env],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async countActive(projectId: string, env: string): Promise<number> {
    const result = await this.postgres.query<{ count: number }>(
      `
        SELECT count(*)::int AS count
        FROM alerts
        WHERE project_id = $1
          AND env = $2
          AND status IN ('firing', 'acknowledged')
      `,
      [projectId, env],
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

  private async evaluate(projectId: string, env: string) {
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
      const fingerprint = this.fingerprint(projectId, env, breach.route);
      activeFingerprints.push(fingerprint);
      const baselineMs = baselineByRoute.get(breach.route) ?? LCP_THRESHOLD_MS;
      const severity = this.severityFor(breach.lcp_p75);
      const title = `${breach.route} LCP P75 劣化`;
      const triggerValue = formatMetricValue('LCP', breach.lcp_p75);
      const baseline = formatMetricValue('LCP', baselineMs);
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

  private fingerprint(projectId: string, env: string, route: string) {
    return createHash('sha1')
      .update(`${projectId}|${env}|${route}|LCP`)
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
