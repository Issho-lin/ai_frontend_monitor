import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { createHash } from 'node:crypto';
import { PostgresService } from '../alerts/postgres.service';

export type IssueKind = 'abnormal' | 'slow';
export type WorkflowStatus = 'open' | 'acked' | 'resolved';
export type IssueAction = 'ack' | 'resolve' | 'reopen';

/** Locked list-item shape from docs/M4-issues-minimal.md (05d7973). */
export interface IssueRow {
  id: string;
  projectId: string;
  env: string;
  title: string;
  kind: IssueKind;
  kindLabel: '异常' | '缓慢';
  workflowStatus: WorkflowStatus;
  route: string;
  windowHours: number;
  /** Sessions of this kind in the window (not total route traffic). */
  sessionCount: number | null;
  deepLink: string;
  updatedAt: string;
}

interface IssueDbRow {
  id: string;
  project_id: string;
  env: string;
  route: string;
  kind: string;
  workflow_status: string;
  created_at: Date;
  updated_at: Date;
}

interface Candidate {
  route: string;
  kind: IssueKind;
  sessionCount: number;
  badSessionCount: number;
}

const ACTION_TO_STATUS: Record<IssueAction, WorkflowStatus> = {
  ack: 'acked',
  resolve: 'resolved',
  reopen: 'open',
};

const KIND_LABEL: Record<IssueKind, '异常' | '缓慢'> = {
  abnormal: '异常',
  slow: '缓慢',
};

/** Same LCP thresholds as ListingsService.getSessions. */
const LCP_SLOW_DESKTOP_MS = 2500;
const LCP_SLOW_MOBILE_MS = 3000;

/**
 * Doc does not define a ratio gate: a route enters when ≥1 session of that
 * kind exists in the window (same per-session rules as Sessions).
 */
const MIN_BAD_SESSIONS = 1;

