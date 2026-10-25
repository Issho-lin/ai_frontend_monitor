/**
 * Console 问题 / 待处理 API 层 —— M4 最小集
 *
 * 产品口径（docs/M4-issues-minimal.md §列表项契约定稿）：
 * - 主路径：Sessions 路由聚合现算为异常 / 缓慢的行，可跟进工作流
 * - 不吃、不双写告警 `tasks`；Postgres 只落 workflowStatus
 * - 列表字段以文档定稿为准：title / kindLabel / windowHours / sessionCount / deepLink
 *   （不用 window 字符串、不用 affectedSessions）
 *
 * TODO(backend): 下列路径待后端落地后，将 USE_ISSUES_MOCK 改为 false。
 *   GET    /api/v1/issues?projectId=&env=&workflowStatus=&kind=&window=
 *   GET    /api/v1/issues/:id?projectId=&env=
 *   PATCH  /api/v1/issues/:id?projectId=&env=
 *     body: { "action": "ack" | "resolve" | "reopen" }
 *       ack → acked；resolve → resolved；reopen → open
 * 列表响应：`{ "items": Issue[] }` 或直接 Issue[] 均可；下方 normalizeList 兼容两种。
 */

export type IssueKind = 'abnormal' | 'slow'

export type IssueWorkflowStatus = 'open' | 'acked' | 'resolved'

export type IssueAction = 'ack' | 'resolve' | 'reopen'

/** 定稿列表项（docs/M4-issues-minimal.md） */
export type Issue = {
  id: string
  projectId: string
  env: string
  title: string
  kind: IssueKind
  kindLabel: string
  workflowStatus: IssueWorkflowStatus
  route: string
  /** 统计窗口（小时）；不用 window 字符串 */
  windowHours: number
  /** 窗口内相关会话数；不用 affectedSessions */
  sessionCount: number
  /** Console 内相对路径，跳 Sessions / 页面 */
  deepLink: string
  updatedAt: string
}

export type ListIssuesParams = {
  projectId: string
  env: string
  workflowStatus?: IssueWorkflowStatus | 'all'
  kind?: IssueKind | 'all'
  /** 传给 GET ?window=；真 API 用；mock 可按 windowHours 对齐 */
  windowHours?: number
}

/** 后端未就绪前走本地 mock；接真路由后改为 false */
export const USE_ISSUES_MOCK = true

const STATUS_LABEL: Record<IssueWorkflowStatus, string> = {
  open: '待处理',
  acked: '跟进中',
  resolved: '已处理',
}

export function issueStatusLabel(status: IssueWorkflowStatus): string {
  return STATUS_LABEL[status] ?? status
}

export function formatWindowHours(hours: number): string {
  if (hours === 24) return '近 24 小时'
  if (hours === 168) return '近 7 天'
  if (hours === 720) return '近 30 天'
  if (hours % 24 === 0) return `近 ${hours / 24} 天`
  return `近 ${hours} 小时`
}

function kindLabelFor(kind: IssueKind): string {
  return kind === 'abnormal' ? '异常' : '缓慢'
}

function titleFor(route: string, kind: IssueKind): string {
  return kind === 'abnormal' ? `${route} 异常会话偏高` : `${route} 缓慢会话偏高`
}

function deepLinkFor(route: string, kind: IssueKind): string {
  const qs = new URLSearchParams({ route, kind })
  return `/sessions?${qs.toString()}`
}

function nowIso(): string {
  return new Date().toISOString()
}

