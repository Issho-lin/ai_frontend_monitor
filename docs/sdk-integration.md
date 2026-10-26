# AFM SDK 接入说明

> **状态**：Gateway 项目 Token 鉴权 / 限流 / 脱敏契约已定稿，见 [project-token-contract.md](./project-token-contract.md)、[prod-run.md](./prod-run.md)。  
> **范围**：`packages/sdk` + 本文档。Token 由 Gateway 环境变量映射发放；**Console 无项目 CRUD / Token 铸造**（顶栏填 `projectId`，SDK 带 token）。  
> **对照**：真实能力以 `packages/sdk` 源码与 `apps/demo` 为准；本地联调见 [local-run-m1.md](./local-run-m1.md)。

---

## 1. 安装 / 引入

### 包名（仓库现状）

| 项 | 当前值 |
|----|--------|
| npm 包名 | `@ai-frontend-monitor/sdk` |
| 版本 | `0.0.1`（`packages/sdk/package.json`） |
| 发布状态 | `"private": true`，**尚未发包到 registry** |
| 依赖 | `@ai-frontend-monitor/schema`（workspace） |

### Workspace 内接入（当前推荐）

本仓库为 pnpm monorepo。业务应用与 Demo 一样声明 workspace 依赖即可：

```json
{
  "dependencies": {
    "@ai-frontend-monitor/sdk": "workspace:*"
  }
}
```

根目录安装并构建 SDK：

```bash
pnpm install
pnpm --filter @ai-frontend-monitor/sdk build
# 或：pnpm build:packages
```

应用内 ESM 引入：

```ts
import {
  afmInit,
  afmFlush,
  afmTrackPageView,
  afmTrackWebVital,
  afmTrackError,
  afmTrackApiTiming,
  afmTrackResource,
} from '@ai-frontend-monitor/sdk'
```

> **占位（待发包）**：正式发布后改为 registry 安装，例如 `pnpm add @ai-frontend-monitor/sdk@x.y.z`（版本号待定）。CDN / `<script>` UMD 形态当前 **未提供**，勿编造。

---

## 2. 初始化

调用 `afmInit` 一次（通常在应用入口、尽早执行）。未初始化时，手动上报 API 会抛错：`AFM SDK has not been initialized. Call afmInit() first.`

### 必填 / 常用选项（对照 `AfmInitOptions`）

| 字段 | 必填 | 说明 |
|------|------|------|
| `projectId` | 是 | 项目标识；写入 ingest **body**（或可由查询串携带，SDK 走 body） |
| `env` | 是 | 运行环境（schema 的 `RuntimeEnv`，Demo 使用 `production`） |
| `endpoint` | 否 | 上报地址；默认 `http://127.0.0.1:3001/ingest` |
| `token` | 否* | 项目 Token；fetch 走请求头 `x-project-token`，beacon 写入 body 的 `token` 字段作回退 |
| `release` | 否 | 构建版本；未设时读 `<meta name="afm-release">` 或 `window.__AFM_RELEASE__` |
| `sampleRate` | 否 | 客户端采样率，默认 `1`（全量）；按 session 决定是否采样 |
| `autoTrack` | 否 | 默认 `true`：自动采集 PV / Web Vitals / 错误 / fetch·XHR |
| `sessionId` / `userIdHash` | 否 | 未设则 SDK 在 sessionStorage / localStorage 生成并持久化 |
| `sdkVersion` / `defaultRoute` / `defaultPageUrl` | 否 | 一般可省略 |

\* Gateway 要求 `projectId` + token 均存在且匹配配置；未传 `token` 会被拒（`401`）。

### Token 与 Console（定稿）

- **鉴权契约**：`POST /ingest` 必带 header `x-project-token` + body/query `projectId`。Gateway 认该项目在库里未吊销的 Token（SHA-256）。`AFM_PROJECT_TOKENS`（或 `PROJECT_TOKENS`）只在 `projects` 表为空时种子写入，并在数据库不可达时兜底；两者都未配置时仍默认 `demo` + `afm-demo-token`。完整规则见 [project-token-contract.md](./project-token-contract.md)。
- **Console**：发 Token 的 API 是 `POST /api/v1/projects/:id/tokens`（明文只在这次响应里）。页面是否仍走 mock 由 `USE_PROJECTS_MOCK` 决定，接真另做。
- **轮换**：调吊销接口后再签发新 Token，不必为新 Token 改 env 或重启 Gateway。业务侧同步更新 `afmInit` 的 `token`。
- **Demo 默认**：本地仍可用 `projectId: 'demo'`、`token: 'afm-demo-token'`（与默认映射一致）。**不要**把 demo token 用于正式环境——生产请在 `.env` / compose 中配置真实映射，见 [prod-run.md](./prod-run.md)。

