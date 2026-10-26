import { computed, onMounted, ref } from 'vue'
import type { OverviewMetricCard, OverviewPayload } from '@ai-frontend-monitor/schema'
import { monitorSearch } from '@/composables/monitorSearch'

const EMPTY_SUMMARY = { avg: 0, p50: 0, p75: 0, p95: 0, count: 0 }
const EMPTY_SERIES = { points: [] }

function emptyCard(key: string, label: string, hint: string): OverviewMetricCard {
  return {
    key,
    label,
    value: '—',
    delta: '—',
    deltaDir: 'flat',
    hint,
    summary: EMPTY_SUMMARY,
  }
}

const EMPTY_PAYLOAD: OverviewPayload = {
  health: {
    status: 'healthy',
    activeAlerts: 0,
    affectedUsers: 0,
    latestRelease: '',
    latestReleaseAt: '',
  },
  coreMetrics: [
    emptyCard('error_free_session', '无错误会话率', '目标 99.5%'),
    emptyCard('visitors', '独立用户', '所选时间去重'),
    emptyCard('affected_users', '受影响用户', '当前活跃问题'),
    emptyCard('lcp_p75', 'P75 LCP', '良好线 2.5s'),
    emptyCard('api_success', 'API 成功率', '目标 99.5%'),
    emptyCard('blank_rate', '白屏率', '目标 < 0.05%'),
  ],
  trendSeries: {
    lcp: EMPTY_SERIES,
    inp: EMPTY_SERIES,
    apiP95: EMPTY_SERIES,
    jsError: EMPTY_SERIES,
  },
  topProblems: [],
  experience: [],
}

export function useOverviewData() {
  const payload = ref<OverviewPayload>(EMPTY_PAYLOAD)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOverview() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`/api/v1/overview?${monitorSearch().toString()}`)
      if (!response.ok) {
        throw new Error(`Overview request failed: ${response.status}`)
      }

      payload.value = (await response.json()) as OverviewPayload
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
      payload.value = EMPTY_PAYLOAD
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void fetchOverview()
  })

  const projectOverview = computed(() => payload.value.health)
  const coreMetrics = computed(() => payload.value.coreMetrics)
  const experience = computed(() => payload.value.experience ?? [])
  const topProblems = computed(() => payload.value.topProblems)
  const trendSeries = computed(() => ({
    lcp: payload.value.trendSeries.lcp.points.map((point) => [point.timestamp, point.value] as [string, number]),
    inp: payload.value.trendSeries.inp.points.map((point) => [point.timestamp, point.value] as [string, number]),
    api_p95: payload.value.trendSeries.apiP95.points.map((point) => [point.timestamp, point.value] as [string, number]),
    js_error: payload.value.trendSeries.jsError.points.map((point) => [point.timestamp, point.value] as [string, number]),
  }))

  return {
    coreMetrics,
    experience,
    error,
    loading,
    projectOverview,
    topProblems,
    trendSeries,
    fetchOverview,
  }
}
