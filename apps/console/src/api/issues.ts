/**
 * Console 问题 / 待处理 API 层 —— M4 最小集
 *
 * 产品口径（docs/M4-issues-minimal.md）：
 * - 主路径：Sessions 路由聚合现算为异常 / 缓慢的行，可跟进工作流
 * - 不吃、不双写告警 `tasks`；Postgres 只落 workflowStatus
 * - kind：abnormal | slow（UI：异常 | 缓慢），与 Sessions 文案对齐
 *
 * TODO(backend): 下列路径待后端落地后，将 USE_ISSUES_MOCK 改为 false。
 *   GET    /api/v1/issues?projectId=&env=&workflowStatus=&kind=&window=
 *   GET    /api/v1/issues/:id?projectId=&env=
 *   PATCH  /api/v1/issues/:id?projectId=&env=
 *     body: { "action": "ack" | "resolve" | "reopen" }
 *       ack → acked；resolve → resolved；reopen → open
 */

export type IssueKind = 'abnormal' | 'slow'

export type IssueWorkflowStatus = 'open' | 'acked' | 'resolved'

export type IssueAction = 'ack' | 'resolve' | 'reopen'

export type Issue = {
  id: string
  kind: IssueKind
  workflowStatus: IssueWorkflowStatus
  route: string
  projectId: string
  env: string
  /** 时间窗口摘要，如「近 24 小时」 */
  window: string
  updatedAt: string
  /** 可选：受影响会话数（现算；无则空） */
  affectedSessions?: number | null
}

export type ListIssuesParams = {
  projectId: string
  env: string
  workflowStatus?: IssueWorkflowStatus | 'all'
  kind?: IssueKind | 'all'
  window?: string
}

/** 后端未就绪前走本地 mock；接真路由后改为 false */
export const USE_ISSUES_MOCK = true

const KIND_LABEL: Record<IssueKind, string> = {
  abnormal: '异常',
  slow: '缓慢',
}

const STATUS_LABEL: Record<IssueWorkflowStatus, string> = {
  open: '待处理',
  acked: '跟进中',
  resolved: '已处理',
}

export function issueKindLabel(kind: IssueKind): string {
  return KIND_LABEL[kind] ?? kind
}

export function issueStatusLabel(status: IssueWorkflowStatus): string {
  return STATUS_LABEL[status] ?? status
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

// ── Mock store（进程内；刷新页面会重置；字段对齐 M4）────────────────────────

const mockIssues: Issue[] = [
  {
    id: 'iss_demo_checkout_abnormal',
    kind: 'abnormal',
    workflowStatus: 'open',
    route: '/checkout',
    projectId: 'demo',
    env: 'production',
    window: '近 24 小时',
    updatedAt: '2026-10-25T08:12:00+08:00',
    affectedSessions: 14,
  },
  {
    id: 'iss_demo_home_slow',
    kind: 'slow',
    workflowStatus: 'open',
    route: '/home',
    projectId: 'demo',
    env: 'production',
    window: '近 24 小时',
    updatedAt: '2026-10-25T07:40:00+08:00',
    affectedSessions: 31,
  },
  {
    id: 'iss_demo_search_slow',
    kind: 'slow',
    workflowStatus: 'acked',
    route: '/search',
    projectId: 'demo',
    env: 'production',
    window: '近 24 小时',
    updatedAt: '2026-10-24T22:05:00+08:00',
    affectedSessions: 8,
  },
  {
    id: 'iss_demo_profile_abnormal',
    kind: 'abnormal',
    workflowStatus: 'resolved',
    route: '/profile',
    projectId: 'demo',
    env: 'production',
    window: '近 7 天',
    updatedAt: '2026-10-23T16:30:00+08:00',
    affectedSessions: 3,
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
  const { projectId, env, workflowStatus = 'all', kind = 'all', window } = params
  if (USE_ISSUES_MOCK) {
    return delay().then(() => {
      const filtered = mockIssues.filter((row) => {
        if (row.projectId !== projectId) return false
        if (row.env !== env) return false
        if (workflowStatus !== 'all' && row.workflowStatus !== workflowStatus) return false
        if (kind !== 'all' && row.kind !== kind) return false
        if (window && row.window !== window) return false
        return true
      })
      return sortIssues(filtered.map((r) => ({ ...r })))
    })
  }
  const qs = new URLSearchParams({ projectId, env })
  if (workflowStatus && workflowStatus !== 'all') qs.set('workflowStatus', workflowStatus)
  if (kind && kind !== 'all') qs.set('kind', kind)
  if (window) qs.set('window', window)
  return request<Issue[]>(`/api/v1/issues?${qs.toString()}`).then(sortIssues)
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
