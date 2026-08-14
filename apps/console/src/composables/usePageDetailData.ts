import { type Ref, watch, ref } from 'vue'
import {
  apiRows as mockApiRows,
  pageRows as mockPageRows,
  resourceRows as mockResourceRows,
  trendSeries as mockTrendSeries,
  type ApiRow,
  type PageRow,
  type ResourceRow,
} from '@/mock/data'

interface PageDetailPayload {
  page: PageRow | null
  resources: ResourceRow[]
  apis: ApiRow[]
}

function mockForRoute(route: string): PageDetailPayload {
  return {
    page: mockPageRows.find((item) => item.route === route) ?? mockPageRows[0],
    resources: mockResourceRows,
    apis: mockApiRows.slice(0, 4),
  }
}

export function usePageDetailData(route: Ref<string>) {
  const fallback = mockForRoute(route.value)
  const page = ref<PageRow>(fallback.page!)
  const resources = ref<ResourceRow[]>(fallback.resources)
  const apis = ref<ApiRow[]>(fallback.apis)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPageDetail() {
    loading.value = true
    error.value = null
    const currentRoute = route.value
    const mock = mockForRoute(currentRoute)

    try {
      const params = new URLSearchParams({
        projectId: 'demo',
        env: 'production',
        route: currentRoute,
      })
      const response = await fetch(`/api/v1/pages/detail?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Page detail request failed: ${response.status}`)
      }

      const payload = (await response.json()) as PageDetailPayload
      page.value = payload.page ?? mock.page!
      resources.value = payload.resources
      apis.value = payload.apis
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      page.value = mock.page!
      resources.value = mock.resources
      apis.value = mock.apis
    } finally {
      loading.value = false
    }
  }

  watch(route, () => {
    void fetchPageDetail()
  }, { immediate: true })

  return {
    page,
    resources,
    apis,
    loading,
    error,
    trendSeries: mockTrendSeries,
    fetchPageDetail,
  }
}
