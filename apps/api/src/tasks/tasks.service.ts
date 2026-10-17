import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@clickhouse/client';
import { PostgresService } from '../alerts/postgres.service';

export type TaskStatus = 'Open' | 'InProgress' | 'Verifying' | 'Resolved' | 'Reopened';
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface TaskAcceptanceSpec {
  metric: string;
  label: string;
  unit: string;
  baseline: number;
  target: number;
  current: number;
  windowHours: number;
}

export interface TaskRowResult {
  id: string;
  title: string;
  route: string;
  owner: string;
  priority: TaskPriority;
  status: TaskStatus;
  acceptance: string;
  acceptanceSpec: TaskAcceptanceSpec;
  dueDate: string;
  sourceAlertId: string;
  fixRelease: string;
  createdAt: string;
  verification?: {
    passed: boolean;
    series: { timestamp: string; value: number }[];
  };
}

export interface CreateTaskInput {
  title: string;
  owner?: string;
  priority?: string;
  acceptance?: string;
  dueDate?: string;
  sourceAlertId?: string;
  evidenceIds?: string[];
  route?: string;
}

interface TaskDbRow {
  id: string;
  title: string;
  route: string;
  owner: string;
  priority: string;
  status: string;
  acceptance: string;
  acceptance_spec: TaskAcceptanceSpec | string;
  due_date: string;
  source_alert_id: string;
  fix_release: string;
  created_at: Date;
}

interface AlertSeedRow {
  id: string;
  route: string;
  metric: string;
  trigger_value: string;
  baseline: string;
  linked_task_id: string | null;
}

interface LiveLcp {
  current: number | null;
  series: { timestamp: string; value: number }[];
}

interface LcpCurrentRow {
  lcp_p75: number | null;
}

interface LcpTrendRow {
  hour: string;
  p75: number;
}

const TRANSITIONS: Record<string, { from: TaskStatus[]; to: TaskStatus }> = {
  start: { from: ['Open', 'Reopened'], to: 'InProgress' },
  submit_fix: { from: ['InProgress'], to: 'Verifying' },
  resolve: { from: ['Verifying'], to: 'Resolved' },
  reopen: { from: ['Verifying', 'Resolved', 'InProgress'], to: 'Reopened' },
};

@Injectable()
export class TasksService {
  private readonly clickhouse = createClient({
    url: process.env.CLICKHOUSE_ENDPOINT ?? 'http://127.0.0.1:8123',
    username: process.env.CLICKHOUSE_USER ?? 'afm',
    password: process.env.CLICKHOUSE_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.CLICKHOUSE_DB ?? 'afm',
  });

  constructor(private readonly postgres: PostgresService) {}

