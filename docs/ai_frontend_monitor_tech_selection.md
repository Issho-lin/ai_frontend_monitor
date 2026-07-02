# AI Agent 前端性能监控平台：技术选型说明

## 0. 选型结论

本项目技术选型以“主链路尽快跑通、数据链路可靠、Agent 可控、运维复杂度不过早放大”为原则。当前推荐技术栈如下：

| 模块 | 推荐选型 | 结论 |
| --- | --- | --- |
| Web SDK | TypeScript + Web Performance API + `web-vitals/attribution` | 自研轻量 SDK，复用成熟 Web Vitals 采集能力 |
| SDK 构建 | tsup / Rollup，输出 ESM + IIFE | 同时支持 npm 接入和 `<script>` 接入 |
| 控制台前端 | React + TypeScript + Vite + Ant Design + ECharts | 适合内部数据工作台和图表密集页面 |
| API Backend | NestJS + Fastify Adapter | 承接项目权限、配置、查询 API、工作流 API |
| 接入网关 | Node.js + Fastify | 统一 TypeScript 主栈，负责上报入口 |
| 流处理 | Node.js Worker | 统一 TypeScript 主栈，负责事件清洗、归一化、批量写入 ClickHouse |
| 消息队列 | Redpanda，兼容 Kafka API | 先降低运维复杂度，同时保留 Kafka 生态兼容性 |
| 明细分析库 | ClickHouse | 存储 RUM 明细事件和聚合指标 |
| 业务元数据 | PostgreSQL | 存储项目、用户、权限、发布、任务、报告元数据 |
| 缓存与限流 | Redis | 采样配置、热点查询缓存、告警状态、限流计数 |
| 对象存储 | S3 / MinIO | 存储 sourcemap、原始归档、报告附件 |
| Agent 服务 | TypeScript + NestJS Worker / Fastify | 统一 TypeScript 主栈，单 Agent 服务，多能力模块，受控工具调用 |
| 部署 | Docker Compose 起步，Kubernetes + Helm 生产化 | 本地联调简单，生产具备扩展空间 |

## 1. 选型原则

### 1.1 优先服务主链路

技术选型必须直接服务这条链路：

```text
SDK 接入
  -> 数据上报
  -> 指标聚合与查询
  -> 异常告警
  -> Agent 只读取证诊断
  -> 人确认治理任务
  -> 修复发布后验证
  -> 复盘沉淀
```

暂时不为了“平台化大而全”引入过重技术，例如完整流计算平台、复杂 BI 平台、独立搜索集群或多 Agent 自治系统。

### 1.2 写入与查询解耦

前端监控有高写入、强聚合、多维过滤的特点。写入链路必须能削峰，查询链路必须优先使用聚合表，Agent 不能直接扫明细表。

### 1.3 Agent 可控优先

Agent 的价值是辅助诊断，不是替代研发做生产操作。技术上必须支持：

- 工具白名单。
- 输入输出结构化。
- 工具调用审计。
- 权限继承。
- 超时降级。
- 人工确认。

### 1.4 降低初始运维成本

当前项目还在功能主链路建设阶段，优先选择团队容易部署、容易排查、生态成熟的技术。默认采用 TypeScript 单主栈，减少语言、构建、部署和调试成本。对有迁移可能的组件，应使用标准协议或兼容协议，例如 Kafka API、S3 API、HTTP API。

### 1.5 技术栈收敛原则

当前默认技术栈收敛为：

```text
TypeScript:
  SDK / Console / API Backend / Ingestion Gateway / Stream Worker / Agent Service

基础设施:
  Redpanda / ClickHouse / PostgreSQL / Redis / S3 or MinIO
```

Go 和 Python 不作为默认方案，只在出现明确必要性时引入：

- Go：当接入网关或流处理出现明确吞吐、CPU、内存或运行稳定性瓶颈时，再把 Gateway / Worker 替换为 Go。
- Python：当 Agent 诊断需要更复杂的评测、实验、模型编排或 Python 生态能力时，再把 Agent Service 拆成 Python 服务。

