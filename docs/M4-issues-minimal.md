# M4 — 问题 / 待处理闭环（最小集）

产品口径（2026-10-25）：**先把功能做完，暂无部署条件** → 公网 HTTPS、真站点 SDK 试点整段搁置。  
本片：**把 Sessions 上的异常 / 缓慢从「只看」变成「能跟」**。  
**不做：** 项目管理、告警规则深化、Agent、修复验证 Worker、复盘全文；**不复用** 现有告警衍生 `tasks` 表（那条继续只服务告警工单）。

对齐后端摸底（2026-10-25）：Sessions 异常/缓慢为 ClickHouse **现算**、未落库；`error_count>0`→异常，否则 LCP p75 超阈值→缓慢（手机 3s / 桌面 2.5s）。本片只在 Postgres 落 **工作流状态**，标签仍派生。

## 目标

Console「问题 / 待处理」列表：行上带 **kind（异常|缓慢）** + **workflowStatus**；可 ack / resolve / reopen。口径与 Sessions 同一套，不另造「有问题」合集。

## 问题从哪来（本片）

| 来源 | 入列 | 说明 |
|------|------|------|
| 会话路由聚合 | 某 `route`（+ project/env/窗口）现算为异常或缓慢 | **本片主路径** |
| 告警 / `tasks` | — | **本片不吃、不双写**；告警跟进仍走现有 alerts/tasks |

列表字段建议：

- `kind`：`abnormal` | `slow`（UI：异常 | 缓慢）
- `workflowStatus`：见下
- `route`、`projectId`、`env`、窗口摘要、最近更新时间
- 可选：受影响会话数等现算指标（有则带，无则空）

**默认筛：** 全部；可按 `workflowStatus`、`kind` 筛。  
**排序：** 未关闭优先；异常、缓慢置顶逻辑对齐 Sessions。

## 状态（workflowStatus）

与告警 PATCH 风格对齐，用 **action**，不直接 PATCH 任意字符串状态机四段：

| workflowStatus | 含义 |
|----------------|------|
| `open` | 待处理（入列默认） |
| `acked` | 已确认 / 跟进中 |
| `resolved` | 已处理（本片不验指标） |

```http
PATCH /api/v1/issues/:id?projectId=&env=
  { "action": "ack" | "resolve" | "reopen" }
```

| action | 结果 |
|--------|------|
| `ack` | → `acked` |
| `resolve` | → `resolved` |
| `reopen` | → `open` |

无成员系统；`assignee` 本片可省略。

## 数据与 API

- 新薄资源：`GET/PATCH /api/v1/issues`（路径按后端最终实现，前后端对齐即可）。
- Postgres：只存工作流（谁被 ack/resolve 过），**不**把 CH 现算的异常/缓慢快照当唯一真相；列表 = 现算候选 ∪ 已有工作流行。
- 唯一键建议：`(project_id, env, route, kind)` 或等价指纹，避免重复行。
- 鉴权与现有 Console→API 一致；不新开项目管理。

```http
GET  /api/v1/issues?projectId=&env=&workflowStatus=&kind=&window=
GET  /api/v1/issues/:id?projectId=&env=
PATCH /api/v1/issues/:id?projectId=&env=
  { "action": "ack" | "resolve" | "reopen" }
```

详情 / 行上给深链：跳到已有 Sessions 或 Page Detail（前端拼路由即可）。

## Console

1. 一级入口「问题」或「待处理」：列表 + kind / 状态筛 + ack|resolve|reopen。
2. 行：标题（含 route）、kind 文案、workflowStatus、更新时间。
3. **不做** Agent 区、验证条；**不**把 `tasks` 告警工单混进本列表（避免两套状态）。

## 验收

1. Demo/production 下，能靠现有 Sessions 口径看到异常或缓慢时，问题列表有对应行（kind 正确）。
2. `ack` → `resolve` → `reopen` 刷新后状态仍在（Postgres）。
3. 默认「全部」；筛 kind / workflowStatus 正确；文案与 Sessions 一致。
4. 能从问题跳到 Sessions 或页面相关已有页。
5. 未改 `tasks`、无 Agent、无公网部署、无项目管理页。

## 明确不做

- 复用或合并 `tasks`
- Agent / verifying / 复盘必填
- 告警规则与通知深化
- HTTPS / 真站试点

## 协作

后端按本文落 `issues` API；前端接列表 + action；Sessions 口径只复用、不分叉。收口时群里过验收 1–5。

