import { onMounted, ref } from 'vue'
import { releaseRows as mockReleaseRows, type ReleaseRow } from '@/mock/data'

export function useReleasesData() {
  const rows = ref<ReleaseRow[]>(mockReleaseRows)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchReleases() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/v1/releases?projectId=demo')
      if (!response.ok) {
        throw new Error(`Releases request failed: ${response.status}`)
      }
      rows.value = (await response.json()) as ReleaseRow[]
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      rows.value = mockReleaseRows
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