这样既保留架构扩展空间，又避免项目一开始就变成多语言、多运行时、多套工程体系。

## 2. Web SDK 选型

### 2.1 推荐方案

| 项 | 选择 |
| --- | --- |
| 语言 | TypeScript |
| 核心采集 | Web Performance API + `web-vitals/attribution` |
| 构建 | tsup 或 Rollup |
| 产物 | ESM、IIFE、类型声明 |
| 上报 | `sendBeacon` 优先，fetch 兜底 |
| 接入方式 | npm 包 + `<script>` 自托管文件 |

### 2.2 选择理由

- `web-vitals` 是 GoogleChrome 维护的真实用户 Web Vitals 采集库，官方说明其体积小，并支持 LCP、INP、CLS、FCP、TTFB 等指标。
- `web-vitals/attribution` 能提供额外诊断信息，对定位 LCP 元素、INP 交互等问题更有价值。
- TypeScript 便于定义事件 schema、SDK 配置、`beforeSend` 钩子和上报协议。
- 不直接采用完整 OpenTelemetry Browser SDK 作为外部 SDK 主体，因为浏览器侧体积、配置复杂度和业务侵入需要更谨慎控制。

### 2.3 替代方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| 自研 TypeScript SDK + `web-vitals/attribution` | 轻量、可控、贴合前端 RUM 场景 | 需要自建上报协议和采样逻辑 | 推荐 |
| OpenTelemetry JS Browser SDK | 标准化强，便于 trace 生态对齐 | 浏览器侧接入复杂，SDK 体积和配置成本更高 | 作为内部语义兼容，不作为首选外部 SDK |
| 直接接入第三方 RUM SDK | 上手快 | 数据和 Agent 证据链受限，难以做闭环 | 不采用 |

### 2.4 落地约束

- SDK gzip 后目标小于 30KB。
- 默认不开启全量资源采集，大量图片资源需要采样或白名单。
- SDK 不采集 request body、response body、cookie、localStorage、sessionStorage。
- `web-vitals` 相关采集函数每个页面生命周期只注册一次，避免重复 observer。
- CDN 接入方式必须使用自托管产物，不依赖第三方公共 CDN。

## 3. 控制台前端选型

### 3.1 推荐方案

| 项 | 选择 |
| --- | --- |
| 框架 | React |
| 语言 | TypeScript |
| 构建 | Vite |
| UI 组件 | Ant Design |
| 图表 | Apache ECharts |
| 请求状态 | TanStack Query |
| 路由 | React Router |
| 局部状态 | Zustand |

### 3.2 选择理由

- 控制台是典型内部工作台，表格、筛选、表单、弹窗、详情页和状态流较多，Ant Design 的组件完备度更适合。
- React 生态成熟，适合复杂状态页面和团队协作。
- Vite 构建快，适合管理台。
- ECharts 支持丰富图表类型、Canvas/SVG 渲染、渐进渲染和大数据量展示，适合趋势图、分布图、瀑布图和对比图。
- TanStack Query 能统一处理查询缓存、加载状态、重试和失效刷新。

### 3.3 替代方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| React + Ant Design + ECharts | 企业后台成熟，图表能力强 | 需要控制页面信息密度和样式一致性 | 推荐 |
| Vue + Element Plus + ECharts | 国内团队熟悉度高 | 与 SDK/Node 后端 TS 类型复用弱一些 | 团队 Vue 更强时可选 |
| Next.js | SSR、路由和全栈能力完整 | 本项目是登录后管理台，SSR 价值不高 | 不作为默认 |

### 3.4 为什么前端选择 React，而不是直接用 Next.js 做全栈

Next.js 的强项是面向页面路由、SSR/SSG、SEO、边缘渲染和全栈页面开发。它适合官网、内容站、电商前台、需要服务端渲染的用户侧应用，也适合 BFF 较轻的产品。