### 最小初始化示例

```ts
afmInit({
  projectId: 'demo', // 正式：替换为 AFM_PROJECT_TOKENS 中的 key
  env: 'production',
  token: 'afm-demo-token', // 正式：替换为该 projectId 对应的 token
  endpoint: 'http://127.0.0.1:3001/ingest', // 正式：见下文「正式环境 URL」
  // autoTrack 默认 true
  // sampleRate 默认 1
})
```

生产形部署示例：`endpoint: 'https://ingest.example.com/ingest'`，并继续发送 `x-project-token` + `projectId`（见 [prod-run.md](./prod-run.md) HTTPS 说明）。

---

## 3. 默认采集（`autoTrack: true` 且采样命中时）

以下为 **SDK 已实现** 的自动行为，勿与 PRD 规划能力混淆。

| 类别 | 行为 | 说明 |
|------|------|------|
| **PV（页面浏览）** | 初始化后上报一次；`pushState` / `replaceState` / `popstate` / `hashchange` 路由变化再报 | `recordPageView: true`；hash 路由（`#/path`）会归一化 |
| **Web Vitals** | FCP、LCP、INP、CLS、TTFB | PerformanceObserver / Navigation Timing；LCP 稳定或页面隐藏时落定；CLS/INP 在页面隐藏时 finalize |
| **接口（API Timing）** | 拦截 `fetch` 与 `XMLHttpRequest` | 记录 method、归一化 `apiRoute`、status、duration、可选 traceId；**忽略对 ingest endpoint 自身的请求** |
| **错误** | `window` error、`unhandledrejection`、资源加载失败（capture） | `errorType`: `js` / `promise` / `resource`；带 `stackHash` |
| **资源（Resource Timing）** | 页面隐藏时从 Performance Resource Timing 抽样 | 默认最多约 20 条；过滤 ingest URL |
| **缓冲与发送** | 错误 / API / 资源进内存缓冲，idle 或约 2s 后 `afmFlush`；隐藏页可用 `sendBeacon` | 每类缓冲上限 50，溢出丢弃；上报失败吞掉，不影响业务 |

关闭自动采集：`afmInit({ ..., autoTrack: false })`，再按需调用手动 API。

### 手动上报 API（已导出）

| 函数 | 用途 |
|------|------|
| `afmTrackPageView` | 手动 PV（可附带 metrics） |
| `afmTrackWebVital` | 手动单条 Web Vital |
| `afmTrackError` | 手动 JS 错误（auto 关闭或业务显式上报） |
| `afmTrackApiTiming` | 手动单条接口耗时 |
| `afmTrackResource` | 手动单条资源耗时 |
| `afmFlush` | 立即刷出缓冲（可选 `{ beacon: true }`） |

另导出底层采集工具（一般业务无需直接用）：`installErrorCollector`、`installNetworkCollector`、`installWebVitalCollector`、`installNavigationCollector`、`collectResources`、`normalizeRoute`、`computeStackHash` 等。

### SDK 与契约对齐（已核对）

`packages/sdk` 当前实现与定稿契约一致，无需为鉴权改 SDK：

| 契约项 | SDK 行为 |
|--------|----------|
| Header `x-project-token` | `transport.ts`：fetch 时若 payload 有 `token` 则设置该头 |
| Body `projectId` | `buildPayload` 写入 `projectId` |
| Beacon 回退 | `sendBeacon` 无法自定义头；token 留在 JSON body 的 `token` 字段（Gateway 接受 header 缺失时的 body 回退） |

---

## 4. 与 Demo 对照的最小示例

完整可运行页：`apps/demo/src/main.ts`。本地：`pnpm build:packages` 后 `pnpm dev:demo` → http://127.0.0.1:5174/（Gateway 需在 `:3001`）。

