import { onMounted, ref } from 'vue'
import { monitorSearch } from '@/composables/monitorSearch'

export interface SessionSummary {
  id: string
  user: string
  device: string
  region: string
  route: string
  release: string
  network: string
  status: '正常' | '缓慢' | '异常'
  duration: string
  eventCount: number
  errorCount: number
  startedAt: string
}

export interface SessionStep {
  at: string
  title: string
  detail: string
  bad: boolean
}

export function useSessionsData() {
  const rows = ref<SessionSummary[]>([])
  const steps = ref<SessionStep[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const detailError = ref<string | null>(null)

  async function fetchSessions() {
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`/api/v1/sessions?${monitorSearch().toString()}`)
      if (!response.ok) throw new Error(`Sessions request failed: ${response.status}`)
      rows.value = (await response.json()) as SessionSummary[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(sessionId: string) {
    steps.value = []
    detailError.value = null
    if (!sessionId) return
    try {
      const response = await fetch(`/api/v1/sessions/detail?${monitorSearch({ sessionId }).toString()}`)
      if (!response.ok) throw new Error(`Session detail failed: ${response.status}`)
      steps.value = (await response.json()) as SessionStep[]
    } catch (err) {
      detailError.value = err instanceof Error ? err.message : 'Unknown error'
      steps.value = []
    }
  }

  onMounted(() => {
    void fetchSessions()
  })

  return {
    rows,
    steps,
    loading,
    error,
    detailError,
    fetchSessions,
    fetchDetail,
  }
}