本项目控制台是登录后的内部数据工作台，核心复杂度不在首屏 SEO 或服务端渲染，而在：

- 大量筛选器、图表、表格、详情页、任务状态流。
- 高频查询和局部刷新。
- 复杂权限、审计、查询模板、告警和任务工作流。
- 后端需要同时服务控制台、Agent、接入验证、告警和治理任务。

因此推荐把控制台前端和 API Backend 分开：

```text
React + Vite Console
  -> NestJS API Backend
  -> ClickHouse / PostgreSQL / Redis / Agent / Workflow
```

这样做的好处是职责更清楚：React 负责工作台体验，NestJS 负责业务 API 和权限边界。后端 API 不被页面框架绑定，也更方便给 Agent、告警服务、网关验证服务复用。

如果团队强烈希望统一 Next.js，也可以采用“Next.js 只做控制台 + BFF”的方式，但仍不建议把高吞吐上报、流处理、Agent 编排全部塞进 Next.js。否则后面会出现页面框架承载过多后端职责的问题。

## 4. 后端 API 选型

### 4.1 推荐方案

| 项 | 选择 |
| --- | --- |
| 框架 | NestJS + Fastify Adapter |
| 语言 | TypeScript |
| 元数据库 | PostgreSQL |
| ORM / Query | Prisma 或 Kysely |
| 分析库访问 | ClickHouse HTTP/Native Client |
| API 风格 | REST 为主，长任务用 SSE / WebSocket |

### 4.2 选择理由

- 后端 API 主要负责项目配置、权限、查询模板、任务流、报告元数据，不是最高写入压力入口。
- NestJS 模块化、依赖注入、Guard、Pipe、Interceptor 适合权限、审计、参数校验和业务工作流。
- TypeScript 可以和控制台、SDK 共享部分 schema 定义。
- Fastify Adapter 比默认 Express 有更好的性能基础。

### 4.3 为什么接入网关不直接用 NestJS

上报入口是高频写入链路，职责是鉴权、限流、脱敏、采样、快速入队。它应尽量薄、快、稳定，避免被业务 API 的复杂依赖影响。因此接入网关独立为 Go 服务，后端 API 使用 NestJS 承接业务管理能力。

### 4.4 为什么不直接用 Next.js API Routes 做后端

Next.js API Routes / Route Handlers 可以做轻量接口、BFF 和页面相关接口，但不适合作为本项目的主后端边界，原因是：

- 本项目 API 不只是服务页面，还要服务 Agent 工具、告警详情、接入验证、治理任务和修复验证。
- 需要清晰的模块化后端结构，例如 Auth、Projects、Metrics Query、Alerts、Diagnosis Reports、Tasks、Releases、Audit。
- 需要统一 Guard、Pipe、Interceptor、DTO、审计日志、权限策略和后台任务入口。
- 查询 ClickHouse、PostgreSQL、Redis、对象存储和 Agent 服务时，后端应是独立服务，而不是页面框架的附属能力。

结论：Next.js 可以作为控制台技术方案的候选，但不推荐作为主后端。主后端仍建议选择 NestJS；控制台使用 React + Vite 更轻，边界更清楚。

## 5. 接入网关与流处理选型

### 5.1 推荐方案

| 模块 | 选择 |
| --- | --- |
| 接入网关 | Node.js + Fastify |
| 流处理 | Node.js Worker |
| ClickHouse 写入 | 批量写入，失败重试，死信队列 |
| 配置读取 | Redis 缓存采样配置和项目 token |

### 5.2 选择理由

- 当前优先控制技术栈复杂度，接入网关和流处理默认使用 TypeScript/Node.js。
- Fastify 性能较好、生态成熟，适合实现薄上报网关。
- 网关和 Worker 仍然与 API Backend 进程隔离，避免写入链路被业务 API 影响。
- 流处理当前只需要清洗、归一化、补充字段、批量写入，不需要马上引入 Flink 或 Go 服务。

### 5.3 JS 能不能做接入网关和流处理

