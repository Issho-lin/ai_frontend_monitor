# AFM Demo

Minimal browser page that loads `@ai-frontend-monitor/sdk` and calls `afmInit` so PV + FCP/LCP auto-report to the local gateway. Buttons also fire explicit **API Timing** and **Error** events for M2 Console / ClickHouse smoke.

```bash
# from repo root (gateway should be on :3001)
pnpm --filter @ai-frontend-monitor/sdk build
pnpm install
pnpm dev:demo
# → http://127.0.0.1:5174/
```

Init uses `projectId=demo`, `env=production`, `token=afm-demo-token`, `endpoint=http://127.0.0.1:3001/ingest`. Match Console Overview filters to the same project/env. On the demo page, click 「上报一条 API Timing」 and 「抛一个 Error」 (or refresh if `pnpm dev:demo` was already running).
