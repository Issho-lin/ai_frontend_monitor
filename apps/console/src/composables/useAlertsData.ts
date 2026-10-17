import { onMounted, ref } from 'vue'
import { alertRows as mockAlertRows, type AlertRow } from '@/mock/data'

export function useAlertsData() {
  const rows = ref<AlertRow[]>(mockAlertRows)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAlerts() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/v1/alerts?projectId=demo&env=production')
      if (!response.ok) {
        throw new Error(`Alerts request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as AlertRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = mockAlertRows
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchAlerts()
  })

  return {
    rows,
    loading,
    error,
    fetchAlerts,
  }
}