可以做，而且当前默认就用 Node.js + Fastify 做接入网关，用 Node.js Worker 做流处理。

接入网关和流处理处在最核心的数据写入链路，特点是：

- 请求量高，上报频繁。
- 单次业务逻辑不复杂，但对稳定性和资源占用敏感。
- 需要做限流、脱敏、采样、压缩解码、批量入队。
- 流处理需要持续消费队列、批量写 ClickHouse、控制内存和背压。

Node.js 可以承接这条链路，但需要明确工程约束：

- 网关必须和业务 API Backend 进程隔离，不能和控制台 API 混在一起。
- Worker 必须做批量消费、批量写入、重试、背压控制和死信处理。
- CPU 型清洗逻辑不能无限堆在 Node 主线程里，必要时拆分 worker threads 或独立进程。
- 达到写入量或资源瓶颈后，保留迁移到 Go Gateway / Go Worker 的空间。

Go 的定位是性能和稳定性瓶颈出现后的替代方案，不是当前默认方案。

### 5.4 替代方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| Node.js Fastify Gateway + Node Worker | 团队统一 TS 技术栈，开发调试成本低 | 高吞吐写入和 CPU 型清洗压力需要压测验证 | 推荐 |
| Go Gateway + Go Worker | 性能稳定，资源占用可控 | 引入第二语言栈和额外工程体系 | 性能瓶颈明确后再引入 |
| Flink / Spark Streaming | 流计算能力强 | 运维重，当前清洗需求不值得引入 | 暂不采用 |

## 6. 消息队列选型

### 6.1 推荐方案

选择 Redpanda，并保持 Kafka API 兼容。

### 6.2 选择理由

- 本项目需要事件削峰、缓冲和回放，Kafka 类型的事件流非常合适。
- Redpanda 兼容 Kafka API，接入 Kafka 生态工具时阻力较小。
- 相比自建 Kafka 集群，Redpanda 运维复杂度更低，适合当前阶段。
- 如果公司已经有成熟 Kafka 平台，则直接接入现有 Kafka，不再单独部署 Redpanda。

### 6.3 替代方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| Redpanda | Kafka API 兼容，部署和运维相对简单 | 需要确认团队生产经验 | 默认推荐 |
| Apache Kafka | 生态最成熟，组织内常见 | 自建运维复杂度更高 | 公司已有 Kafka 时优先 |
| RabbitMQ | 易用，适合任务消息 | 不适合高吞吐事件流和长期回放 | 不推荐作为 RUM 主队列 |
| 直接写 ClickHouse | 链路短 | 无削峰能力，写入失败难回放 | 不推荐 |

## 7. 存储选型

### 7.1 ClickHouse：明细与聚合分析库

ClickHouse 用于存储 RUM 明细事件、分钟级聚合、小时级聚合、资源聚合、错误聚合和接口聚合。

选择理由：

- 前端监控数据是典型时间序列事件，写入量大、字段多、按时间窗口和维度聚合查询多。
- ClickHouse 适合 OLAP、多维聚合和高吞吐写入。
- ClickHouse 官方也把 logs、events、traces 作为观测类使用场景之一。

落地约束：

- 常用查询必须走聚合表。
- route、api_route、resource_url、error_stack_hash 必须归一化。
- 原始 URL 和错误信息进入模型前必须脱敏。
- 明细表默认 30-90 天 TTL。

### 7.2 PostgreSQL：业务元数据

PostgreSQL 用于项目、成员、权限、token、发布记录、任务、报告、复盘等事务型数据。

选择理由：

- 事务能力强，适合权限、任务流和配置管理。
- 生态成熟，ORM 支持好。
- 与 ClickHouse 职责清晰分离。

### 7.3 Redis：缓存、限流和状态

Redis 用于：

- 采样配置缓存。
- token 和项目配置缓存。
- 告警收敛状态。
- 热点查询缓存。
- 网关限流计数。
- Agent 任务短期状态。

### 7.4 S3 / MinIO：对象存储

