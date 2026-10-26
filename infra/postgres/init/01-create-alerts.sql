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
  resolution TEXT,
  last_notified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alerts_project_env_status_idx
  ON alerts (project_id, env, status, last_seen DESC);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_project_env_status_idx
  ON tasks (project_id, env, status, created_at DESC);

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

