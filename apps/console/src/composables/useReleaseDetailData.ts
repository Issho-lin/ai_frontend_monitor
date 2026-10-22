import { type Ref, ref, watch } from 'vue'
import {
  type ReleaseDiff,
  type ReleaseRow,
} from '@/mock/data'
import { useFiltersStore } from '@/stores/filters'

export interface ReleaseAlertRow {
  id: string
  title: string
  severity: string
  route: string
  metric: string
  triggerValue: string
}

export interface ReleaseDiffResult extends Omit<ReleaseDiff, 'alerts'> {
  alerts: ReleaseAlertRow[]
}

export interface ReleaseDetailPayload {
  release: ReleaseRow | null
  diff: ReleaseDiffResult | null
}

export function useReleaseDetailData(version: Ref<string>, env: Ref<string>) {
  const filters = useFiltersStore()
  const release = ref<ReleaseRow | null>(null)
  const diff = ref<ReleaseDiffResult | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDetail() {
    loading.value = true
    error.value = null
    const currentVersion = version.value
    const currentEnv = env.value

    try {
      const params = new URLSearchParams({ projectId: filters.currentProject })
      if (currentEnv) {
        params.set('env', currentEnv)
      }
      const response = await fetch(
        `/api/v1/releases/${encodeURIComponent(currentVersion)}?${params.toString()}`,
      )
      if (!response.ok) {
        throw new Error(`Release detail request failed: ${response.status}`)
      }
      const payload = (await response.json()) as ReleaseDetailPayload
      release.value = payload.release
      diff.value = payload.diff
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      release.value = null
      diff.value = null
    } finally {
      loading.value = false
    }
  }

  watch([version, env], () => {
    void fetchDetail()
  }, { immediate: true })

  return {
    release,
    diff,
    loading,
    error,
    fetchDetail,
  }
}