  async list(projectId: string, env: string): Promise<TaskRowResult[]> {
    const result = await this.postgres.query<TaskDbRow>(
      `
        SELECT
          id, title, route, owner, priority, status, acceptance,
          acceptance_spec, due_date, source_alert_id, fix_release, created_at
        FROM tasks
        WHERE project_id = $1 AND env = $2
        ORDER BY created_at DESC
      `,
      [projectId, env],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async getById(id: string, projectId: string, env: string): Promise<TaskRowResult | null> {
    const result = await this.postgres.query<TaskDbRow>(
      `
        SELECT
          id, title, route, owner, priority, status, acceptance,
          acceptance_spec, due_date, source_alert_id, fix_release, created_at
        FROM tasks
        WHERE id = $1 AND project_id = $2 AND env = $3
      `,
      [id, projectId, env],
    );
    const row = result.rows[0];
    return row ? this.enrich(this.mapRow(row), projectId, env) : null;
  }

  async create(
    projectId: string,
    env: string,
    input: CreateTaskInput,
  ): Promise<TaskRowResult> {
    const title = input.title?.trim();
    if (!title) {
      throw new BadRequestException('Task title is required');
    }

    let route = input.route?.trim() || '';
    let sourceAlertId = input.sourceAlertId?.trim() || '';
    let spec = this.defaultSpec();

    if (sourceAlertId) {
      const alert = await this.findAlert(sourceAlertId, projectId, env);
      if (!alert) {
        throw new BadRequestException(`Source alert ${sourceAlertId} not found`);
      }
      if (alert.linked_task_id) {
        const existing = await this.getById(alert.linked_task_id, projectId, env);
        if (existing) {
          return existing;
        }
      }
      route = alert.route || route;
      spec = this.specFromAlert(alert);
    }

    const idResult = await this.postgres.query<{ id: string }>(
      `SELECT 'task-' || nextval('task_id_seq') AS id`,
    );
    const id = idResult.rows[0]?.id ?? `task-${Date.now()}`;
    const now = new Date();
    const priority = this.normalizePriority(input.priority);
    const owner = input.owner?.trim() || '未指派';
    const acceptance =
      input.acceptance?.trim() ||
      `${route || '页面'} LCP P75 连续 24 小时 <= 2.5s`;
    const dueDate = this.formatDueDate(input.dueDate);

    await this.postgres.query(
      `
        INSERT INTO tasks (
          id, project_id, env, title, route, owner, priority, status,
          acceptance, acceptance_spec, due_date, source_alert_id, evidence_ids,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'Open',
          $8, $9::jsonb, $10, $11, $12::jsonb, $13, $13
        )
      `,
      [
        id,
        projectId,
        env,
        title,
        route,
        owner,
        priority,
        acceptance,
        JSON.stringify(spec),
        dueDate,
        sourceAlertId,
        JSON.stringify(input.evidenceIds ?? []),
        now,
      ],
    );

    if (sourceAlertId) {
      await this.postgres.query(
        `
          UPDATE alerts
          SET linked_task_id = $1, updated_at = $5
          WHERE id = $2 AND project_id = $3 AND env = $4
            AND (linked_task_id IS NULL OR linked_task_id = '')
        `,
        [id, sourceAlertId, projectId, env, now],
      );
    }

    const created = await this.getById(id, projectId, env);
    if (!created) {
      throw new NotFoundException(`Task ${id} was not created`);
    }
    return created;
  }

  async applyAction(
    id: string,
    projectId: string,
    env: string,
    action: string,
    payload: { release?: string } = {},
  ): Promise<TaskRowResult> {
    const current = await this.getById(id, projectId, env);
    if (!current) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const transition = TRANSITIONS[action];
    if (!transition) {
      throw new BadRequestException(`Unknown task action: ${action}`);
    }
    if (!transition.from.includes(current.status)) {
      throw new BadRequestException(
        `Cannot ${action} a task in status ${current.status}`,
      );
    }

    const fixRelease =
      action === 'submit_fix' ? payload.release?.trim() || '' : current.fixRelease;
    if (action === 'submit_fix' && !fixRelease) {
      throw new BadRequestException('Release version is required');
    }

    const result = await this.postgres.query<TaskDbRow>(
      `
        UPDATE tasks
        SET status = $4, fix_release = $5, updated_at = now()
        WHERE id = $1 AND project_id = $2 AND env = $3
        RETURNING
          id, title, route, owner, priority, status, acceptance,
          acceptance_spec, due_date, source_alert_id, fix_release, created_at
      `,
      [id, projectId, env, transition.to, fixRelease],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return this.enrich(this.mapRow(updated), projectId, env);
  }

  private async findAlert(id: string, projectId: string, env: string) {
    const result = await this.postgres.query<AlertSeedRow>(
      `
        SELECT id, route, metric, trigger_value, baseline, linked_task_id
        FROM alerts
        WHERE id = $1 AND project_id = $2 AND env = $3
      `,
      [id, projectId, env],
    );
    return result.rows[0] ?? null;
  }

  private specFromAlert(alert: AlertSeedRow): TaskAcceptanceSpec {
    return {
      metric: 'lcp_p75',
      label: alert.metric || 'LCP P75',
      unit: 's',
      baseline: this.parseDisplayValue(alert.baseline),
      target: 2.5,
      current: this.parseDisplayValue(alert.trigger_value),
      windowHours: 24,
    };
  }

  private defaultSpec(): TaskAcceptanceSpec {
    return {
      metric: 'lcp_p75',
      label: 'LCP P75',
      unit: 's',
      baseline: 0,
      target: 2.5,
      current: 0,
      windowHours: 24,
    };
  }

  private parseDisplayValue(value: string) {
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) {
      return 0;
    }
    if (value.endsWith('ms')) {
      return Number((numeric / 1000).toFixed(2));
    }
    return numeric;
  }

  private normalizePriority(value?: string): TaskPriority {
    if (value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3') {
      return value;
    }
    return 'P1';
  }

  private formatDueDate(value?: string) {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private formatCreated(value: Date) {
    const date = value instanceof Date ? value : new Date(value);
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private async enrich(
    task: TaskRowResult,
    projectId: string,
    env: string,
  ): Promise<TaskRowResult> {
    const live = await this.fetchLiveLcp(
      projectId,
      env,
      task.route,
      task.acceptanceSpec.windowHours || 24,
    ).catch(
      (): LiveLcp => ({
        current: null,
        series: [],
      }),
    );

    const current = live.current ?? task.acceptanceSpec.current;
    const spec = {
      ...task.acceptanceSpec,
      current,
    };

    return {
      ...task,
      acceptanceSpec: spec,
      verification: {
        passed: spec.target > 0 ? current <= spec.target : false,
        series: live.series,
      },
    };
  }

  private async fetchLiveLcp(
    projectId: string,
    env: string,
    route: string,
    windowHours: number,
  ): Promise<LiveLcp> {
    if (!route) {
      return { current: null, series: [] };
    }

    const hours = Math.min(168, Math.max(1, Math.round(windowHours || 24)));

    const [currentResult, trendResult] = await Promise.all([
      this.clickhouse.query({
        query: `
          SELECT quantile(0.75)(metric_value) AS lcp_p75
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND event_type = 'web_vital'
            AND metric_name = 'LCP'
            AND route = {route:String}
            AND timestamp >= now() - INTERVAL ${hours} HOUR
        `,
        query_params: { projectId, env, route },
        format: 'JSONEachRow',
      }),
      this.clickhouse.query({
        query: `
          SELECT
            formatDateTime(toStartOfHour(timestamp), '%m-%d %H:00') AS hour,
            quantile(0.75)(metric_value) / 1000 AS p75
          FROM afm.rum_events
          WHERE project_id = {projectId:String}
            AND env = {env:String}
            AND event_type = 'web_vital'
            AND metric_name = 'LCP'
            AND route = {route:String}
            AND timestamp >= now() - INTERVAL ${hours} HOUR
          GROUP BY toStartOfHour(timestamp)
          ORDER BY toStartOfHour(timestamp) ASC
        `,
        query_params: { projectId, env, route },
        format: 'JSONEachRow',
      }),
    ]);

    const currentRows = await currentResult.json<LcpCurrentRow>();
    const trendRows = await trendResult.json<LcpTrendRow>();
    const raw = currentRows[0]?.lcp_p75;
    const current =
      raw == null || Number.isNaN(Number(raw))
        ? null
        : Number((Number(raw) / 1000).toFixed(2));

    return {
      current,
      series: trendRows.map((row) => ({
        timestamp: row.hour,
        value: Number(Number(row.p75).toFixed(2)),
      })),
    };
  }

  private mapRow(row: TaskDbRow): TaskRowResult {
    const parsed =
      typeof row.acceptance_spec === 'string'
        ? (JSON.parse(row.acceptance_spec) as TaskAcceptanceSpec)
        : row.acceptance_spec;
    const spec =
      parsed && typeof parsed.target === 'number' ? parsed : this.defaultSpec();

    return {
      id: row.id,
      title: row.title,
      route: row.route,
      owner: row.owner,
      priority: row.priority as TaskPriority,
      status: row.status as TaskStatus,
      acceptance: row.acceptance,
      acceptanceSpec: spec,
      dueDate: row.due_date,
      sourceAlertId: row.source_alert_id,
      fixRelease: row.fix_release || '',
      createdAt: this.formatCreated(row.created_at),
    };
  }
}