@Injectable()
export class IssuesService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  constructor(private readonly postgres: PostgresService) {}

  async list(
    projectId: string,
    env: string,
    hours: number,
    workflowStatus = '',
    kind = '',
  ): Promise<IssueRow[]> {
    const [candidates, stored] = await Promise.all([
      this.computeSessionCandidates(projectId, env, hours),
      this.loadStored(projectId, env),
    ]);

    const byKey = new Map<string, IssueRow>();

    for (const row of stored) {
      byKey.set(
        this.key(row.project_id, row.env, row.route, row.kind),
        this.mapStored(row, hours, null),
      );
    }

    for (const cand of candidates) {
      const mapKey = this.key(projectId, env, cand.route, cand.kind);
      const existing = byKey.get(mapKey);
      if (existing) {
        existing.sessionCount = cand.badSessionCount;
        existing.title = this.titleFor(cand.route, cand.kind);
        existing.kindLabel = KIND_LABEL[cand.kind];
        continue;
      }
      byKey.set(mapKey, this.mapVirtual(projectId, env, hours, cand));
    }

    let rows = [...byKey.values()];

    const statusFilter = workflowStatus.trim();
    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter((row) => row.workflowStatus === statusFilter);
    }
    const kindFilter = kind.trim();
    if (kindFilter && kindFilter !== 'all') {
      rows = rows.filter((row) => row.kind === kindFilter);
    }

    rows.sort((a, b) => {
      const openRank = (s: WorkflowStatus) =>
        s === 'open' ? 0 : s === 'acked' ? 1 : 2;
      const kindRank = (k: IssueKind) => (k === 'abnormal' ? 0 : 1);
      return (
        openRank(a.workflowStatus) - openRank(b.workflowStatus) ||
        kindRank(a.kind) - kindRank(b.kind) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.route.localeCompare(b.route)
      );
    });

    return rows;
  }

  async getById(
    id: string,
    projectId: string,
    env: string,
    hours = 24,
  ): Promise<IssueRow | null> {
    const stored = await this.findStored(id, projectId, env);
    if (stored) {
      const metrics = await this.findCandidate(
        projectId,
        env,
        stored.route,
        stored.kind as IssueKind,
        hours,
      );
      return this.mapStored(
        stored,
        hours,
        metrics?.badSessionCount ?? null,
      );
    }

    const cand = await this.findCandidateById(id, projectId, env, hours);
    if (!cand) return null;
    return this.mapVirtual(projectId, env, hours, cand);
  }

  async applyAction(
    id: string,
    projectId: string,
    env: string,
    action: string,
    hours = 24,
  ): Promise<IssueRow> {
    const normalized = action.trim() as IssueAction;
    if (!(normalized in ACTION_TO_STATUS)) {
      throw new BadRequestException(
        `Unknown issue action: ${action}. Use ack | resolve | reopen`,
      );
    }
    const nextStatus = ACTION_TO_STATUS[normalized];

    let stored = await this.findStored(id, projectId, env);
    if (!stored) {
      const cand = await this.findCandidateById(id, projectId, env, hours);
      if (!cand) {
        throw new NotFoundException(`Issue ${id} not found`);
      }
      stored = await this.ensureRow(
        projectId,
        env,
        cand.route,
        cand.kind,
        'open',
      );
    }

    const result = await this.postgres.query<IssueDbRow>(
      `
        UPDATE issues
        SET workflow_status = $4, updated_at = now()
        WHERE id = $1 AND project_id = $2 AND env = $3
        RETURNING id, project_id, env, route, kind, workflow_status, created_at, updated_at
      `,
      [stored.id, projectId, env, nextStatus],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Issue ${id} not found`);
    }

    const metrics = await this.findCandidate(
      projectId,
      env,
      row.route,
      row.kind as IssueKind,
      hours,
    );
    return this.mapStored(
      row,
      hours,
      metrics?.badSessionCount ?? null,
    );
  }

  private async computeSessionCandidates(
    projectId: string,
    env: string,
    hours: number,
  ): Promise<Candidate[]> {
    return this.computeSessionCandidatesSafe(projectId, env, hours);
  }

  /**
   * Same per-session rules as ListingsService.getSessions (LIMIT 50 newest),
   * then roll up by route+kind. Matches Sessions visibility for the window.
   * On CH failure, return [] so Postgres workflow rows still list.
   */
  private async computeSessionCandidatesSafe(
    projectId: string,
    env: string,
    hours: number,
  ): Promise<Candidate[]> {
    try {
      const result = await this.clickhouse.query({
        query: `
          SELECT
            session_id,
            argMax(route, timestamp) AS route,
            any(device_type) AS device_type,
            countIf(event_type = 'error') AS error_count,
            quantileIf(0.75)(metric_value, event_type = 'web_vital' AND metric_name = 'LCP') AS lcp_p75
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND timestamp >= now() - INTERVAL {hours:UInt32} HOUR
            AND session_id != ''
          GROUP BY session_id
          ORDER BY max(timestamp) DESC
          LIMIT 50
        `,
        query_params: { projectId, env, hours },
        format: 'JSONEachRow',
      });

      const sessions = await result.json<{
        session_id: string;
        route: string;
        device_type: string;
        error_count: number;
        lcp_p75: number | null;
      }>();

      const byRoute = new Map<
        string,
        { sessionCount: number; abnormal: number; slow: number }
      >();

      for (const row of sessions) {
        const route = row.route || '';
        if (!route) continue;
        const cur = byRoute.get(route) ?? {
          sessionCount: 0,
          abnormal: 0,
          slow: 0,
        };
        cur.sessionCount += 1;
        const errorCount = Number(row.error_count) || 0;
        if (errorCount > 0) {
          cur.abnormal += 1;
        } else {
          const lcp = Number(row.lcp_p75);
          const threshold =
            row.device_type === 'mobile'
              ? LCP_SLOW_MOBILE_MS
              : LCP_SLOW_DESKTOP_MS;
          if (Number.isFinite(lcp) && lcp > threshold) {
            cur.slow += 1;
          }
        }
        byRoute.set(route, cur);
      }

      const out: Candidate[] = [];
      for (const [route, agg] of byRoute) {
        if (agg.abnormal >= MIN_BAD_SESSIONS) {
          out.push({
            route,
            kind: 'abnormal',
            sessionCount: agg.sessionCount,
            badSessionCount: agg.abnormal,
          });
        }
        if (agg.slow >= MIN_BAD_SESSIONS) {
          out.push({
            route,
            kind: 'slow',
            sessionCount: agg.sessionCount,
            badSessionCount: agg.slow,
          });
        }
      }
      return out;
    } catch (err) {
      console.error('[issues] computeSessionCandidates failed', err);
      return [];
    }
  }

  private async findCandidate(
    projectId: string,
    env: string,
    route: string,
    kind: IssueKind,
    hours: number,
  ) {
    const candidates = await this.computeSessionCandidates(
      projectId,
      env,
      hours,
    );
    return candidates.find((c) => c.route === route && c.kind === kind) ?? null;
  }

  private async findCandidateById(
    id: string,
    projectId: string,
    env: string,
    hours: number,
  ) {
    const candidates = await this.computeSessionCandidates(
      projectId,
      env,
      hours,
    );
    return (
      candidates.find(
        (c) => this.makeId(projectId, env, c.route, c.kind) === id,
      ) ?? null
    );
  }

  private async loadStored(
    projectId: string,
    env: string,
  ): Promise<IssueDbRow[]> {
    const result = await this.postgres.query<IssueDbRow>(
      `
        SELECT id, project_id, env, route, kind, workflow_status, created_at, updated_at
        FROM issues
        WHERE project_id = $1 AND env = $2
      `,
      [projectId, env],
    );
    return result.rows;
  }

  private async findStored(
    id: string,
    projectId: string,
    env: string,
  ): Promise<IssueDbRow | null> {
    const result = await this.postgres.query<IssueDbRow>(
      `
        SELECT id, project_id, env, route, kind, workflow_status, created_at, updated_at
        FROM issues
        WHERE id = $1 AND project_id = $2 AND env = $3
        LIMIT 1
      `,
      [id, projectId, env],
    );
    return result.rows[0] ?? null;
  }

  private async ensureRow(
    projectId: string,
    env: string,
    route: string,
    kind: IssueKind,
    status: WorkflowStatus,
  ): Promise<IssueDbRow> {
    const id = this.makeId(projectId, env, route, kind);
    const result = await this.postgres.query<IssueDbRow>(
      `
        INSERT INTO issues (id, project_id, env, route, kind, workflow_status)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (project_id, env, route, kind) DO UPDATE SET
          id = EXCLUDED.id
        RETURNING id, project_id, env, route, kind, workflow_status, created_at, updated_at
      `,
      [id, projectId, env, route, kind, status],
    );
    return result.rows[0]!;
  }

  makeId(projectId: string, env: string, route: string, kind: IssueKind) {
    const digest = createHash('sha1')
      .update(`${projectId}|${env}|${route}|${kind}`)
      .digest('hex')
      .slice(0, 16);
    return `iss_${digest}`;
  }

  private key(projectId: string, env: string, route: string, kind: string) {
    return `${projectId}|${env}|${route}|${kind}`;
  }

  private titleFor(route: string, kind: IssueKind) {
    return kind === 'abnormal'
      ? `${route} 异常会话偏高`
      : `${route} 缓慢会话偏高`;
  }

  private mapStored(
    row: IssueDbRow,
    hours: number,
    sessionCount: number | null,
  ): IssueRow {
    const kind = row.kind as IssueKind;
    return {
      id: row.id,
      projectId: row.project_id,
      env: row.env,
      title: this.titleFor(row.route, kind),
      kind,
      kindLabel: KIND_LABEL[kind],
      workflowStatus: row.workflow_status as WorkflowStatus,
      route: row.route,
      windowHours: hours,
      sessionCount,
      deepLink: this.deepLink(row.route, kind),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private mapVirtual(
    projectId: string,
    env: string,
    hours: number,
    metrics: Candidate,
  ): IssueRow {
    const now = new Date().toISOString();
    return {
      id: this.makeId(projectId, env, metrics.route, metrics.kind),
      projectId,
      env,
      title: this.titleFor(metrics.route, metrics.kind),
      kind: metrics.kind,
      kindLabel: KIND_LABEL[metrics.kind],
      workflowStatus: 'open',
      route: metrics.route,
      windowHours: hours,
      sessionCount: metrics.badSessionCount,
      deepLink: this.deepLink(metrics.route, metrics.kind),
      updatedAt: now,
    };
  }

  /** Console-relative path; matches M4 locked deepLink string. */
  private deepLink(route: string, kind: IssueKind) {
    return `/sessions?route=${encodeURIComponent(route)}&kind=${kind}`;
  }

  private toIso(value: Date | string) {
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
  }
}
