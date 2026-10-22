import { type Ref, ref, watch } from 'vue'
import { type AlertRow } from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

export function useAlertDetailData(id: Ref<string>) {
  const alert = ref<AlertRow | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const acting = ref(false)

  async function fetchAlert() {
    loading.value = true
    error.value = null
    const currentId = id.value

    try {
      const response = await fetch(`/api/v1/alerts/${encodeURIComponent(currentId)}?${monitorSearch().toString()}`)
      if (!response.ok) {
        throw new Error(`Alert request failed: ${response.status}`)
      }

      alert.value = (await response.json()) as AlertRow
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      alert.value = null
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
      const response = await fetch(`/api/v1/alerts/${encodeURIComponent(currentId)}?${monitorSearch().toString()}`, {
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
