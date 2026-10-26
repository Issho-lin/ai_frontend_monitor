import { ref, watch, type Ref } from 'vue'
import {
  type AlertRow,
  type ErrorGroup,
  type MetricDiff,
  type ResourceRow,
  type TriageModel,
} from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'
import type { SessionStep } from '@/composables/useSessionsData'

function fromError(error: ErrorGroup, resources: ResourceRow[]): TriageModel {
  return {
    kind: 'error',
    id: error.id,
    title: error.message,
    route: error.route,
    release: error.release,
    introducedByRelease: false,
    affectedUsers: error.affectedUsers,
    summary: `${error.type} · ${error.count.toLocaleString()} 次 · 最近一次 ${error.lastSeen}`,
    stack: null,
    timeline: [],
    sessionId: null,
    metrics: [],
    resources,
  }
}

function fromAlert(alert: AlertRow, resources: ResourceRow[]): TriageModel {
  return {
    kind: 'alert',
    id: alert.id,
    title: alert.title,
    route: alert.route,
    release: alert.release,
    introducedByRelease: false,
    affectedUsers: alert.affectedUsers,
    summary: `${alert.metric} 当前 ${alert.triggerValue}，基线 ${alert.baseline}。状态 ${alert.status}。`,
    stack: null,
    timeline: [],
    sessionId: null,
    metrics: [],
    resources,
    alertId: alert.id,
    taskId: alert.linkedTaskId,
  }
}

function splitStack(stack: string) {
  const lines = stack.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim())
  return lines.length ? lines : null
}

async function fetchErrorContext(errorId: string) {
  const response = await fetch(`/api/v1/errors/context?${monitorSearch({ errorId, window: '30d' }).toString()}`)
  if (!response.ok) return { stack: '', sessionId: '' }
  return (await response.json()) as { stack: string; sessionId: string }
}

async function fetchError(errorId: string) {
  const response = await fetch(`/api/v1/errors/item?${monitorSearch({ errorId }).toString()}`)
  if (!response.ok) throw new Error('接口暂不可用。')
  return (await response.json()) as ErrorGroup | null
}

async function fetchLatestSession(route: string) {
  const response = await fetch(`/api/v1/sessions/latest?${monitorSearch({ route }).toString()}`)
  if (!response.ok) return ''
  const body = (await response.json()) as { sessionId: string }
  return body.sessionId
}

async function fetchSteps(sessionId: string) {
  if (!sessionId) return []
  const response = await fetch(`/api/v1/sessions/detail?${monitorSearch({ sessionId, window: '30d' }).toString()}`)
  if (!response.ok) return []
  return (await response.json()) as SessionStep[]
}

async function fetchResources(route: string): Promise<ResourceRow[]> {
  if (!route) return []
  const params = monitorSearch({ route, window: '30d' })
  const response = await fetch(`/api/v1/pages/resources?${params.toString()}`)
  if (!response.ok) return []
  return (await response.json()) as ResourceRow[]
}

async function fetchReleaseEvidence(release: string, errorId?: string) {
  if (!release) return { introduced: false, metrics: [] as MetricDiff[] }
  const response = await fetch(
    `/api/v1/releases/${encodeURIComponent(release)}?${monitorSearch().toString()}`,
  )
  if (!response.ok) return { introduced: false, metrics: [] as MetricDiff[] }
  const payload = (await response.json()) as {
    diff: { metrics: MetricDiff[]; errors: { id: string; kind: string }[] } | null
  }
  const diff = payload.diff
  return {
    introduced: Boolean(errorId && diff?.errors.some((item) => item.id === errorId && item.kind === 'new')),
    metrics: diff?.metrics.filter((item) => item.bad) ?? [],
  }
}

export function useTriageData(kind: Ref<string>, id: Ref<string>) {
  const model = ref<TriageModel | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const source = ref<'live' | 'empty'>('empty')

  async function load() {
    const currentKind = kind.value
    const currentId = id.value
    loading.value = true
    error.value = null

    if (currentKind === 'session' || currentKind === 'release') {
      model.value = null
      source.value = 'empty'
      error.value = currentKind === 'session' ? '还没有会话数据。' : '没有这条发布记录。'
      loading.value = false
      return
    }

    try {
      if (currentKind === 'error') {
        const match = await fetchError(currentId)
        if (!match) {
          model.value = null
          source.value = 'live'
          return
        }
        const [resources, context, evidence] = await Promise.all([
          fetchResources(match.route).catch(() => []),
          fetchErrorContext(match.id),
          fetchReleaseEvidence(match.release, match.id),
        ])
        const steps = await fetchSteps(context.sessionId)
        model.value = {
          ...fromError(match, resources),
          stack: splitStack(context.stack),
          timeline: steps,
          sessionId: context.sessionId || null,
          introducedByRelease: evidence.introduced,
          metrics: evidence.metrics,
        }
        source.value = 'live'
        return
      }

      if (currentKind === 'alert') {
        const response = await fetch(`/api/v1/alerts/${encodeURIComponent(currentId)}?${monitorSearch().toString()}`)
        if (!response.ok) {
          throw new Error(response.status === 404 ? '没有这条告警。' : '接口暂不可用。')
        }
        const alert = (await response.json()) as AlertRow
        const [resources, sessionId, evidence] = await Promise.all([
          fetchResources(alert.route).catch(() => []),
          fetchLatestSession(alert.route),
          fetchReleaseEvidence(alert.release),
        ])
        const steps = await fetchSteps(sessionId)
        model.value = {
          ...fromAlert(alert, resources),
          timeline: steps,
          sessionId: sessionId || null,
          metrics: evidence.metrics,
        }
        source.value = 'live'
        return
      }

      model.value = null
      source.value = 'empty'
      error.value = '没有这条排障记录。'
    } catch (err) {
      error.value = err instanceof Error ? err.message : '接口暂不可用。'
      model.value = null
      source.value = 'empty'
    } finally {
      loading.value = false
    }
  }

  watch([kind, id], () => {
    void load()
  }, { immediate: true })

  return {
    model,
    loading,
    error,
    source,
  }
}
