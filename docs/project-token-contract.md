# Project token contract (gateway ingest)

Mint and revoke tokens with `/api/v1/projects` (see [M5-projects-console.md](./M5-projects-console.md)).
Gateway accepts `x-project-token` when its SHA-256 matches a non-revoked `project_tokens` row for that `projectId`.
Plaintext is stored only in the create-token response, never in Postgres.

`AFM_PROJECT_TOKENS` / `PROJECT_TOKENS` seed an **empty** `projects` table and remain a fallback when Postgres is unreachable, or when that `projectId` has no `projects` row yet.

## Ingest auth

| Item | Value |
|------|--------|
| Endpoint | `POST /ingest` |
| Header (required) | `x-project-token: <plaintext token>` |
| Project id | `projectId` in JSON **body** (preferred) or `?projectId=` query |
| Body token | `token` field is accepted as fallback if the header is absent (SDK beacon path); prefer the header |

Rules:

1. Both `projectId` and token are required.
2. A live DB row wins: `project_tokens.token_hash` = lowercase hex SHA-256 of the UTF-8 plaintext, `enabled`, `revoked_at IS NULL`, same `project_id`.
3. Unknown project / wrong token / revoked token → `401 Unauthorized` (`Invalid project token.` / missing field messages).
4. Env map is **not** consulted when the project row exists. A revoked token stays rejected even if the env map still lists that plaintext.
5. If Postgres errors, or there is no `projects` row, the env map is an exact plaintext fallback (so `demo` / `afm-demo-token` keeps working before seed).
6. Gateway caches the verdict for `AFM_TOKEN_CACHE_TTL_MS` (default `5000`). Mint, revoke, and project delete run `NOTIFY afm_project_tokens` to drop that cache. DB tokens do not need a gateway restart. If a notification is missed, the TTL is the backstop.

### Env configuration

```bash
# Preferred
AFM_PROJECT_TOKENS='{"demo":"afm-demo-token","acme":"afm_replace_me"}'

# Alias (used only when AFM_PROJECT_TOKENS is unset/empty)
PROJECT_TOKENS='{"demo":"afm-demo-token"}'
```

- Value must be a JSON **object** of string → string.
- If **both** are unset/empty, the map defaults to `{"demo":"afm-demo-token"}` so local Demo keeps working.
- API startup inserts that map only when `projects` is empty (hash + `token_masked`; name `环境变量种子`). A non-empty table is not re-seeded.
- Changing the env map still needs a process restart to change the **fallback**. Tokens minted in the API apply without a gateway restart.
- `DELETE /api/v1/projects/:id` is a hard delete and cascades token rows. After that, if the same id is still in the env map and has no `projects` row, the env fallback can accept it again.

### Demo default

| Field | Value |
|-------|--------|
| `projectId` | `demo` |
| token | `afm-demo-token` |
| typical env | `production` (Overview filters) |

## Rate limit

In-memory fixed window on gateway ingest (not Redis yet):

| Env | Default | Meaning |
|-----|---------|---------|
| `INGEST_RATE_LIMIT` | `120` | max requests per window |
| `INGEST_RATE_WINDOW_MS` | `60000` | window length |

Key = `projectId|clientIp` (uses `X-Forwarded-For` when present). Over limit → `429 Too Many Requests`.

## Field redaction

Before events are published to Kafka, gateway scrubs obvious PII-ish fields:

- **`context.attributes` keys** (case-insensitive; separators optional):  
  `password`, `passwd`, `secret`, `token`, `authorization`, `cookie`, `set-cookie`,  
  `email`, `phone`, `mobile`, `ssn`, `creditcard` / `cardnumber`, `cvv`,  
  `apikey`, `access_token`, `refresh_token`  
  → string values masked (`ab***yz`) or `[REDACTED]`.
- Nested plain objects under `attributes` are scrubbed one level deep with the same key rules.
- **URL query params** with the same sensitive names on `pageUrl`, `apiTimings[].url`, and `resources[].url` → value replaced with `[REDACTED]`.
- Error `message` / `stack` are **not** stripped (needed for debugging).

See `apps/gateway/src/redact.ts`.

## Example curl

```bash
curl -sS -X POST 'http://127.0.0.1:3001/ingest' \
  -H 'content-type: application/json' \
  -H 'x-project-token: afm-demo-token' \
  -d '{
    "projectId": "demo",
    "env": "production",
    "route": "/",
    "pageUrl": "http://127.0.0.1:5174/?email=a@b.com",
    "occurredAt": "2026-10-24T05:00:00.000Z",
    "recordPageView": true,
    "context": {
      "release": "dev",
      "sdkVersion": "0.0.1",
      "sessionId": "s1",
      "userIdHash": "u",
      "deviceType": "desktop",
      "os": "macOS",
      "browser": "Chrome",
      "networkType": "4g",
      "sampleRate": 1,
      "attributes": { "email": "a@b.com", "feature": "ok" }
    }
  }'
```
