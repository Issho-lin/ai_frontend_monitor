# M2 执行计划：数据面扩展

> **目标**：把 M1 打通的"单一 PV + Web Vitals"链路扩展到全量数据面 —— JS Error / API Timing / Resource Timing 三类事件能上报与查询，Pages、APIs、Errors 三个 Console 页面从 mock 切到真实数据。
> **前置**：M1 已端到端验证通过（SDK→Gateway→Redpanda→Worker→ClickHouse→API→Console Overview）。
> **验收标准**（必须全部满足）：
> 1. JS Error 事件能从 SDK 上报到 ClickHouse `rum_events`，并在 Console Errors 页显示
> 2. API Timing 事件能上报并在 APIs 页显示（P50/P95、错误率、超时率、QPS）
> 3. Resource Timing 事件能上报并进入 Page Detail 的资源瀑布
> 4. Pages 页按 route 聚合显示 PV / LCP P75 / INP P75 / CLS P75 / JS 错误率 / API P95 / 通过率
> 5. 三页在 API 不可用时仍 fallback 到 mock，不中断渲染

---

## 待决策项（M1 遗留坑2）—— ✅ 已决策：方案 A

**已落地（2026-07-03）**：`infra/clickhouse/init/02-create-tables.sql` 的 `rum_metrics_1m/1h` 已从 `SummingMergeTree` 改为 `AggregatingMergeTree`，列改 `avgState`/`quantileState(0.x)`/`countState()`，查询端用 `avgMerge`/`quantileMerge`/`countMerge`。`event_type` 加了 `WHERE = 'web_vital'` 过滤（MV 只服务 web vital 指标）。

已 live 验证：插 2 条 LCP（2400/3000ms）→ `OPTIMIZE FINAL` → `quantileMerge(0.75)(p75_value)` 返回 2850，`countMerge(sample_count)` 返回 2，分位数语义正确。

**重建副作用**：MV 不回填历史行，重建后旧 M1 数据（30 行）只留在 `rum_events` 明细表，不进新 MV。已 `TRUNCATE rum_events/rum_metrics_1m/1h` 清空，M2 demo 数据需重新上报一遍。

> ⚠️ 若以后改 MV 还要重建：`docker exec -i afm-clickhouse clickhouse-client --user afm --password CHANGE_ME_DEV_SECRET --database afm --query "DROP TABLE IF EXISTS rum_metrics_1m; DROP TABLE IF EXISTS rum_metrics_1h;"` 后重跑 `02-create-tables.sql`。

---

## 阶段划分（沿用 M1 文档）

| 阶段 | 范围 | 验收 |
|------|------|------|
| M2：数据面扩展 | schema 扩展 + SDK 采集三类事件 + Gateway 拆分 + API 三个 endpoint + Console 三页真数据 | 5 条验收标准全部满足 |
| M3：治理能力 | Alerts / Releases / Tasks / Verification 闭环 | 告警→诊断→任务→验证 |
| M4：Agent 能力 | 只读取证工具 / Evidence Pack / Diagnosis Report | Agent 生成诊断报告 |

**当前只执行 M2。**

---

## M2 施工顺序

### Step 1：扩展 Schema（`packages/schema`）—— ✅ 已完成

**改动**：`IngestPayload` 现在只支持 `metrics`（Web Vitals）。新增三类事件的上报字段，保持单次上报可携带多类事件。

`event.ts` 新增类型：

```ts
export interface JsErrorEvent {
  name: string          // Error.name 或 'unhandledrejection'
  message: string
  stackHash: string     // 客户端预计算，用于聚合
  stack?: string        // 原始栈，M2 可暂不落库或截断存 attributes
  route?: string        // 覆盖上报时 route
}

export interface ApiTimingEvent {
  apiRoute: string      // 归一化后的接口路径
  method: string
  url?: string
  statusCode: number
  duration: number      // ms
  isTimeout?: boolean
  traceId?: string
}

export interface ResourceTimingEvent {
  url: string
  initiatorType: string // script/css/img/font/fetch/other
  size: number
  duration: number      // ms
  failed?: boolean
  route?: string
}

export interface IngestPayload {
  projectId: string
  token?: string
  env: RuntimeEnv
  route: string
  pageUrl: string
  occurredAt: string
  metrics?: MetricValues
  errors?: JsErrorEvent[]
  apiTimings?: ApiTimingEvent[]
  resources?: ResourceTimingEvent[]
  context: EventContext
}
```

