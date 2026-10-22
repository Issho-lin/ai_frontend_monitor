import { onMounted, ref } from 'vue'
import { type ApiRow } from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

export function useApisData() {
  const rows = ref<ApiRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchApis() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/apis?${monitorSearch().toString()}`)
      if (!response.ok) {
        throw new Error(`APIs request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as ApiRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchApis()
  })

  return {
    rows,
    loading,
    error,
    fetchApis,
  }
}
