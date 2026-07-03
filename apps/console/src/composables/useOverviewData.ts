import { computed, onMounted, ref } from 'vue'
import type { OverviewPayload } from '@ai-frontend-monitor/schema'
import {
  agentSummary,
  coreMetrics as mockCoreMetrics,
  projectOverview as mockProjectOverview,
  topProblems as mockTopProblems,
  trendSeries as mockTrendSeries,
} from '@/mock/data'

const EMPTY_PAYLOAD: OverviewPayload = {
  health: mockProjectOverview,
  coreMetrics: mockCoreMetrics.map((item) => ({
    ...item,
    summary: {
      avg: 0,
      p50: 0,
      p75: 0,
      p95: 0,
      count: 0,
    },
  })),
  trendSeries: {
    lcp: { points: mockTrendSeries.lcp.map(([timestamp, value]) => ({ timestamp, value })) },
    inp: { points: mockTrendSeries.inp.map(([timestamp, value]) => ({ timestamp, value })) },
    apiP95: { points: mockTrendSeries.api_p95.map(([timestamp, value]) => ({ timestamp, value })) },
    jsError: { points: mockTrendSeries.js_error.map(([timestamp, value]) => ({ timestamp, value })) },
  },
  topProblems: mockTopProblems.map((item) => ({
    rank: item.rank,
    kind: item.kind as 'page' | 'api' | 'resource',
    label: item.label,
    metric: item.metric,
    value: item.value,
  })),
}

export function useOverviewData() {
  const payload = ref<OverviewPayload>(EMPTY_PAYLOAD)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOverview() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch('/api/v1/overview?projectId=demo&env=production')
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
  const topProblems = computed(() => payload.value.topProblems)
  const trendSeries = computed(() => ({
    lcp: payload.value.trendSeries.lcp.points.map((point) => [point.timestamp, point.value] as [string, number]),
    inp: payload.value.trendSeries.inp.points.map((point) => [point.timestamp, point.value] as [string, number]),
    api_p95: payload.value.trendSeries.apiP95.points.map((point) => [point.timestamp, point.value] as [string, number]),
    js_error: payload.value.trendSeries.jsError.points.map((point) => [point.timestamp, point.value] as [string, number]),
  }))

  return {
    agentSummary,
    coreMetrics,
    error,
    loading,
    projectOverview,
    topProblems,
    trendSeries,
    fetchOverview,
  }
}
