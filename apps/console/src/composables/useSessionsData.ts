import { onMounted, ref } from 'vue'
import { monitorSearch } from '@/composables/monitorSearch'

export type { SessionStep } from '@/composables/useSessionDetailData'

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

export function useSessionsData() {
  const rows = ref<SessionSummary[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  onMounted(() => {
    void fetchSessions()
  })

  return {
    rows,
    loading,
    error,
    fetchSessions,
  }
}
