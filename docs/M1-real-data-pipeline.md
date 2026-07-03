# M1 执行计划：打通第一条真实数据链路

> **目标**：让项目从"高保真原型"变成"有真实生命体征的监控产品"
> **范围**：只打通一个最小场景 —— 页面访问 PV + FCP/LCP 指标采集 → 存储 → 查询 → Console Overview 展示
> **验收标准**（必须全部满足）：
> 1. 有真实事件写入 ClickHouse
> 2. 有真实聚合结果（通过物化视图自动产出）
> 3. API 能查出聚合结果
> 4. Console Overview 显示真实数据
> 5. Demo 页面能上报数据

---

## 阶段划分

| 阶段 | 范围 | 验收 |
|------|------|------|
| **M1：打通链路** | `packages/schema` + `packages/sdk` + `apps/gateway` + `apps/worker` + API 一个 endpoint + Overview 真数据 | 5 条验收标准全部满足 |
| **M2：数据面扩展** | JS Error / API Timing / Resource Timing + Pages、APIs、Errors 页面真数据化 | 3 种事件类型都能上报和查询 |
| **M3：治理能力** | Alerts / Releases / Tasks / Verification | 告警→诊断→任务→验证闭环 |
| **M4：Agent 能力** | 只读取证工具 / Evidence Pack / Diagnosis Report | Agent 能生成诊断报告 |

**当前只执行 M1。**

---

## M1 施工顺序

### Step 1：定义共享事件 Schema（`packages/schema`）

**作用**：全链路契约。SDK 发什么、Gateway 收什么、Worker 消费什么、API 查什么，统一用这个包定义。

**产出**：

```
packages/schema/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 统一导出
│   ├── event.ts          # 统一事件类型和接口
│   ├── metrics.ts        # 指标查询/返回类型
│   └── __tests__/event.test.ts  # 基础类型校验
```

**核心类型**（对齐 `infra/clickhouse/init/02-create-tables.sql`）：

```ts
// event.ts
export type EventType = 'page_view' | 'web_vital' | 'error' | 'api_timing' | 'resource_timing'

export interface RUMEvent {
  event_id: string
  project_id: string
  env: 'production' | 'staging' | 'test'
  event_type: EventType
  timestamp: string            // ISO 8601
  page_url: string
  route: string
  release: string
  session_id: string
  user_id_hash: string
  device_type: string
  os: string
  browser: string
  metric_name: string          // LCP / FCP / INP / CLS / ...
  metric_value: number
  api_route?: string
  resource_type?: string
  resource_url?: string
  resource_size?: number
  duration?: number
  status_code?: number
  error_name?: string
  error_stack_hash?: string
  lcp_element?: string
  trace_id?: string
  sample_rate: number
  sdk_version: string
  attributes: Record<string, unknown>
}

// metrics.ts
export interface MetricSeries {
  point: [string, number][]    // [timestamp_iso, value]
}

export interface MetricSummary {
  p50: number
  p75: number
  p95: number
  avg: number
  count: number
}

export interface OverviewPayload {
  health: {
    status: 'healthy' | 'warning' | 'critical'
    activeAlerts: number
    affectedUsers: number
    latestRelease: string
    latestReleaseAt: string
  }
  coreMetrics: {
    label: string
    value: string
    delta: string
    deltaDir: 'up' | 'down'
    good: boolean
    summary: MetricSummary
  }[]
  trend: {
    lcp: MetricSeries
    inp: MetricSeries
    api_p95: MetricSeries
    js_error: MetricSeries
  }
  topProblems: {
    rank: number
    kind: 'page' | 'api' | 'resource'
    label: string
    metric: string
    value: string
  }[]
}
```

**关键决策**：
- 不引入 zod/yup 运行时校验，第一阶段保持轻量，TypeScript 类型就是契约
- `RUMEvent` 的字段与 `rum_events` 表完全对齐，后续写 Worker 时可以直接映射

---

### Step 2：实现最小 SDK（`packages/sdk`）

**作用**：模拟浏览器行为，向 Gateway 上报真实数据。

**产出**：

```
packages/sdk/
├── package.json
├── tsconfig.json
├── rollup.config.mjs        # 构建 ES + IIFE 产物
└── src/
    ├── index.ts             # 对外 API：init(), trackPageView(), trackWebVital()
    ├── collector.ts         # Web Vitals 采集（Performance API）
    ├── transport.ts         # 上报逻辑（fetch/sendBeacon）
    └── types.ts             # 从 @ai-frontend-monitor/schema 导入
```

**第一阶段行为**：