function delay(ms = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${response.status}${text ? `: ${text}` : ''}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function normalizeList(payload: unknown): Issue[] {
  if (Array.isArray(payload)) return payload as Issue[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) {
    return (payload as { items: Issue[] }).items
  }
  return []
}

// ── Mock store（进程内；刷新页面会重置；字段对齐 M4 定稿）────────────────────

const mockIssues: Issue[] = [
  {
    id: 'iss-demo-production-/checkout-abnormal',
    projectId: 'demo',
    env: 'production',
    title: titleFor('/checkout', 'abnormal'),
    kind: 'abnormal',
    kindLabel: kindLabelFor('abnormal'),
    workflowStatus: 'open',
    route: '/checkout',
    windowHours: 24,
    sessionCount: 14,
    deepLink: deepLinkFor('/checkout', 'abnormal'),
    updatedAt: '2026-10-25T00:12:00.000Z',
  },
  {
    id: 'iss-demo-production-/home-slow',
    projectId: 'demo',
    env: 'production',
    title: titleFor('/home', 'slow'),
    kind: 'slow',
    kindLabel: kindLabelFor('slow'),
    workflowStatus: 'open',
    route: '/home',
    windowHours: 24,
    sessionCount: 31,
    deepLink: deepLinkFor('/home', 'slow'),
    updatedAt: '2026-10-24T23:40:00.000Z',
  },
  {
    id: 'iss-demo-production-/search-slow',
    projectId: 'demo',
    env: 'production',
    title: titleFor('/search', 'slow'),
    kind: 'slow',
    kindLabel: kindLabelFor('slow'),
    workflowStatus: 'acked',
    route: '/search',
    windowHours: 24,
    sessionCount: 8,
    deepLink: deepLinkFor('/search', 'slow'),
    updatedAt: '2026-10-24T14:05:00.000Z',
  },
  {
    id: 'iss-demo-production-/profile-abnormal',
    projectId: 'demo',
    env: 'production',
    title: titleFor('/profile', 'abnormal'),
    kind: 'abnormal',
    kindLabel: kindLabelFor('abnormal'),
    workflowStatus: 'resolved',
    route: '/profile',
    windowHours: 168,
    sessionCount: 3,
    deepLink: deepLinkFor('/profile', 'abnormal'),
    updatedAt: '2026-10-23T08:30:00.000Z',
  },
]

const ACTION_RESULT: Record<IssueAction, IssueWorkflowStatus> = {
  ack: 'acked',
  resolve: 'resolved',
  reopen: 'open',
}

/** 未关闭优先；异常优于缓慢；同档按更新时间倒序（对齐 Sessions 置顶逻辑） */
function sortIssues(rows: Issue[]): Issue[] {
  const statusRank: Record<IssueWorkflowStatus, number> = {
    open: 0,
    acked: 1,
    resolved: 2,
  }
  const kindRank: Record<IssueKind, number> = {
    abnormal: 0,
    slow: 1,
  }
  return rows.slice().sort((a, b) => {
    const byStatus = statusRank[a.workflowStatus] - statusRank[b.workflowStatus]
    if (byStatus !== 0) return byStatus
    const byKind = kindRank[a.kind] - kindRank[b.kind]
    if (byKind !== 0) return byKind
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export function listIssues(params: ListIssuesParams): Promise<Issue[]> {
  const { projectId, env, workflowStatus = 'all', kind = 'all', windowHours } = params
  if (USE_ISSUES_MOCK) {
    return delay().then(() => {
      const filtered = mockIssues.filter((row) => {
        if (row.projectId !== projectId) return false
        if (row.env !== env) return false
        if (workflowStatus !== 'all' && row.workflowStatus !== workflowStatus) return false
        if (kind !== 'all' && row.kind !== kind) return false
        // mock：有 windowHours 时只展示同窗口行；无则不过滤，避免筛空
        if (windowHours != null && row.windowHours !== windowHours) return false
        return true
      })
      return sortIssues(filtered.map((r) => ({ ...r })))
    })
  }
  const qs = new URLSearchParams({ projectId, env })
  if (workflowStatus && workflowStatus !== 'all') qs.set('workflowStatus', workflowStatus)
  if (kind && kind !== 'all') qs.set('kind', kind)
  if (windowHours != null) qs.set('window', String(windowHours))
  return request<unknown>(`/api/v1/issues?${qs.toString()}`).then((payload) => sortIssues(normalizeList(payload)))
}

export function getIssue(id: string, projectId: string, env: string): Promise<Issue> {
  if (USE_ISSUES_MOCK) {
    return delay().then(() => {
      const row = mockIssues.find((r) => r.id === id && r.projectId === projectId && r.env === env)
      if (!row) throw new Error(`问题不存在: ${id}`)
      return { ...row }
    })
  }
  const qs = new URLSearchParams({ projectId, env })
  return request<Issue>(`/api/v1/issues/${encodeURIComponent(id)}?${qs.toString()}`)
}

export async function patchIssueAction(
  id: string,
  action: IssueAction,
  projectId: string,
  env: string,
): Promise<Issue> {
  if (USE_ISSUES_MOCK) {
    await delay()
    const row = mockIssues.find((r) => r.id === id && r.projectId === projectId && r.env === env)
    if (!row) throw new Error(`问题不存在: ${id}`)
    row.workflowStatus = ACTION_RESULT[action]
    row.updatedAt = nowIso()
    return { ...row }
  }
  const qs = new URLSearchParams({ projectId, env })
  return request<Issue>(`/api/v1/issues/${encodeURIComponent(id)}?${qs.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  })
}
