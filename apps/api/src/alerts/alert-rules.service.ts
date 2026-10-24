import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { METRIC_SPECS } from '@ai-frontend-monitor/schema';
import { PostgresService } from './postgres.service';

export type AlertRuleMetric = 'LCP P75' | 'JS Error Rate' | 'API Error Rate';
export type AlertRuleUnit = 'ms' | 'percent';

export interface AlertRuleResult {
  id: string;
  name: string;
  metric: AlertRuleMetric;
  /** 不良线：超过才进入「相对基线」判断区 */
  poorThreshold: number;
  /** 严重线：达到即 S0 */
  severeThreshold: number;
  unit: AlertRuleUnit;
  enabled: boolean;
  webhookUrl: string;
  /** 占位：存库但不发信 */
  email: string;
  updatedAt: string;
}

export interface UpdateAlertRuleInput {
  poorThreshold?: number;
  severeThreshold?: number;
  enabled?: boolean;
  webhookUrl?: string;
  email?: string;
}

interface AlertRuleDbRow {
  id: string;
  name: string;
  metric: string;
  poor_threshold: number;
  severe_threshold: number;
  unit: string;
  enabled: boolean;
  webhook_url: string;
  email: string;
  updated_at: Date;
}

export const RULE_ID_LCP = 'lcp-p75-threshold';
export const RULE_ID_JS = 'js-error-rate';
export const RULE_ID_API = 'api-error-rate';

const DEFAULT_RULES: Omit<AlertRuleResult, 'updatedAt'>[] = [
  {
    id: RULE_ID_LCP,
    name: '核心页面 LCP 劣化',
    metric: 'LCP P75',
    poorThreshold: METRIC_SPECS.LCP.goodAt,
    severeThreshold: 4000,
    unit: 'ms',
    enabled: true,
    webhookUrl: '',
    email: '',
  },
  {
    id: RULE_ID_JS,
    name: 'JS 错误率升高',
    metric: 'JS Error Rate',
    poorThreshold: 1,
    severeThreshold: 10,
    unit: 'percent',
    enabled: true,
    webhookUrl: '',
    email: '',
  },
  {
    id: RULE_ID_API,
    name: '接口错误率升高',
    metric: 'API Error Rate',
    poorThreshold: 2,
    severeThreshold: 10,
    unit: 'percent',
    enabled: true,
    webhookUrl: '',
    email: '',
  },
];

@Injectable()
export class AlertRulesService {
  constructor(private readonly postgres: PostgresService) {}

  async list(projectId: string, env: string): Promise<AlertRuleResult[]> {
    await this.ensureDefaults(projectId, env);
    const result = await this.postgres.query<AlertRuleDbRow>(
      `
        SELECT id, name, metric, poor_threshold, severe_threshold, unit,
               enabled, webhook_url, email, updated_at
        FROM alert_rules
        WHERE project_id = $1 AND env = $2
        ORDER BY
          CASE id
            WHEN 'lcp-p75-threshold' THEN 0
            WHEN 'js-error-rate' THEN 1
            WHEN 'api-error-rate' THEN 2
            ELSE 3
          END
      `,
      [projectId, env],
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async get(
    projectId: string,
    env: string,
    id: string,
  ): Promise<AlertRuleResult> {
    await this.ensureDefaults(projectId, env);
    const result = await this.postgres.query<AlertRuleDbRow>(
      `
        SELECT id, name, metric, poor_threshold, severe_threshold, unit,
               enabled, webhook_url, email, updated_at
        FROM alert_rules
        WHERE project_id = $1 AND env = $2 AND id = $3
      `,
      [projectId, env, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Alert rule ${id} not found`);
    }
    return this.mapRow(row);
  }

  async update(
    id: string,
    projectId: string,
    env: string,
    input: UpdateAlertRuleInput,
  ): Promise<AlertRuleResult> {
    await this.ensureDefaults(projectId, env);
    const current = await this.get(projectId, env, id);

    const poor =
      input.poorThreshold !== undefined
        ? Number(input.poorThreshold)
        : current.poorThreshold;
    const severe =
      input.severeThreshold !== undefined
        ? Number(input.severeThreshold)
        : current.severeThreshold;

    if (!Number.isFinite(poor) || !Number.isFinite(severe) || poor < 0 || severe < 0) {
      throw new BadRequestException('poorThreshold and severeThreshold must be non-negative numbers');
    }
    if (severe < poor) {
      throw new BadRequestException('severeThreshold must be >= poorThreshold');
    }

    const enabled =
      input.enabled !== undefined ? Boolean(input.enabled) : current.enabled;
    const webhookUrl =
      input.webhookUrl !== undefined
        ? String(input.webhookUrl).trim()
        : current.webhookUrl;
    const email =
      input.email !== undefined ? String(input.email).trim() : current.email;

    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      throw new BadRequestException('webhookUrl must be http(s) URL or empty');
    }

    const result = await this.postgres.query<AlertRuleDbRow>(
      `
        UPDATE alert_rules
        SET
          poor_threshold = $4,
          severe_threshold = $5,
          enabled = $6,
          webhook_url = $7,
          email = $8,
          updated_at = now()
        WHERE project_id = $1 AND env = $2 AND id = $3
        RETURNING id, name, metric, poor_threshold, severe_threshold, unit,
                  enabled, webhook_url, email, updated_at
      `,
      [projectId, env, id, poor, severe, enabled, webhookUrl, email],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException(`Alert rule ${id} not found`);
    }
    return this.mapRow(row);
  }

  private async ensureDefaults(projectId: string, env: string) {
    for (const rule of DEFAULT_RULES) {
      await this.postgres.query(
        `
          INSERT INTO alert_rules (
            project_id, env, id, name, metric,
            poor_threshold, severe_threshold, unit,
            enabled, webhook_url, email, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
          ON CONFLICT (project_id, env, id) DO NOTHING
        `,
        [
          projectId,
          env,
          rule.id,
          rule.name,
          rule.metric,
          rule.poorThreshold,
          rule.severeThreshold,
          rule.unit,
          rule.enabled,
          rule.webhookUrl,
          rule.email,
        ],
      );
    }
  }

  private mapRow(row: AlertRuleDbRow): AlertRuleResult {
    return {
      id: row.id,
      name: row.name,
      metric: row.metric as AlertRuleMetric,
      poorThreshold: Number(row.poor_threshold),
      severeThreshold: Number(row.severe_threshold),
      unit: row.unit as AlertRuleUnit,
      enabled: Boolean(row.enabled),
      webhookUrl: row.webhook_url ?? '',
      email: row.email ?? '',
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
    };
  }
}