对象存储用于：

- sourcemap 文件。
- 原始事件归档。
- Agent 报告附件。
- 导出报表。

本地和私有化部署可用 MinIO；云上部署优先使用云厂商 S3 兼容对象存储。

## 8. Agent 服务选型

### 8.1 推荐方案

| 项 | 选择 |
| --- | --- |
| 语言 | TypeScript |
| 运行形态 | NestJS Worker 或独立 Fastify 服务 |
| 模型调用 | OpenAI API / Responses API |
| 工具调用 | TypeScript tool functions，内部调用 Backend 只读工具 API |
| 任务状态 | PostgreSQL + Redis |
| 输出结构 | Zod / JSON Schema |

### 8.2 选择理由

- 当前优先统一技术栈，Agent Service 默认使用 TypeScript 实现。
- Agent 当前只需要单 Agent、固定工具白名单、结构化输出、步骤状态和人工确认，TypeScript 足够承接。
- Zod / JSON Schema 可以约束 Evidence Pack、工具结果、诊断报告和任务草稿结构。
- Agent 工具不直接查库，而是调用 Backend 暴露的只读工具 API，能保持权限和审计边界。

### 8.3 Agent 服务是否必须独立

建议独立，但不是为了“微服务化好看”，而是因为 Agent 的运行特征和普通 API Backend 不一样：

- Agent 任务是长耗时任务，可能持续几十秒到数分钟。
- Agent 会多次调用工具，需要步骤状态、超时、重试、Partial Done 和审计。
- Agent 需要模型调用、提示词版本、工具调用 trace、结构化输出校验和用户反馈。
- Agent 的资源消耗、限流策略、失败降级和普通业务 API 不同。
- Agent 需要独立演进诊断策略，避免频繁影响核心 API Backend。

推荐边界是：

```text
Console / Alert
  -> API Backend 创建诊断任务
  -> Agent Service 执行诊断
  -> Agent 调用 Backend 暴露的只读工具 API
  -> Agent 写回 Diagnosis Report
  -> 用户确认后进入 Governance Workflow
```

这样 Agent 独立运行，但数据权限仍由 Backend 控制。Agent 不直接查 ClickHouse、PostgreSQL 或对象存储。

如果项目早期想减少服务数量，可以把 Agent 作为 Backend 内部的异步模块启动，但接口边界仍应按独立服务设计。这样需要独立部署时不需要重写业务协议。

### 8.4 为什么 Agent 默认不引入 Python

JS/TS 可以做 Agent，尤其是当前这种固定入口、固定工具、结构化诊断报告的场景。为了减少技术栈，当前默认不引入 Python。

Python 的优势依然存在：

- Python 在 Agent 编排、评测、数据分析、诊断策略实验上生态更成熟。
- Pydantic 对结构化输出、schema 校验、Evidence Pack、报告落库格式很方便。
- 部分 Agent 框架、评测工具和数据分析工具在 Python 生态中更丰富。

但这些优势不是当前主链路打通的必要条件。当前更重要的是：

- 减少语言栈。
- 降低部署复杂度。
- 复用 TypeScript schema、DTO、权限和工程经验。
- 更快完成 Agent 诊断闭环。

因此 Python 的定位调整为替代方案：当 TypeScript Agent 在复杂编排、评测体系或诊断策略实验上明显受限时，再拆出 Python Agent Service。

### 8.5 替代方案比较

| 方案 | 优点 | 风险 | 结论 |
| --- | --- | --- | --- |
| TypeScript Agent Worker | 技术栈统一，复用 schema 和工程体系，部署简单 | 复杂 Agent 生态弱于 Python | 推荐 |
| Python + OpenAI Agents SDK / LangGraph | Agent 编排、评测、实验生态更成熟 | 引入第二语言栈和独立运行时 | 复杂诊断需求明确后再引入 |
| 直接在 API 请求中同步调用模型 | 实现最简单 | 容易超时，缺少任务状态、重试和审计 | 不推荐 |
| 多 Agent 自治系统 | 表达能力强 | 调度复杂，难审计，容易失控 | 不采用 |

