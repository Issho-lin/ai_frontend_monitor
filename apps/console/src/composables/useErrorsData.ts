import { onMounted, ref } from 'vue'
import { type ErrorGroup } from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

export function useErrorsData() {
  const rows = ref<ErrorGroup[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchErrors() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/errors?${monitorSearch().toString()}`)
      if (!response.ok) {
        throw new Error(`Errors request failed: ${response.status}`)
      }

      rows.value = (await response.json()) as ErrorGroup[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = []
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
    fetchErrors,
  }
}
