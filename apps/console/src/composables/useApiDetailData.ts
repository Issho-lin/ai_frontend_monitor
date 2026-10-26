import { onMounted, ref, watch, type Ref } from 'vue'
import type { ApiRow } from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

export interface ApiStatusBucket {
  bucket: string
  requests: number
}

export interface ApiPageHit {
  route: string
  requests: number
}

export interface ApiTrendPoint {
  hour: string
  p95: number
  requests: number
}

export function useApiDetailData(api: Ref<string>) {
  const summary = ref<ApiRow | null>(null)
  const statuses = ref<ApiStatusBucket[]>([])
  const pages = ref<ApiPageHit[]>([])
  const trend = ref<ApiTrendPoint[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDetail() {
    summary.value = null
    statuses.value = []
    pages.value = []
    trend.value = []
    if (!api.value) return
    loading.value = true
    error.value = null
    try {
      const response = await fetch(`/api/v1/apis/detail?${monitorSearch({ api: api.value }).toString()}`)
      if (!response.ok) throw new Error(`API detail failed: ${response.status}`)
      const body = await response.json() as {
        summary: ApiRow | null
        statuses: ApiStatusBucket[]
        pages: ApiPageHit[]
        trend: ApiTrendPoint[]
      }
      summary.value = body.summary
      statuses.value = body.statuses
      pages.value = body.pages
      trend.value = body.trend
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchDetail()
  })
  watch(api, () => {
    void fetchDetail()
  })

  return { summary, statuses, pages, trend, loading, error }
}
