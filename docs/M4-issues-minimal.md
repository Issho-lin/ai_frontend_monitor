# M4 — 问题 / 待处理闭环（最小集）

产品口径（2026-10-25）：**先把功能做完，暂无部署条件** → 公网 HTTPS、真站点 SDK 试点整段搁置。  
本片是下一功能拍：**把异常从「只看」变成「能跟」**。  
**不做：** 项目管理 / Token CRUD UI、告警规则深化、Agent 诊断、修复验证 Worker、发布复盘全文。

## 目标

Console 有一个「问题 / 待处理」列表，条目可改状态；口径与 Sessions 的 **异常 / 缓慢 / 正常** 对齐复用，不另造「有问题」合集。

## 问题从哪来（本片）

一条「问题」= 一条可跟进的工作项，本片只吃两类来源（合并进同一列表）：

| 来源 | 入列条件 | 标题 / 关键字段建议 |
|------|----------|-------------------|
| 告警 | `alerts` 表 `status=firing`（已有评估器） | 复用告警 title；带 `alertId`、`route`、`metric`、`severity` |
| 会话聚合 | 某 `route` 在窗口内「异常」或「缓慢」会话占比达线（与 Console Sessions 同口径） | 如「`/checkout` 异常会话偏高」；带 `route`、会话态、窗口 |

- **默认列表筛：** 全部（与 Sessions 一致）；可筛 `open` / `in_progress` / `resolved`。
- **排序：** 未关闭优先；同状态内 severity / 最近更新时间倒序。异常、缓慢相关条目置顶逻辑可复用 Sessions。
- 告警已 `resolved` / `false_positive` / `silence` 中：对应问题若仍 `open`，本片允许人工关掉，**不强制**自动关（自动关可二期）。

## 状态机（本片三态）

```
open → in_progress → resolved
         ↑_______________|  （允许 reopen → open 或 in_progress）
```

| 状态 | 含义 | 谁改 |
|------|------|------|
| `open` | 待处理 | 入列默认；reopen 回到此或 `in_progress` |
| `in_progress` | 跟进中 | 人工 |
| `resolved` | 已处理（本片不验指标） | 人工 |

本片**不要** `verifying`、不要验收窗口、不要强制填复盘。`assignee` 可选字符串即可（无成员系统）。

## 数据与 API（建议）

Postgres 表 `issues`（名可微调，前后端对齐即可），建议字段：

- `id`, `project_id`, `env`
- `title`, `severity`（可空，告警来源带上）
- `status`：`open` | `in_progress` | `resolved`
- `source`：`alert` | `session_route`
- `source_id`：告警 id，或 `route` 指纹
- `route`, `metric`（可空）
- `session_state`：`abnormal` | `slow` | null（会话来源用，与 UI 文案异常/缓慢对齐）
- `assignee`（可空）
- `created_at`, `updated_at`
- 唯一约束建议：`(project_id, env, source, source_id)` 便于告警/路由 upsert，避免刷屏

### HTTP（Console 真接）

```http
GET  /api/v1/issues?projectId=&env=&status=&window=
GET  /api/v1/issues/:id?projectId=&env=
PATCH /api/v1/issues/:id?projectId=&env=
  { "status": "open" | "in_progress" | "resolved", "assignee"?: string }
```

- 列表项需能跳：告警详情（已有）或 Sessions / Page（已有路由）——详情里给 `deepLink` 或前端自己拼。
- 入列：告警路径可在 alert upsert firing 时同步 upsert issue；会话路径可用定时或读列表时懒聚合（二选一，本片验收不绑实现）。

鉴权与现网 API 一致（本机 Token / 现有 Console 调法），**不**新开项目管理。

## Console

1. 一级入口：**问题**（或「待处理」）— 列表 + 状态筛 + 行内/详情改状态。
2. 行展示：标题、来源标签（告警 | 会话）、route、异常/缓慢文案（与 Sessions 同一套）、severity、状态、更新时间。
3. 详情：同上字段 + 跳转来源；状态流转按钮；可选 assignee 输入。
4. **不**做 Agent 报告区、**不**做验证进度条。

Mock 开关若沿用现有惯例，默认真接；本地无数据时列表空态即可。

## 验收（本片收口）

1. Demo / production 下，存在 firing 告警或可构造的异常/缓慢会话时，问题列表能看到对应条目。
2. 能把一条问题 `open → in_progress → resolved`，刷新后状态仍在。
3. 列表默认「全部」，筛状态正确；异常/缓慢文案与 Sessions 一致。
4. 从问题能跳到告警或会话/页面相关已有页。
5. 无 Agent、无公网部署、无新项目管理页。

## 明确不做（防范围爬）

- Agent 诊断 / 任务草稿 / 工具审计  
- Verifying + 观察窗口 + 复盘必填  
- 告警规则新增指标、邮件渠道  
- 多项目 CRUD、正式 HTTPS、真站 SDK 试点  

## 协作顺序建议

1. 后端：表 + GET/PATCH + 告警→issue upsert（会话来源可第二小步）  
2. 前端：列表 + 详情 + 状态流转，口径对齐 Sessions  
3. 产品：本页即范围；收口时群里口头过验收 1–5  

