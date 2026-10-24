/**
 * Console 告警规则（核心指标劣化）API 层 —— M3 最小集
 *
 * 现状：后端已有「触发实例」API（GET/PATCH /api/v1/alerts），规则阈值仍硬编码在
 * apps/api/src/alerts/alerts.service.ts（LCP / JS 错误率 / API 错误率）。
 * 本层为 Console 可配壳；接真后关掉 mock。
 *
 * TODO(backend): 下列路径待后端落地后，将 USE_ALERT_RULES_MOCK 改为 false。
 *   GET    /api/v1/alert-rules?projectId=&env=
 *   PATCH  /api/v1/alert-rules/:id
 *     body: { poorThreshold?, severeThreshold?, enabled?, webhookUrl?, email? }
 *
 * 约定：规则 id 与后端 rule_id 对齐（lcp-p75-threshold / js-error-rate / api-error-rate），
 * 评估逻辑接真后读库覆盖硬编码常量。
 */

export type AlertRuleMetric = 'LCP P75' | 'JS Error Rate' | 'API Error Rate'

export type AlertRuleUnit = 'ms' | 'percent'

export type AlertRule = {
  id: string
  name: string
  metric: AlertRuleMetric
  /** 不良线：超过才进入「相对基线」判断区 */
  poorThreshold: number
  /** 严重线：达到即 S0 */
  severeThreshold: number
  unit: AlertRuleUnit
  enabled: boolean
  /** 通知占位：Webhook URL（可空） */
  webhookUrl: string
  /** 通知占位：邮件地址（可空） */
  email: string
  updatedAt: string
}

export type UpdateAlertRuleInput = {
  poorThreshold?: number
  severeThreshold?: number
  enabled?: boolean
  webhookUrl?: string
  email?: string
}

/** 后端规则 CRUD 未就绪前走本地 mock；接真路由后改为 false */
export const USE_ALERT_RULES_MOCK = true

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

// ── Mock store（与设计文档 §4 / 后端硬编码默认值对齐）────────────────────────

const mockRules: AlertRule[] = [
  {
    id: 'lcp-p75-threshold',
    name: '核心页面 LCP 劣化',
    metric: 'LCP P75',
    poorThreshold: 2500,
    severeThreshold: 4000,
    unit: 'ms',
    enabled: true,
    webhookUrl: '',
    email: '',
    updatedAt: '2026-06-01T08:00:00+08:00',
  },
  {
    id: 'js-error-rate',
    name: 'JS 错误率升高',
    metric: 'JS Error Rate',
    poorThreshold: 1,
    severeThreshold: 10,
    unit: 'percent',
    enabled: true,
    webhookUrl: '',
    email: '',
    updatedAt: '2026-06-01T08:00:00+08:00',
  },
  {
    id: 'api-error-rate',
    name: '接口错误率升高',
    metric: 'API Error Rate',
    poorThreshold: 2,
    severeThreshold: 10,
    unit: 'percent',
    enabled: true,
    webhookUrl: '',
    email: '',
    updatedAt: '2026-06-01T08:00:00+08:00',
  },
]

export function formatRuleThreshold(value: number, unit: AlertRuleUnit): string {
  if (unit === 'ms') {
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}s`
    return `${value}ms`
  }
  return `${value}%`
}

export function listAlertRules(projectId: string, env: string): Promise<AlertRule[]> {
  void projectId
  void env
  if (USE_ALERT_RULES_MOCK) {
    return delay().then(() => mockRules.map((r) => ({ ...r })))
  }
  // TODO(backend): GET /api/v1/alert-rules?projectId=&env=
  const qs = new URLSearchParams({ projectId, env })
  return request<AlertRule[]>(`/api/v1/alert-rules?${qs.toString()}`)
}

export async function updateAlertRule(
  id: string,
  input: UpdateAlertRuleInput,
  projectId: string,
  env: string,
): Promise<AlertRule> {
  if (USE_ALERT_RULES_MOCK) {
    await delay()
    const row = mockRules.find((r) => r.id === id)
    if (!row) throw new Error(`告警规则不存在: ${id}`)
    if (input.poorThreshold !== undefined) row.poorThreshold = input.poorThreshold
    if (input.severeThreshold !== undefined) row.severeThreshold = input.severeThreshold
    if (input.enabled !== undefined) row.enabled = input.enabled
    if (input.webhookUrl !== undefined) row.webhookUrl = input.webhookUrl.trim()
    if (input.email !== undefined) row.email = input.email.trim()
    row.updatedAt = nowIso()
    return { ...row }
  }
  // TODO(backend): PATCH /api/v1/alert-rules/:id?projectId=&env=
  const qs = new URLSearchParams({ projectId, env })
  return request<AlertRule>(`/api/v1/alert-rules/${encodeURIComponent(id)}?${qs.toString()}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}