`RUMEvent` 字段已覆盖三类事件（`error_name`/`error_stack_hash`/`api_route`/`status_code`/`duration`/`resource_url`/`resource_type`/`resource_size`），**表结构无需改**。

**关键决策**：`error_stack_hash` 由 SDK 计算（sha1 截断栈前 N 行），保证同一错误归并到同一 hash。M2 不接 sourcemap，直接用原始栈 hash。

---

### Step 2：扩展 SDK 采集（`packages/sdk`）—— ✅ 已完成

**M1 现状**：`index.ts` 只有 `init/trackPageView/trackWebVital`，Web Vitals 用内置模拟值，不接真实 Performance API。

**M2 已落地**：

```ts
AFM.trackError({ name, message, stack })
AFM.trackApiTiming({ apiRoute, method, statusCode, duration, traceId })
AFM.trackResource({ url, initiatorType, size, duration, failed })
AFM.flush()  // 主动冲刷自动采集缓冲
```

**采集策略（已实现）**：
- **JS Error**：`init()` 内（`autoTrack` 默认 true）自动注册 `window.addEventListener('error', ...)`、`unhandledrejection`、以及 capture 阶段的资源错误监听（img/script/link 失败）。`stackHash` 用 djb2 同步 hash 前 3 帧栈文本（非 crypto hash，只需确定性用于分组；避免 crypto.subtle 异步与非安全上下文问题）。
- **API Timing**：自动 monkey-patch `window.fetch` + `XMLHttpRequest.prototype.open/send`，记录 method/url/statusCode/duration，url 经 `normalizeRoute` 归一化为 apiRoute。patch 透明，对业务代码无感；通过 `arguments` 原样转发保证 async/username/password 等参数不丢。
- **Resource Timing**：导出 `collectResources(push, {route, max, ingestEndpoint})`，遍历 `performance.getEntriesByType('resource')`，默认采前 20 条并过滤 SDK 自身 ingest endpoint。`failed` 判定：优先用 `entry.responseStatus`（新版浏览器），否则 `transferSize===0 && duration>0`。
- **route 归一化**：`normalizeRoute(input)` 共享函数 —— 去 query/hash，数字段/hex(≥8)/UUID 段折叠为 `:id`，页面与 API 路由共用。已通过 smoke test：`/orders/12345`→`/orders/:id`、`/users/507f1f77bcf86cd7`→`/users/:id`、UUID 段折叠、`/api/v2/list` 保持不变。

**上报合并**：自动采集事件进入内存缓冲（每类上限 50 条防溢出），在 `requestIdleCallback`（无则 2s setTimeout）或 `pagehide`/`beforeunload` 时合并成**一个** `IngestPayload` 发出，减少请求数。手动 `track*` 仍即时单发（沿用 M1 模式）。

**关键决策**：
- 采集 + 归一化全部放 SDK，Gateway 不做业务归一化。
- `init({ autoTrack: false })` 可关掉自动采集（demo 页或 SSR 可关）。
- SDK 在非浏览器环境（无 `window`/`fetch`/`performance`）所有 collector 自动 no-op，安全可 import。

**验证**：`pnpm --filter @ai-frontend-monitor/sdk build` ✓；下游 gateway/api build 均通过；`normalizeRoute` + `computeStackHash` smoke test 全 PASS。

---

### Step 3：扩展 Gateway 拆分（`apps/gateway`）—— ✅ 已完成

**改动**：`IngestionService.expandPayload` 已从只拆 `page_view` + `web_vital` 扩展到三类新事件：