```ts
// 初始化
import AFM from '@ai-frontend-monitor/sdk'
AFM.init({ projectId: 'demo', env: 'production' })

// 页面访问
AFM.trackPageView({ route: '/home', url: 'https://example.com/home' })

// Web Vitals（用浏览器 Performance API 采集）
// 如果不在浏览器中，trackPageView 内部自动采集 FCP/LCP
```

**M1 简化**：不写完整 Web Vitals 采集器，用一个内置的 `trackPageView()` 函数，内部生成模拟 FCP/LCP 时间数据（基于 `performance.now()` 或随机值）。真实浏览器性能 API 采集放在 M2。

上报格式：
```json
{
  "event_type": "page_view",
  "project_id": "demo",
  "env": "production",
  "route": "/home",
  "metrics": { "fcp": 1200, "lcp": 2400 },
  "context": { "release": "v0.1.0", "sdk_version": "0.1.0" }
}
```

Gateway 负责把它拆成 `rum_events` 表的多条 `web_vital` 类型事件。

---

### Step 3：实现最小 Gateway（`apps/gateway`）

**作用**：接收 SDK 上报，鉴权 + 转化 + 写入 Redpanda。

**产出**：

```
apps/gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── ingestion.controller.ts    # POST /ingest
│   ├── ingestion.service.ts       # 鉴权、拆分、写入 Redpanda
│   └── schema.ts                  # 从 @ai-frontend-monitor/schema 导入
```

**核心接口**：

```
POST /ingest
Headers: X-Project-Token: <token>
Body:   RUMEvent (SDK 上报格式)
```

**M1 简化**：
- 鉴权：硬编码一个 token 对 `demo` 项目即可，不接数据库
- 写入 Redpanda：直接 `@nestjs/microservices` + Kafka 包写入 topic `rum_events`
- 不实现限流、采样、脱敏（这些 M2 再做）

---

### Step 4：实现最小 Worker（`apps/worker`）

**作用**：消费 Redpanda `rum_events` topic，写入 ClickHouse。

**产出**：

```
apps/worker/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts
│   ├── consumer.ts                # 消费 Redpanda 消息
│   ├── writer.ts                  # 批量写入 ClickHouse
│   └── schema.ts                  # 从 @ai-frontend-monitor/schema 导入
```

**核心逻辑**：

```ts
// consumer.ts
// 消费 Redpanda → 每条消息映射为 RUMEvent → 写入 writer 的批量队列

// writer.ts
// 攒批（100 条或 2 秒）→ HTTP 请求发送到 ClickHouse (INSERT JSON)
// 连接：http://localhost:8123
```

---

### Step 5：API 补一个真实查询 endpoint（`apps/api`）

**当前状态**：`apps/api` 只有 NestJS 空壳，无任何业务代码。

**改动**：在现有 `app.module.ts` 基础上扩展。

**产出**：

```
apps/api/src/
├── app.module.ts              # 新增 ClickHouse + Redis 模块
├── overview/
│   ├── overview.controller.ts
│   ├── overview.service.ts    # 查 ClickHouse 聚合数据
│   └── overview.dto.ts        # 从 @ai-frontend-monitor/schema 导入
```

**接口定义**：

```
GET /api/v1/overview?projectId=demo&env=production
```

**返回结构**：对齐 Console Overview 需要的数据结构（`OverviewPayload`）：

```json
{
  "health": { "status": "warning", "activeAlerts": 0, "affectedUsers": 0, "latestRelease": "v0.1.0", "latestReleaseAt": "2026-07-03" },
  "coreMetrics": [
    { "label": "LCP P75", "value": "2.4s", "delta": "", "deltaDir": "flat", "good": true, "summary": { "p50": 1.8, "p75": 2.4, "p95": 3.6, "avg": 2.5, "count": 100 } },
    { "label": "FCP P75", "value": "1.2s", "delta": "", "deltaDir": "flat", "good": true, "summary": { "p50": 0.9, "p75": 1.2, "p95": 1.8, "avg": 1.3, "count": 100 } }
  ],
  "trend": { "lcp": { "point": [...] }, "inp": { "point": [...] }, "api_p95": { "point": [...] }, "js_error": { "point": [...] } },
  "topProblems": []
}
```

**查询逻辑**（`overview.service.ts`）：

```sql
-- 核心指标（查 rum_metrics_1h 聚合表）
SELECT metric_name, p75_value, p95_value, avg_value, sample_count
FROM afm.rum_metrics_1h
WHERE project_id = 'demo'
  AND env = 'production'
  AND event_type = 'web_vital'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY metric_name
ORDER BY metric_name;

-- 趋势（查 rum_metrics_1m 聚合表）
SELECT minute, p75_value
FROM afm.rum_metrics_1m
WHERE project_id = 'demo'
  AND env = 'production'
  AND event_type = 'web_vital'
  AND metric_name = 'LCP'
  AND timestamp >= now() - INTERVAL 24 HOUR
ORDER BY minute;
```