```ts
import {
  afmInit,
  afmTrackApiTiming,
  afmTrackError,
  afmTrackPageView,
} from '@ai-frontend-monitor/sdk'

const ENDPOINT = 'http://127.0.0.1:3001/ingest'

afmInit({
  projectId: 'demo',
  env: 'production',
  token: 'afm-demo-token',
  endpoint: ENDPOINT,
  // autoTrack 默认 true → PV + FCP/LCP 等自动上报
})

// 可选：再打一条 PV
await afmTrackPageView()

// 可选：显式 API Timing / Error（Demo 按钮同款）
await afmTrackApiTiming({
  apiRoute: '/api/v1/overview',
  method: 'GET',
  url: 'http://127.0.0.1:3000/api/v1/overview?projectId=demo&env=production',
  statusCode: 200,
  duration: 128,
  route: '/',
})

await afmTrackError({
  name: 'DemoError',
  message: 'M2 smoke: intentional demo error',
  stack: 'DemoError: M2 smoke: intentional demo error\n    at demo',
  kind: 'js',
  route: '/',
})
```

**Demo 鉴权（与 Gateway 默认映射一致；非硬编码特例）**：

| 字段 | 值 |
|------|-----|
| `projectId` | `demo` |
| `env` | `production` |
| `token` | `afm-demo-token` |
| `endpoint` | `http://127.0.0.1:3001/ingest` |

> 接入示例仍正确：未配置 `AFM_PROJECT_TOKENS` 时 Gateway 默认仍认上表。若你在 `.env` 里改了映射，Demo / SDK 需同步改 `token`。

Console Overview 验收时顶栏填同一 `demo` / `production`。详见 [local-run-m1.md](./local-run-m1.md)。

---

## 5. 正式环境：URL / Token / 限流 / 脱敏（定稿摘要）

细节以契约文档为准；此处供接入方快速对照。

### 正式环境 URL

| 项 | 说明 |
|----|------|
| 本地默认 | SDK `endpoint` 默认 `http://127.0.0.1:3001/ingest` |
| 生产形本机 | Compose 后 Gateway 宿主端口默认 `3001`；见 [prod-run.md](./prod-run.md) |
| 公网 | 在 Caddy/nginx 等前终止 TLS，将 `endpoint` 指到 `https://ingest.example.com/ingest`（示例主机名见 prod-run） |
| CORS | 由 Gateway / 反代配置；SDK 使用 `fetch` + JSON，跨域需允许 `POST` 与 `x-project-token` |

### Token 申请 / 轮换

| 项 | 定稿 |
|----|------|
| 配置 | 库内未吊销 Token。空库种子 / 兜底：`AFM_PROJECT_TOKENS`（优先）或 `PROJECT_TOKENS` |
| 默认 | 两者皆空 → `{"demo":"afm-demo-token"}`（写入空库或作兜底） |
| Console | `POST /api/v1/projects/:id/tokens` 签发；`USE_PROJECTS_MOCK` 仍可能让页面走 mock |
| 轮换 | 吊销后再签发；Gateway 认库，新 Token 不必改 env / 重启 |

### 采样与限流

| 层 | 行为 |
|----|------|
| SDK | `sampleRate`（按 session）；缓冲上限 50/类 |
| Gateway | 内存固定窗口：`INGEST_RATE_LIMIT`（默认 `120`）/ `INGEST_RATE_WINDOW_MS`（默认 `60000`）；键 `projectId\|clientIp`；超限 `429` |

### 脱敏

Gateway 在写入 Kafka 前 scrub（见契约「Field redaction」与 `apps/gateway/src/redact.ts`）：

- `context.attributes` 敏感键（password、token、email、phone 等）→ 掩码或 `[REDACTED]`
- `pageUrl` / `apiTimings[].url` / `resources[].url` 上同名 query → `[REDACTED]`
- 错误 `message` / `stack` **不**剥（便于排障）
- SDK 侧另有路由归一化（去 query/hash、路径 id → `:id`）

完整表与 curl 示例：[project-token-contract.md](./project-token-contract.md)。

其它可选后续（非接入必填）：npm 正式发包与版本策略、Source Map / release 关联、SSR 注意点（SDK 在无 `window` 时采集器为空操作，但仍应在浏览器入口 `afmInit`）。

---

## 相关文档

- [project-token-contract.md](./project-token-contract.md) — ingest 鉴权、限流、脱敏定稿
- [prod-run.md](./prod-run.md) — 生产形 Compose / HTTPS / ingest 主机
- [M1 本地怎么跑](./local-run-m1.md) — Demo → Gateway → Worker → Console
- `apps/demo/README.md` — Demo 启动与鉴权摘要
- `packages/sdk/src/index.ts` — 导出 API 与 `AfmInitOptions` 定义
- `packages/sdk/src/transport.ts` — `x-project-token` 发送实现