```ts
for (const err of payload.errors ?? []) {
  events.push({
    ...baseEvent,
    event_type: 'error',
    route: err.route ?? payload.route,
    route_hash: sha1(route),
    error_name: err.name,
    error_stack_hash: err.stackHash,
    attributes: { ...contextAttrs, message: err.message, stack: err.stack, errorType: 'js'|'promise'|'resource' },
  })
}
for (const api of payload.apiTimings ?? []) {
  events.push({
    ...baseEvent,
    event_type: 'api_timing',
    api_route: api.apiRoute,
    status_code: api.statusCode,
    duration: api.duration,
    trace_id: api.traceId ?? baseEvent.trace_id,
    attributes: { ...contextAttrs, method: api.method, url: api.url, isTimeout: api.isTimeout },
  })
}
for (const res of payload.resources ?? []) {
  events.push({
    ...baseEvent,
    event_type: 'resource_timing',
    route: res.route ?? payload.route,
    route_hash: sha1(route),
    resource_type: normalizeResourceType(res.initiatorType),
    resource_url: res.url,
    resource_size: res.size,
    duration: res.duration,
    attributes: { ...contextAttrs, failed: res.failed, initiatorType: res.initiatorType },
  })
}
```

**落地细节**：
- `context.attributes` 与单事件 attributes 合并，保留 `source/tenant/...` 这类全局上下文
- `resource_type` 做了归一化：`image→img`、`link/style→css`、未知值→`other`
- `errorType` 暂由 gateway 按 `error_name` 推断（`unhandledrejection`→promise，`resource_error`→resource，其余→js）
- 错误/资源事件支持覆盖 route，并重新计算 `route_hash`

**验证**：gateway build ✓；runtime smoke test ✓ —— 1 PV + 2 vitals + error + api_timing + resource_timing = 6 条，`errorRoute/apiRoute/apiTrace/resourceType/resourceRoute/errorTypeAttr` 均映射正确。

**不做**（M3 再做）：限流、采样服务端强制、脱敏。M2 仍硬编码 `demo` token 放行。

---

### Step 4：Worker（无改动）

`apps/worker` 通用地把任意 `RUMEvent` 写入 `rum_events`，三类新事件无需改代码。**保留 M1 单条写**，M2 若 QPS 升明显再加攒批（攒批在 `main.ts` 改：consumer 回调攒到队列，100 条或 2s flush）。

---

### Step 5：API 新增三个 endpoint（`apps/api`）—— ✅ 已完成

已新增 `apps/api/src/listings/` 模块：`ListingsController` + `ListingsService`，注册到 `AppModule`，提供 `/api/v1/pages`、`/api/v1/apis`、`/api/v1/errors` 三个 endpoint。复用 M1 的 `@clickhouse/client` 连接。

#### 5.1 `GET /api/v1/pages?projectId=demo&env=production`

按 route 聚合并映射到 console `PageRow`：
- `pv` / `affectedUsers`：`countIf/uniqIf` over `page_view`
- `lcpP75/inpP75/clsP75`：`quantileIf(0.75)` over `web_vital`
- `jsErrorRate`：`countIf(error) / countIf(page_view) * 100`
- `apiP95`：`quantileIf(0.95)(duration)` over `api_timing`
- `passRate`：Node 层复用 schema 的 `isGoodMetric()` + 业务阈值（`jsErrorRate<=0.5`、`apiP95<=800`）计算
- `trend`：按达标率粗略映射（>=85 down / >=70 flat / else up），只为兼容现有原型 UI

#### 5.2 `GET /api/v1/apis?projectId=demo&env=production`

对齐 `ApiRow`：按 `api_route + method` 聚合 P50/P95、错误率、超时率、QPS、trace 覆盖率。

```sql
SELECT
  api_route AS api,
  upper(toString(attributes.method)) AS method,
  quantile(0.5)(duration) AS p50,
  quantile(0.95)(duration) AS p95,
  (countIf(status_code >= 400 OR status_code = 0) / count()) * 100 AS error_rate,
  (countIf(toBool(attributes.isTimeout)) / count()) * 100 AS timeout_rate,
  count() AS total_requests,
  countIf(length(trace_id) > 0) AS traced_requests
...
```

