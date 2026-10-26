-- M5: Console projects + ingest tokens.
-- token_hash is lowercase hex SHA-256 of the UTF-8 plaintext. Plaintext is never stored.
-- DELETE of a project hard-deletes its token rows (ON DELETE CASCADE).
-- alerts/issues/tasks are not cascaded.

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
