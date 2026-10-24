import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

const CREATE_ALERTS_TABLE = `
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  env TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  route TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'LCP P75',
  trigger_value TEXT NOT NULL,
  baseline TEXT NOT NULL,
  trigger_value_ms DOUBLE PRECISION,
  baseline_ms DOUBLE PRECISION,
  affected_users INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  release TEXT NOT NULL DEFAULT '',
  rule_id TEXT NOT NULL DEFAULT 'lcp-p75-threshold',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  silenced_until TIMESTAMPTZ,
  resolution TEXT
);

CREATE INDEX IF NOT EXISTS alerts_project_env_status_idx
  ON alerts (project_id, env, status, last_seen DESC);
`;

const MIGRATE_ALERTS_TABLE = `
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS silenced_until TIMESTAMPTZ;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS linked_task_id TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

CREATE SEQUENCE IF NOT EXISTS task_id_seq START 2000;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  env TEXT NOT NULL,
  title TEXT NOT NULL,
  route TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'P1',
  status TEXT NOT NULL DEFAULT 'Open',
  acceptance TEXT NOT NULL DEFAULT '',
  acceptance_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_date TEXT NOT NULL DEFAULT '',
  source_alert_id TEXT NOT NULL DEFAULT '',
  evidence_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  fix_release TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_project_env_status_idx
  ON tasks (project_id, env, status, created_at DESC);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fix_release TEXT NOT NULL DEFAULT '';
`;

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool({
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'afm',
    password: process.env.POSTGRES_PASSWORD ?? 'CHANGE_ME_DEV_SECRET',
    database: process.env.POSTGRES_DB ?? 'afm',
  });

  async onModuleInit() {
    await this.pool.query(CREATE_ALERTS_TABLE);
    await this.pool.query(MIGRATE_ALERTS_TABLE);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }
}
