import { type Ref, ref, watch } from 'vue'
import { alertRows as mockAlertRows, type AlertRow, type AlertStatus } from '@/mock/data'

function mockForId(id: string) {
  return mockAlertRows.find((item) => item.id === id) ?? mockAlertRows[0]
}

const QUERY = new URLSearchParams({
  projectId: 'demo',
  env: 'production',
})

export function useAlertDetailData(id: Ref<string>) {
  const alert = ref<AlertRow>(mockForId(id.value))
  const loading = ref(false)
  const error = ref<string | null>(null)
  const acting = ref(false)

  async function fetchAlert() {
    loading.value = true
    error.value = null
    const currentId = id.value
    const fallback = mockForId(currentId)

    try {
      const response = await fetch(`/api/v1/alerts/${encodeURIComponent(currentId)}?${QUERY.toString()}`)
      if (!response.ok) {
        throw new Error(`Alert request failed: ${response.status}`)
      }

      alert.value = (await response.json()) as AlertRow
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      alert.value = fallback
    } finally {
      loading.value = false
    }
  }

  async function applyAction(
    action: 'acknowledge' | 'silence' | 'false_positive',
    silenceHours?: number,
  ) {
    acting.value = true
    const currentId = id.value

    try {
      const response = await fetch(`/api/v1/alerts/${encodeURIComponent(currentId)}?${QUERY.toString()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, silenceHours }),
      })
      if (!response.ok) {
        throw new Error(`Alert action failed: ${response.status}`)
      }
      alert.value = (await response.json()) as AlertRow
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      const nextStatus: AlertStatus =
        action === 'acknowledge' ? 'acknowledged' : action === 'silence' ? 'silenced' : 'resolved'
      alert.value = { ...alert.value, status: nextStatus }
    } finally {
      acting.value = false
    }
  }

  watch(id, () => {
    void fetchAlert()
  }, { immediate: true })

  return {
    alert,
    loading,
    acting,
    error,
    fetchAlert,
    applyAction,
  }
}
