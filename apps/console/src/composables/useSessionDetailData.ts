import { type Ref, watch, ref } from 'vue'
import { monitorSearch } from '@/composables/monitorSearch'

export interface SessionStep {
  at: string
  title: string
  detail: string
  bad: boolean
}

export function useSessionDetailData(sessionId: Ref<string>) {
  const steps = ref<SessionStep[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDetail() {
    steps.value = []
    error.value = null
    const id = sessionId.value
    if (!id) return
    loading.value = true
    try {
      const response = await fetch(`/api/v1/sessions/detail?${monitorSearch({ sessionId: id }).toString()}`)
      if (!response.ok) throw new Error(`Session detail failed: ${response.status}`)
      steps.value = (await response.json()) as SessionStep[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      steps.value = []
    } finally {
      loading.value = false
    }
  }

  watch(sessionId, () => {
    void fetchDetail()
  }, { immediate: true })

  return {
    steps,
    loading,
    error,
    fetchDetail,
  }
}
