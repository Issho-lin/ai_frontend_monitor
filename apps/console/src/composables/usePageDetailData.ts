import { type Ref, watch, ref } from 'vue'
import {
  type ApiRow,
  type PageRow,
  type ResourceRow,
} from '@/mock/data'
import { monitorSearch } from '@/composables/monitorSearch'

interface PageDetailPayload {
  page: PageRow | null
  resources: ResourceRow[]
  apis: ApiRow[]
}

export function usePageDetailData(route: Ref<string>) {
  const page = ref<PageRow | null>(null)
  const resources = ref<ResourceRow[]>([])
  const apis = ref<ApiRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPageDetail() {
    loading.value = true
    error.value = null
    const currentRoute = route.value

    try {
      const params = monitorSearch({ route: currentRoute })
      const response = await fetch(`/api/v1/pages/detail?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`Page detail request failed: ${response.status}`)
      }

      const payload = (await response.json()) as PageDetailPayload
      page.value = payload.page
      resources.value = payload.resources ?? []
      apis.value = payload.apis ?? []
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      page.value = null
      resources.value = []
      apis.value = []
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
    fetchPageDetail,
  }
}
