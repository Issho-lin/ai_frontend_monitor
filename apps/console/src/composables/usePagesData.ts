import { onMounted, ref } from 'vue'
import { pageRows as mockPageRows, trendSeries as mockTrendSeries, type PageRow } from '@/mock/data'

export function usePagesData() {
  const rows = ref<PageRow[]>(mockPageRows)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPages() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/v1/pages?projectId=demo&env=production')
      if (!response.ok) {
        throw new Error(`Pages request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as PageRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = mockPageRows
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchPages()
  })

  return {
    rows,
    loading,
    error,
    trendSeries: mockTrendSeries,
    fetchPages,
  }
}
