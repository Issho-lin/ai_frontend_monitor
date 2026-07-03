import { onMounted, ref } from 'vue'
import { errorGroups as mockErrorGroups, trendSeries as mockTrendSeries, type ErrorGroup } from '@/mock/data'

export function useErrorsData() {
  const rows = ref<ErrorGroup[]>(mockErrorGroups)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchErrors() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/v1/errors?projectId=demo&env=production')
      if (!response.ok) {
        throw new Error(`Errors request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as ErrorGroup[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = mockErrorGroups
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchErrors()
  })

  return {
    rows,
    loading,
    error,
    trendSeries: mockTrendSeries,
    fetchErrors,
  }
}