### 8.6 Agent 工具边界

Agent 当前只调用 5 个只读工具：

- `query_metrics`
- `query_events`
- `analyze_resource`
- `analyze_api`
- `get_release_diff`

任务创建和修复验证不是 Agent 工具，而是平台治理工作流接口：

- `create_task_draft`
- `start_verification`

## 9. 部署选型

### 9.1 本地与联调

本地开发使用 Docker Compose，包含：

- PostgreSQL
- Redis
- ClickHouse
- Redpanda
- MinIO
- API Backend
- Ingestion Gateway
- Stream Worker
- Agent Service
- Console

### 9.2 生产部署

生产使用 Kubernetes + Helm：

- 服务按模块独立部署和扩缩容。
- Gateway、Backend、Agent、Worker 分开 HPA。
- ClickHouse、PostgreSQL、Redis、Redpanda 优先使用已有基础设施或托管服务。
- sourcemap 和归档文件放对象存储。

### 9.3 环境划分

| 环境 | 用途 |
| --- | --- |
| local | 本地开发和联调 |
| dev | 开发环境，验证接口和数据链路 |
| staging | 预发环境，接入测试项目和回归 |
| production | 生产环境，接入真实业务项目 |

## 10. 开发语言与仓库组织建议

### 10.1 语言分工

| 模块 | 语言 |
| --- | --- |
| SDK | TypeScript |
| Console | TypeScript |
| API Backend | TypeScript |
| Ingestion Gateway | TypeScript |
| Stream Worker | TypeScript |
| Agent Service | TypeScript |

### 10.2 Monorepo 建议

建议使用 monorepo 管理：

```text
apps/
  console/
  api/
  agent/
  gateway/
  worker/
packages/
  sdk/
  shared-schema/
infra/
  docker-compose/
  helm/
docs/
```

共享 schema 建议优先放在 `packages/shared-schema`，用 Zod / JSON Schema 定义事件、工具入参、工具出参、Evidence Pack 和诊断报告结构。即使以后引入 Go 或 Python，也通过 OpenAPI / JSON Schema 做跨语言边界，不强行共享源码类型。

## 11. 选型风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 单一 TS 栈承接高吞吐写入 | Node.js 网关或 Worker 在高流量下可能出现资源瓶颈 | 网关和 Worker 独立进程部署，做压测；瓶颈明确后替换为 Go |
| Redpanda 生产经验不足 | 队列稳定性影响写入链路 | 若公司已有 Kafka，优先接 Kafka；否则先做压测和故障演练 |
| ClickHouse 表设计不当 | 查询慢、成本高 | 先做容量预估、归一化、高频字段列化、聚合表 |
| SDK 体积失控 | 影响业务页面性能 | 严格 bundle budget，默认关闭重采集能力 |
| Agent 误判 | 误导治理动作 | 证据引用、置信度、缺失证据、人工确认 |
| TypeScript Agent 编排能力不足 | 复杂诊断策略迭代变慢 | 保持 Agent 服务边界独立，必要时替换为 Python Agent Service |
| sourcemap 管理复杂 | JS 错误定位不稳定 | 接入验证中展示 sourcemap 状态，缺失时降级 |

## 12. 参考资料

- GoogleChrome `web-vitals`：https://github.com/GoogleChrome/web-vitals
- OpenTelemetry Browser 文档：https://opentelemetry.io/docs/languages/js/getting-started/browser/
- ClickHouse Observability 文档：https://clickhouse.com/docs/use-cases/observability
- Apache Kafka Introduction：https://kafka.apache.org/intro/
- Redpanda Architecture 文档：https://docs.redpanda.com/streaming/current/get-started/architecture/
- React 官方文档：https://react.dev/
- Apache ECharts：https://echarts.apache.org/
- OpenAI Agents SDK：https://openai.github.io/openai-agents-python/
