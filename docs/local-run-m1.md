# M1 本地怎么跑

> 一页纸：把 **Demo 上报** → Gateway → Worker → API → **Console 看板** 跑通。  
> **注意：5173 ≠ 5174** — Console（看板）和 Demo（上报验收页）是两个应用，别开错。

| 应用 | 目录 | 本地地址 | 用途 |
|------|------|----------|------|
| **Console（看板）** | `apps/console` | http://127.0.0.1:5173/ | Overview 等监控台 |
| **Demo（上报验收页）** | `apps/demo` | http://127.0.0.1:5174/ | 浏览器里触发 SDK 上报 |

后端端口：Gateway ingest `http://127.0.0.1:3001/ingest` · API `http://127.0.0.1:3000`。

---

## 前置条件

1. **Node 22**（仓库根目录 `.nvmrc`，当前为 `22.22.1`；`engines` 要求 `^22.18.0 || >=24.12.0`）
2. **pnpm**（根 `package.json` 指定 `pnpm@11.7.0`）
3. **Docker**（`pnpm dev:infra` / `docker compose` 起 Postgres、ClickHouse、Redis、Redpanda、MinIO）
4. 本机可起：**gateway :3001**、**api :3000**、**worker**（以及上面两个前端）

---

## 命令（均在仓库根目录）

```bash
# 1. 依赖
pnpm install

# 2. 构建 packages（含 schema / sdk；Demo 依赖 workspace sdk）
pnpm build:packages
# 或只建 SDK：pnpm --filter @ai-frontend-monitor/sdk build

# 3. 基础设施
pnpm dev:infra

# 4a. 一键起 Console + API + Gateway + Worker（不含 Demo）
pnpm dev

# 4b. 或按需单独起
pnpm dev:console   # → :5173 看板
pnpm dev:demo      # → :5174 上报页（pnpm dev 不会带上它，需另开终端）
pnpm dev:api       # → :3000
pnpm dev:gateway   # → :3001 /ingest
pnpm dev:worker
```

根 `package.json` 里与本地相关的脚本：`dev`、`dev:infra`、`dev:console`、`dev:demo`、`dev:api`、`dev:gateway`、`dev:worker`、`build:packages`。

---

## Demo 鉴权（与 Gateway 硬编码一致）

| 字段 | 值 |
|------|-----|
| `projectId` | `demo` |
| `env` | `production` |
| `token` | `afm-demo-token` |
| `endpoint` | `http://127.0.0.1:3001/ingest` |

打开 http://127.0.0.1:5174/ 后，SDK 会自动上报 PV / FCP / LCP；页内按钮可再打一条 PV。

---

## Overview 验收

1. **Console**：打开 http://127.0.0.1:5173/ ，顶栏项目选 **demo**、环境选 **production**，看 Overview 是否有真实数据。  
2. **或 curl API**：

```bash
curl "http://127.0.0.1:3000/api/v1/overview?projectId=demo&env=production"
```

若无数据：确认 Gateway/Worker 已起、Demo 已访问过、顶栏/查询参数是 `demo` + `production`（不要把 `:5174` Demo 当成 `:5173` Console）。

---

## 端口速查（防混淆）

| 端口 | 是什么 | 不是什么 |
|------|--------|----------|
| **5173** | Console 看板 | 不是 Demo |
| **5174** | Demo 上报验收页 | 不是看板 |
| **3001** | Gateway `/ingest` | — |
| **3000** | API（含 overview） | — |