**技术选型**：
- 用 `@clickhouse/client`（官方 Node.js 驱动，HTTP 协议）
- 不引入 Prisma/TypeORM（ClickHouse 不被支持，PostgreSQL 暂时不需要 ORM）
- PostgreSQL 先不动

**依赖添加**（`apps/api/package.json`）：
```json
"@clickhouse/client": "^1.11.0"
```

---

### Step 6：Console Overview 接入真实数据

**改动**：只改一个文件 `apps/console/src/views/OverviewView.vue`。

**策略**：加一个 `useRealData` composable，从 API 拉数据，如果 API 不可用则 fallback 到 mock。

```ts
// apps/console/src/composables/useRealData.ts

import { ref, computed } from 'vue'
import { projectOverview, coreMetrics, trendSeries, topProblems, agentSummary } from '@/mock/data'

export function useRealData() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const realProjectOverview = ref(projectOverview)
  const realCoreMetrics = ref(coreMetrics)
  const realTrendSeries = ref(trendSeries)
  const realTopProblems = ref(topProblems)
  const realAgentSummary = ref(agentSummary)

  async function fetchData() {
    loading.value = true
    try {
      const res = await fetch('/api/v1/overview?projectId=demo&env=production')
      const data = await res.json()
      // 将 API 返回的 OverviewPayload 映射为 mock 数据结构
      mapApiToMock(data)
    } catch (e) {
      // API 不可用时 fallback 到 mock，不中断页面渲染
      console.warn('Real data fetch failed, falling back to mock:', e)
    } finally {
      loading.value = false
    }
  }

  return {
    projectOverview: realProjectOverview,
    coreMetrics: realCoreMetrics,
    trendSeries: realTrendSeries,
    topProblems: realTopProblems,
    agentSummary: realAgentSummary,
    loading,
    error,
    fetchData,
  }
}
```

**OverviewView.vue 改动**：
1. 导入 `useRealData`
2. 替换模板中直接引用 `projectOverview` 等为 `realProjectOverview` 等
3. 加 `onMounted(() => useRealData().fetchData())`
4. 保留 mock 作为 fallback

**不改动其他 13 个页面。**

---

## 文件变更总览

| 文件/目录 | 动作 | 说明 |
|-----------|------|------|
| `packages/schema/` | **新建** | 全链路类型契约 |
| `packages/sdk/` | **新建** | 最小 SDK（上报 + 模拟采集） |
| `apps/gateway/` | **新建** | 数据接入网关 |
| `apps/worker/` | **新建** | 流处理 Worker |
| `apps/api/package.json` | 修改 | 添加 `@clickhouse/client` |
| `apps/api/src/app.module.ts` | 修改 | 注册 ClickHouse 连接 |
| `apps/api/src/overview/` | **新建** | Overview 查询模块 |
| `apps/console/src/composables/useRealData.ts` | **新建** | 真实数据 composable |
| `apps/console/src/views/OverviewView.vue` | 修改 | 接入真实数据源 |
| `docker-compose.yml` | 无需改动 | ClickHouse/Redpanda 已有 |

---

## 验证方法

### 1. 手动端到端验证
```bash
# 启动所有基础设施
docker compose up -d

# 确认服务就绪
docker compose ps  # 全部 healthy

# 启动 API 和 Console
pnpm dev:api &
pnpm dev:console

# 从浏览器打开 Demo 页面（SDK 上报）

# 验证 ClickHouse
curl http://localhost:8123?query=SELECT%20count()%20FROM%20afm.rum_events

# 验证 Overview 真实数据
curl http://localhost:3000/api/v1/overview?projectId=demo&env=production
# 应返回真实聚合数据
```

### 2. Console 验证
- 打开 `http://localhost:5173/overview`
- 核心指标卡显示非零数值
- 趋势图有真实数据点
- 健康度条显示真实状态

---

## 当前不做（明确排除）

- 不做完整 PostgreSQL 业务模型（项目表、用户表、权限表）
- 不做 Alert / Release / Task 页面真数据化
- 不做 JS Error / API Timing / Resource Timing
- 不做 Gateway 鉴权/限流/采样/脱敏
- 不做 Agent 诊断 / Evidence Pack / 只读取证工具
- 不做 sourcemap / release diff / verification workflow
- 不做完整 SDK Web Vitals 采集器（先用模拟数据）

这些 M2/M3/M4 再做。