> ✅ 实测确认：`attributes` 在当前表里是 **ClickHouse 原生 `JSON` 类型**，应使用 **点访问**（`attributes.method` / `attributes.isTimeout` / `attributes.message`），**不能**再用 `JSONExtractString/Bool(attributes, ...)`。之前文档写反了，已在实测后修正。

#### 5.3 `GET /api/v1/errors?projectId=demo&env=production`

对齐 `ErrorGroup`：按 `error_stack_hash` 聚合，返回：
- `id`：`err-${hex(cityHash64(error_stack_hash))}`
- `message`：`argMin(toString(attributes.message), timestamp)` 取首个 message，空则回退 `error_name`
- `type`：直接取 `attributes.errorType`（js/promise/resource）
- `route/release/count/affectedUsers/firstSeen/lastSeen/status`

#### 5.4 真实冒烟验证结果

使用 ClickHouse 注入 1 组 demo 数据后，三条 endpoint 均返回 200：

```json
GET /api/v1/pages
[{"route":"/home","pv":1,"affectedUsers":1,"lcpP75":2.4,"inpP75":180,"clsP75":0.05,"jsErrorRate":100,"apiP95":420,"passRate":80,"trend":"flat"}]

GET /api/v1/apis
[{"api":"/api/recommend","method":"GET","p95":420,"p50":420,"errorRate":0,"timeoutRate":0,"qps":0,"traceCoverage":100}]

GET /api/v1/errors
[{"id":"err-...","message":"TypeError: boom","type":"js","route":"/home","release":"v0.2.0","count":1,...}]
```

#### 5.5 额外修复：schema 运行时导出兼容

为了让 Nest 的 CJS 运行时能 `require('@ai-frontend-monitor/schema')`，`packages/schema` 已改为双产物：
- `dist/`：现有 ESM（供 SDK/console `import`）
- `dist-cjs/`：新增 CJS（供 api/gateway/worker 的运行时 `require`）
- `package.json#exports` 增加 `require`，并在 `dist-cjs/package.json` 写 `{"type":"commonjs"}`

否则 `start:dev/start:prod` 会报 `ERR_PACKAGE_PATH_NOT_EXPORTED`，导致 API 根本起不来。

#### 5.6 复用 M1 的 fallback 约定

三个 endpoint 已具备与 mock 对齐的结构；Console 侧下一步只需做 composable fetch + fallback（沿用 `useOverviewData` 模式）。

---

### Step 6：Console 三页接真数据（`apps/console`）—— ✅ 已完成

**改动**：新增三个 composable，改三个 view，**未改其余 11 页**。

```
src/composables/
├── useOverviewData.ts      # M1 已有
├── usePagesData.ts         # 新增
├── useApisData.ts          # 新增
└── useErrorsData.ts        # 新增
```

每个 composable 已按 `useOverviewData` 模式落地：
- `onMounted` fetch 对应 endpoint
- 初始值直接用 mock（保证 fallback 即默认）
- 请求失败时记录错误并回退到 mock
- 对外仍返回视图当前使用的字段名（`rows` + `trendSeries`），保持模板几乎不动

**已改 view**：
- `PagesView.vue`：`pageRows` → `usePagesData().rows`
- `ApisView.vue`：`apiRows` → `useApisData().rows`
- `ErrorsView.vue`：`errorGroups` → `useErrorsData().rows`

图表所需的 `trendSeries` 目前仍沿用 mock（M2 计划内已接受这一折中；本期重点是列表真数据化）。

**验证**：
- `pnpm --filter @ai-frontend-monitor/console typecheck` ✓
- `pnpm --filter @ai-frontend-monitor/console build-only` ✓
- 构建时仅有现存第三方 warning：`@vueuse/core` 在 Rolldown 下的 `INVALID_ANNOTATION` 与 chunk-size warning，不是本次改动引入，且不阻塞产物生成

**Page Detail 资源瀑布**（`/pages/:route`）：仍保持 mock，留给后续详情 endpoint（M2 范围内接受）。

### 下一步（下班前版）

