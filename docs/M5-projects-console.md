# M5 — Console 项目管理 / Token（最小集）

产品改口（2026-10-26）：用户认为「每接一站改 Gateway 环境变量太麻烦」，**收回 B 方案「不做项目管理 UI」**，开本片。

## 目标

在 Console 里能：**建项目、发/轮换 Token、复制明文（仅一次）、吊销**。  
Gateway ingest 校验改为认「库里的有效 Token」（可与启动时 env 种子并存），不再要求每接一站手改 `AFM_PROJECT_TOKENS`。

**仍然要做的：** 业务站 SDK 初始化写一次 `projectId` + token（接埋点本来就要）。本片省掉的是运维改 Gateway 配置。

## 范围（做）

对齐已有前端契约 `apps/console/src/api/projects.ts`（当前 `USE_PROJECTS_MOCK=true`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/projects` | 列表 |
| POST | `/api/v1/projects` | 创建 `{ id, name, env }` |
| PATCH | `/api/v1/projects/:id` | 改 name/env |
| DELETE | `/api/v1/projects/:id` | **硬删除**（204）：删项目行并 `ON DELETE CASCADE` 删掉其 token 行；alerts/issues/tasks 不级联 |
| GET | `/api/v1/projects/:id/tokens` | Token 列表（仅掩码，无明文） |
| POST | `/api/v1/projects/:id/tokens` | 生成；**响应仅此一次**含 `tokenPlain` |
| POST | `/api/v1/projects/:id/tokens/:tokenId/revoke` | 吊销 |

存储约定（与前端注释一致）：

- 服务端只存 Token **hash**（或等价不可逆形式），列表只回 `tokenMasked`。
- 明文只在 create 响应里出现一次；刷新/再 GET 拿不到。

Console：

- 恢复侧栏 / 路由「项目」入口（`ProjectsView` 已在；此前搁置）。
- 关 `USE_PROJECTS_MOCK`，接真 API。
- 顶栏项目切换数据源改为真列表（与现 filters 对齐）。

Gateway：

- ingest 校验：有效 token ∈ 该 `projectId` 下未吊销记录。Gateway 直连同一 Postgres，按 SHA-256(明文) 查 `project_tokens`（`enabled` 且 `revoked_at IS NULL`）。命中缓存 `AFM_TOKEN_CACHE_TTL_MS`（默认 5s）；API 在签发/吊销/删除后 `NOTIFY afm_project_tokens` 清缓存，新 Token 不必重启 Gateway。
- **迁移：** API 启动时若 `projects` 为空，把 `AFM_PROJECT_TOKENS`（否则 `PROJECT_TOKENS`，再否则 `demo`/`afm-demo-token`）种子写入（只存 hash + 掩码）。库不可达，或该 projectId 还没有项目行时，Gateway 仍用 env 映射兜底。已入库项目的错 Token / 已吊销 Token 不会被 env 放行。
- 限流、脱敏不变。
- 表由 API 启动时 `CREATE TABLE IF NOT EXISTS` 补齐（已有数据卷不会重跑 `infra/postgres/init`）；新库另有 `infra/postgres/init/03-create-projects.sql`。没有单独的 migration CLI。

## 不做

- 成员 / 角色 / SSO
- Token 权限细分（读/写分离）以外的复杂 ACL
- 公网 HTTPS、真站试点（仍另拍）
- Agent

## 验收

1. Console 能新建项目并 **一次** 看到明文 Token，可复制；之后列表只有掩码。
2. 用该 Token + projectId 打 Gateway `/ingest` 成功；错 Token / 已吊销 → 401。
3. 吊销后旧 Token 立即失效；可再发新 Token。
4. 不改 `AFM_PROJECT_TOKENS` 也能完成「新项目可上报」（库内 Token 生效）；env 种子仅作空库兜底。
5. `USE_PROJECTS_MOCK=false`，侧栏「项目」可见。

## 协作

1. 后端落表 + 上表 API + Gateway 认库  
2. 前端恢复入口、关 mock、对验收  
3. 产品：本页即范围；收口群里过 1–5  

