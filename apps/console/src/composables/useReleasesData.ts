import { onMounted, ref } from 'vue'
import { type ReleaseRow } from '@/mock/data'
import { useFiltersStore } from '@/stores/filters'

export function useReleasesData() {
  const filters = useFiltersStore()
  const rows = ref<ReleaseRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchReleases() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/releases?projectId=${encodeURIComponent(filters.currentProject)}`)
      if (!response.ok) {
        throw new Error(`Releases request failed: ${response.status}`)
      }
      rows.value = (await response.json()) as ReleaseRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchReleases()
  })

  return {
    rows,
    loading,
    error,
    fetchReleases,
  }
}