只做 1 件事：**Page Detail 真数据化**。

最小落地范围：
- 补 `GET /api/v1/pages/:route/resources`
- 让 `PageDetailView.vue` 的资源瀑布切到真数据
- 如工作量可控，再把相关 API 列表一并切到真数据

先不扩范围，不碰 Alerts / Releases / Tasks，也不做新的 Agent 能力。

---

## 文件变更总览

| 文件/目录 | 动作 | 说明 |
|-----------|------|------|
| `packages/schema/src/event.ts` | 修改 | 新增 3 类事件接口，扩展 `IngestPayload` |
| `packages/schema/src/metrics.ts` | 修改 | 抽出共享指标阈值（good/bad 判定） |
| `packages/sdk/src/index.ts` | 修改 | 新增 `trackError/trackApiTiming/trackResource` + 自动采集 |
| `packages/sdk/src/collector.ts` | **新建** | error/api/resource 采集器 + route 归一化 |
| `apps/gateway/src/ingestion.service.ts` | 修改 | `expandPayload` 支持三类事件拆分 |
| `apps/api/src/listings/` | **新建** | pages/apis/errors 三 controller+service |
| `apps/api/src/app.module.ts` | 修改 | 注册 listings 模块 |
| `apps/console/src/composables/use{Pages,Apis,Errors}Data.ts` | **新建** | 三个 composable |
| `apps/console/src/views/{Pages,Apis,Errors}View.vue` | 修改 | 切 composable |
| `infra/clickhouse/init/02-create-tables.sql` | 修改 | 仅当决策项选 A：MV 改 AggregatingMergeTree |
| `apps/worker/` | 无改动 | 通用写入 |

---

## 验证方法

### 1. 端到端
```bash
docker compose up -d
pnpm build:packages            # 假设有，否则分别 build schema/sdk
pnpm dev:api &
pnpm dev:console
# 打开 demo 页（含 SDK），触发 JS 错误 + 发几个 fetch + 加载资源
curl 'http://localhost:8123/?query=SELECT+event_type,count()+FROM+afm.rum_events+GROUP+BY+event_type'
# 应看到 page_view / web_vital / error / api_timing / resource_timing 五类
```

### 2. API 三个 endpoint
```bash
curl 'http://localhost:3000/api/v1/pages?projectId=demo&env=production'
curl 'http://localhost:3000/api/v1/apis?projectId=demo&env=production'
curl 'http://localhost:3000/api/v1/errors?projectId=demo&env=production'
# 各返回与 mock 同结构的 JSON，值为真实聚合
```

### 3. Console 三页
- `/pages` 表格按 PV 排序，数值非零且随真实上报变化
- `/apis` P50/P95/错误率非空
- `/errors` 出现 demo 页触发的错误，count > 0
- 断网（关 API）三页仍渲染 mock，不白屏

---

## 当前不做（明确排除，留给 M3/M4）

- 不做 Alert / Release / Task 页面真数据化（M3）
- 不做 Gateway 鉴权 DB 化 / 限流 / 采样 / 脱敏（M3）
- 不做 Agent 诊断 / Evidence Pack / sourcemap（M4）
- 不做 Worker 攒批（除非 QPS 明显上升）
- 不做完整 Resource Timing 瀑布页（若超预算降级为 mock）

---

## 风险与备注

- **`attributes` JSON 取值**：ClickHouse JSON 类型用 `JSONExtract*` 函数取值，SQL 写错会静默返回 0/null。每个新 SQL 先在 `clickhouse-client` 手跑验证再写进 service。
- **MV 重建丢数据**：选 A 要重跑 demo 上报，M1 验收数据会丢（可接受）。
- **SDK 自动采集的副作用**：patch fetch/XHR 可能与业务代码冲突。M2 SDK 默认开启采集但提供 `init({ autoTrack: false })` 开关，demo 页可关。
- **route 归一化双份**：SDK 侧归一化用于上报，Console 侧"路由归一化规则"用于展示过滤。两者规则需保持一致或明确分工，避免 M3 重复造轮子。
