# AFM SDK 接入说明（骨架）

> **状态**：产品刚开优先级 1 文档骨架。验收方向是「可上线使用」，但 **正式环境 URL、采样/限流/脱敏策略尚未由后端落定**——下文对应处用占位符，并以「待补」标明。  
> **范围**：`packages/sdk` + 本文档。Token **一期**由服务端配置 / 环境变量发放；Console「项目 / Token」CRUD（路由 `/projects` 代码保留、侧栏入口已搁置）标为**二期**。  
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
| `projectId` | 是 | 项目标识，与 Console / Gateway 侧一致 |
| `env` | 是 | 运行环境（schema 的 `RuntimeEnv`，Demo 使用 `production`） |
| `endpoint` | 否 | 上报地址；默认 `http://127.0.0.1:3001/ingest` |
| `token` | 否 | 项目 Token；fetch 走请求头 `x-project-token`，beacon 写入 body |
| `release` | 否 | 构建版本；未设时读 `<meta name="afm-release">` 或 `window.__AFM_RELEASE__` |
| `sampleRate` | 否 | 采样率，默认 `1`（全量）；按 session 决定是否采样 |
| `autoTrack` | 否 | 默认 `true`：自动采集 PV / Web Vitals / 错误 / fetch·XHR |
| `sessionId` / `userIdHash` | 否 | 未设则 SDK 在 sessionStorage / localStorage 生成并持久化 |
| `sdkVersion` / `defaultRoute` / `defaultPageUrl` | 否 | 一般可省略 |

### Token 说明（占位）

- **一期（推荐主路径）**：Token 由**服务端配置 / 环境变量**发放与轮换（与 Gateway 鉴权配置对齐），业务侧把拿到的值填入 `afmInit({ token })`。ingest 使用请求头 `x-project-token` + `projectId`。**不要**把「去 Console 点按钮发 Token」当成当前上线主路径。
- **二期（已搁置）**：Console「项目管理」页生成 / 吊销 Token（明文只展示一次，服务端仅存 hash）。前端壳与 API 路径仍保留在 `apps/console`（`/projects`、`apps/console/src/api/projects.ts`），侧栏入口已摘掉，待后端契约齐后再挂导航。
- **当前 Demo Token**：仅本地 Gateway 硬编码校验可用：`afm-demo-token`，且仅匹配 `projectId=demo`。**不可用于正式环境**。
- 未传 `token` 时，本地非 demo 项目会被 Gateway 拒绝（`UnauthorizedException`）。

### 最小初始化示例

```ts
afmInit({
  projectId: 'demo', // 正式：替换为你的 projectId
  env: 'production',
  token: 'afm-demo-token', // 正式：替换为后端签发的 project token（占位）
  endpoint: 'http://127.0.0.1:3001/ingest', // 正式：替换为生产 ingest URL（占位）
  // autoTrack 默认 true
  // sampleRate 默认 1
})
```

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

**Demo 鉴权（与 Gateway 硬编码一致）**：

| 字段 | 值 |
|------|-----|
| `projectId` | `demo` |
| `env` | `production` |
| `token` | `afm-demo-token` |
| `endpoint` | `http://127.0.0.1:3001/ingest` |

Console Overview 验收时顶栏选同一 `demo` / `production`。详见 [local-run-m1.md](./local-run-m1.md)。

---

## 5. 待补（等后端落点）

以下条目 **当前文档仅占位**，正式上线前需后端 / 平台契约补齐后再改本文：

| 项 | 现状 | 待补内容 |
|----|------|----------|
| **正式环境 URL** | SDK 默认本地 `http://127.0.0.1:3001/ingest` | 生产 / 预发 Gateway ingest 基址、HTTPS、跨域 CORS、多区域 |
| **Token 申请 / 轮换** | 仅本地 `afm-demo-token`；Gateway 硬编码 demo；一期走服务端配置/环境变量 | 项目级可配鉴权、签发与轮换、失效策略；**Console 发 Token UI 为二期**（后端契约后挂回导航） |
| **采样限流** | SDK 侧已有 `sampleRate`（按 session）；缓冲上限 50/类 | 服务端采样策略、按项目配额、网关限流、与 SDK `sampleRate` 的约定 |
| **脱敏** | 路由归一化会去掉 query/hash、路径 id 置为 `:id`；**无**通用 PII 脱敏管线 | 报文字段白名单/黑名单、URL/堆栈/自定义 attributes 脱敏规则、合规要求 |

其它可选后续（非本骨架必填，但上线常需）：npm 正式发包与版本策略、Source Map / release 关联、SSR 注意点（SDK 在无 `window` 时采集器为空操作，但仍应在浏览器入口 `afmInit`）。

---

## 相关文档

- [M1 本地怎么跑](./local-run-m1.md) — Demo → Gateway → Worker → Console
- `apps/demo/README.md` — Demo 启动与鉴权摘要
- `packages/sdk/src/index.ts` — 导出 API 与 `AfmInitOptions` 定义
