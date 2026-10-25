-- M4: session issue workflow state only (kind labels stay ClickHouse-derived).
-- Unique (project_id, env, route, kind). Does NOT replace alerts/tasks.

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
