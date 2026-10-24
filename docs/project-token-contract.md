# Project token contract (gateway ingest)

Console multi-project CRUD / token minting is **out of scope**. Auth is a static
`projectId → token` map loaded from environment on the **gateway**.

## Ingest auth

| Item | Value |
|------|--------|
| Endpoint | `POST /ingest` |
| Header (required) | `x-project-token: <plaintext token>` |
| Project id | `projectId` in JSON **body** (preferred) or `?projectId=` query |
| Body token | `token` field is accepted as fallback if the header is absent (SDK beacon path); prefer the header |

Rules:

1. Both `projectId` and token are required.
2. Token must **exactly** match the configured value for that `projectId`.
3. Unknown project / wrong token → `401 Unauthorized` (`Invalid project token.` / missing field messages).
4. Hardcoded single-demo check is removed; configuration is the source of truth.

### Env configuration

```bash
# Preferred
AFM_PROJECT_TOKENS='{"demo":"afm-demo-token","acme":"afm_replace_me"}'

# Alias (used only when AFM_PROJECT_TOKENS is unset/empty)
PROJECT_TOKENS='{"demo":"afm-demo-token"}'
```

- Value must be a JSON **object** of string → string.
- If **both** are unset/empty, gateway defaults to `{"demo":"afm-demo-token"}` so local Demo keeps working.
- Restart gateway after changing the map.

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
