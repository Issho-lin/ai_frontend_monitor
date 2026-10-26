# M3 — Minimal alerts (page metric degradation → notify a person)

Acceptance gate item 4: **core page metric degradation can alert and notify a person**.

This is a thin vertical slice on top of the existing `apps/api/src/alerts/` evaluator — not the full PRD alert product.

## What fires

The API process runs a scheduled evaluator every **60s** (and also on read of `/api/v1/alerts`). For each `(project_id, env)` seen in ClickHouse `afm.rum_events` in the last 24h it evaluates:

| Rule id | Metric | Window | Fire when |
|---------|--------|--------|-----------|
| `lcp-p75-threshold` | LCP P75 (route) | last 10m | P75 &gt; good line (2500ms) **and** either ≥ 4000ms, or no baseline, or &gt; 20% worse than 24h baseline |
| `js-error-rate` | Session JS error rate (route) | last 10m | rate above poor/severe lines vs baseline (see code) |
| `api-error-rate` | API error rate (`api_route`) | last 10m | same pattern |

**M3 “core page metric”** = the LCP rule. JS/API rules are already in-tree and share the same persist + notify path.

Alerts are upserted into Postgres `alerts` by `fingerprint` (`sha1(project|env|route|metric)`). When the breach clears, status becomes `resolved`.

## Notify a person

Set on the **api** process:

```bash
# Slack incoming webhook, Discord webhook, or any HTTPS receiver that accepts JSON POST
ALERT_WEBHOOK_URL=https://hooks.example.com/services/xxx

# Optional; default 15
ALERT_NOTIFY_DEDUPE_MINUTES=15
```

When an alert is (re)fired and `ALERT_WEBHOOK_URL` is set, api POSTs:

```json
{
  "text": "[S1] /checkout LCP P75 劣化 — LCP P75 3.20s (baseline 2.00s)",
  "alert": {
    "id": "alrt-…",
    "projectId": "demo",
    "env": "production",
    "title": "…",
    "severity": "S1",
    "status": "firing",
    "route": "/checkout",
    "metric": "LCP P75",
    "triggerValue": "…",
    "baseline": "…",
    "release": "…",
    "fingerprint": "…"
  }
}
```

**Dedupe:** `last_notified_at` on the row. Same fingerprint will not webhook again until `ALERT_NOTIFY_DEDUPE_MINUTES` (default **15**) elapses. Silenced / false-positive alerts are skipped. If the URL is unset, evaluation still persists — notify is no-op.

No in-repo Slack/email connector is required for M3; a webhook is enough. Point it at Slack Incoming Webhooks, a small Cloud Function, or `https://webhook.site/...` while testing.

## Read API (Console later)

```http
GET /api/v1/alerts?projectId=demo&env=production&window=24h
GET /api/v1/alerts/:id?projectId=demo&env=production
PATCH /api/v1/alerts/:id?projectId=demo&env=production
  { "action": "acknowledge" | "silence" | "false_positive", "silenceHours"?: 1|4|24 }
```

Gateway ingest auth (`AFM_PROJECT_TOKENS`) is unrelated and unchanged.

## Local test

1. Infra up (`docker compose up -d` for postgres/clickhouse/…) and api pointed at them (see `docs/local-run-m1.md` / prod compose).
2. Put a receiver URL in `.env` / api env: `ALERT_WEBHOOK_URL=…`.
3. Insert a bad LCP sample into ClickHouse (or drive the demo SDK), e.g. `metric_name='LCP'`, `metric_value=5000`, recent `timestamp`, non-empty `route`, matching `project_id`/`env`.
4. Wait ≤60s for the cron, or `GET /api/v1/alerts?projectId=demo&env=production` (triggers refresh).
5. Expect a `firing` row in the JSON response **and** one webhook POST. Repeat immediately → no second POST until ~15m (or clear `last_notified_at`).

Unit checks (no infra):

```bash
pnpm --filter @ai-frontend-monitor/api test -- alerts.rule.spec.ts notify.spec.ts
```

## Env cheat-sheet

| Var | Default | Where |
|-----|---------|--------|
| `ALERT_WEBHOOK_URL` | _(empty = persist only)_ | api |
| `ALERT_NOTIFY_DEDUPE_MINUTES` | `15` | api |
| `CLICKHOUSE_*` / `POSTGRES_*` | see `.env.example` | api |
| `AFM_PROJECT_TOKENS` | gateway only | **do not** remove for alerts |

## Alert rules API (Console — flip `USE_ALERT_RULES_MOCK` off)

Paths match `apps/console/src/api/alertRules.ts`.

### `GET /api/v1/alert-rules?projectId=demo&env=production`

Seeds three defaults per `(projectId, env)` if missing, then returns:

```json
[
  {
    "id": "lcp-p75-threshold",
    "name": "核心页面 LCP 劣化",
    "metric": "LCP P75",
    "poorThreshold": 2500,
    "severeThreshold": 4000,
    "unit": "ms",
    "enabled": true,
    "webhookUrl": "",
    "email": "",
    "updatedAt": "2026-10-24T05:00:00.000Z"
  },
  {
    "id": "js-error-rate",
    "name": "JS 错误率升高",
    "metric": "JS Error Rate",
    "poorThreshold": 1,
    "severeThreshold": 10,
    "unit": "percent",
    "enabled": true,
    "webhookUrl": "",
    "email": "",
    "updatedAt": "2026-10-24T05:00:00.000Z"
  },
  {
    "id": "api-error-rate",
    "name": "接口错误率升高",
    "metric": "API Error Rate",
    "poorThreshold": 2,
    "severeThreshold": 10,
    "unit": "percent",
    "enabled": true,
    "webhookUrl": "",
    "email": "",
    "updatedAt": "2026-10-24T05:00:00.000Z"
  }
]
```

Field meaning:

| Field | Meaning |
|-------|---------|
| `poorThreshold` | 不良线 — above this enters baseline-relative zone |
| `severeThreshold` | 严重线 — at/above → S0 |
| `enabled` | `false` → evaluator **skips** this rule |
| `webhookUrl` | Per-rule notify URL (preferred over env `ALERT_WEBHOOK_URL`) |
| `email` | Placeholder only — stored, not sent |

`id` equals evaluator `rule_id`: `lcp-p75-threshold` | `js-error-rate` | `api-error-rate`.

### `PATCH /api/v1/alert-rules/:id?projectId=demo&env=production`

Updates **one** rule (Console calls this per edit). Body (all fields optional):

```json
{
  "poorThreshold": 2500,
  "severeThreshold": 4000,
  "enabled": true,
  "webhookUrl": "https://hooks.example.com/xxx",
  "email": "oncall@example.com"
}
```

Response: the updated rule object (same shape as list item).

Persist table: Postgres `alert_rules` (`PRIMARY KEY (project_id, env, id)`).

### Evaluator behaviour

- Loads rule from `alert_rules` each evaluation.
- `enabled=false` → skip that rule (no new fires; does not auto-resolve in this slice).
- Thresholds from store replace hard-coded constants.
- Notify: `rule.webhookUrl` if non-empty, else `ALERT_WEBHOOK_URL`.

