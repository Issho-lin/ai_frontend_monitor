import { type Ref, ref, watch } from 'vue'
import { taskRows as mockTaskRows, trendSeries as mockTrendSeries, type TaskRow } from '@/mock/data'

const QUERY = new URLSearchParams({
  projectId: 'demo',
  env: 'production',
})

export interface TaskVerification {
  passed: boolean
  series: { timestamp: string; value: number }[]
}

type TaskDetail = TaskRow & { verification?: TaskVerification }

function mockForId(id: string): TaskDetail {
  const row = mockTaskRows.find((item) => item.id === id) ?? mockTaskRows[0]
  return {
    ...row,
    verification: {
      passed: row.acceptanceSpec.current <= row.acceptanceSpec.target,
      series: mockTrendSeries.lcp.map(([timestamp, value]) => ({ timestamp, value })),
    },
  }
}

export function useTaskDetailData(id: Ref<string>) {
  const task = ref<TaskDetail>(mockForId(id.value))
  const loading = ref(false)
  const acting = ref(false)
  const error = ref<string | null>(null)

  async function fetchTask() {
    loading.value = true
    error.value = null
    const currentId = id.value
    const fallback = mockForId(currentId)

    try {
      const response = await fetch(`/api/v1/tasks/${encodeURIComponent(currentId)}?${QUERY.toString()}`)
      if (!response.ok) {
        throw new Error(`Task request failed: ${response.status}`)
      }
      task.value = (await response.json()) as TaskDetail
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      task.value = fallback
    } finally {
      loading.value = false
    }
  }

  async function applyAction(
    action: 'start' | 'submit_fix' | 'resolve' | 'reopen',
    payload: { release?: string } = {},
  ) {
    acting.value = true
    try {
      const response = await fetch(`/api/v1/tasks/${encodeURIComponent(id.value)}?${QUERY.toString()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      if (!response.ok) {
        throw new Error(`Task action failed: ${response.status}`)
      }
      task.value = (await response.json()) as TaskDetail
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      acting.value = false
    }
  }

  watch(id, () => {
    void fetchTask()
  }, { immediate: true })

  return {
    task,
    loading,
    acting,
    error,
    fetchTask,
    applyAction,
  }
}

export async function createTask(payload: {
  title: string
  owner: string
  priority: string
  acceptance: string
  dueDate: string
  sourceAlertId: string
  evidenceIds: string[]
}) {
  const response = await fetch(`/api/v1/tasks?${QUERY.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Create task failed: ${response.status}`)
  }
  return (await response.json()) as TaskRow
}
