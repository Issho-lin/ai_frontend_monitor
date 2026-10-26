import { onMounted, ref } from 'vue'
import { type PageRow } from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

export function usePagesData() {
  const rows = ref<PageRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPages() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/pages?${monitorSearch().toString()}`)
      if (!response.ok) {
        throw new Error(`Pages request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as PageRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = []
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
    fetchPages,
  }
}
