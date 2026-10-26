import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';

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

CREATE TABLE IF NOT EXISTS alert_rules (
  project_id TEXT NOT NULL,
  env TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  metric TEXT NOT NULL,
  poor_threshold DOUBLE PRECISION NOT NULL,
  severe_threshold DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  webhook_url TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, env, id)
);

CREATE INDEX IF NOT EXISTS alert_rules_project_env_idx
  ON alert_rules (project_id, env);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  env TEXT NOT NULL,
  route TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('abnormal', 'slow')),
  workflow_status TEXT NOT NULL DEFAULT 'open'
    CHECK (workflow_status IN ('open', 'acked', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT issues_project_env_route_kind_uq UNIQUE (project_id, env, route, kind)
);

CREATE INDEX IF NOT EXISTS issues_project_env_status_idx
  ON issues (project_id, env, workflow_status, updated_at DESC);
`;

/** M5: projects + token hashes. Plaintext tokens are never stored. */
const CREATE_PROJECTS_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  env TEXT NOT NULL CHECK (env IN ('production', 'staging', 'development')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_tokens (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Lowercase hex SHA-256 of the UTF-8 plaintext. Plaintext is never stored.
  token_hash TEXT NOT NULL,
  token_masked TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS project_tokens_hash_unique
  ON project_tokens (token_hash);

CREATE INDEX IF NOT EXISTS project_tokens_project_id_idx
  ON project_tokens (project_id, created_at DESC);

-- Earlier drafts used these names. Drop them when the canonical index exists
-- so a restarted API does not keep two indexes on the same column.
DROP INDEX IF EXISTS project_tokens_token_hash_uq;
DROP INDEX IF EXISTS project_tokens_project_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_env_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_env_check
      CHECK (env IN ('production', 'staging', 'development'));
  END IF;
END $$;
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
    await this.pool.query(CREATE_PROJECTS_TABLE);
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

  /** One pooled connection for advisory locks / multi-statement transactions. */
  async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
}
