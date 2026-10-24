<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFiltersStore } from '@/stores/filters'
import MetricCard from '@/components/MetricCard.vue'
import EChart from '@/components/EChart.vue'
import { useErrorsData } from '@/composables/useErrorsData'
import { useOverviewData } from '@/composables/useOverviewData'
import { useSessionsData } from '@/composables/useSessionsData'
import { rememberSession } from '@/composables/sessionNav'
import { errorActivity } from '@/utils/errorActivity'
import { metricTip } from '@/utils/metricTips'
import { useWindowLabel } from '@/composables/useWindowLabel'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'

const router = useRouter()
const { device, timeRange } = storeToRefs(useFiltersStore())
const windowLabel = useWindowLabel()
const healthHint = computed(() =>
  `按 PV 加权，LCP ≤ ${device.value === 'mobile' ? '3.0s' : '2.5s'} / FCP ≤ 1.8s / INP ≤ 200ms / CLS ≤ 0.1 / TTFB ≤ 800ms`,
)
const {
  coreMetrics,
  experience,
  error: overviewError,
  projectOverview,
  trendSeries,
} = useOverviewData()
const { rows: errorRows, error: errorsError } = useErrorsData()
const { rows: sessions, error: sessionsError } = useSessionsData()

function openSession(item: (typeof sessions.value)[number]) {
  rememberSession(item)
  void router.push({ name: 'session-detail', params: { id: item.id } })
}

const issues = computed(() =>
  errorRows.value
    .slice()
    .sort((a, b) => {
      const fresh = Number(errorActivity(b.lastSeen).text === '仍在发生') - Number(errorActivity(a.lastSeen).text === '仍在发生')
      return fresh || b.affectedUsers - a.affectedUsers
    }),
)

const health = computed(() =>
  experience.value.map((item) => ({
    name: item.name,
    display: item.value == null ? '—' : `${item.value}%`,
    width: item.value == null ? 0 : Math.min(item.value, 100),
    note: item.note,
    warn: item.warn,
  })),
)

const trendOptions = [
  {
    key: 'lcp',
    name: 'LCP P75',
    unit: 'ms',
    goodAt: 2500,
    goodLabel: '2.5s',
    hint: '主要内容出现的时间。75% 的访问不慢于这个值。',
    tip: 'lcp_p75',
  },
  {
    key: 'inp',
    name: 'INP P75',
    unit: 'ms',
    goodAt: 200,
    goodLabel: '200ms',
    hint: '点击或输入后的响应时间。75% 的访问不慢于这个值。',
    tip: 'inp_p75',
  },
  {
    key: 'api_p95',
    name: 'API P95',
    unit: 'ms',
    goodAt: 800,
    goodLabel: '800ms',
    hint: '接口耗时的 95 分位，看较慢的请求有没有拖住页面。',
    tip: 'api_p95',
  },
  {
    key: 'js_error',
    name: 'JS 错误率',
    unit: '%',
    goodAt: 0.5,
    goodLabel: '0.5%',
    hint: '脚本错误次数除以页面访问次数。',
    tip: 'js_error_rate',
  },
] as const

const trendKey = ref<(typeof trendOptions)[number]['key']>('lcp')

const trend = computed(() => {
  const option = trendOptions.find((item) => item.key === trendKey.value) ?? trendOptions[0]
  const points = trendSeries.value[option.key]
  const latest = points.at(-1)
  const latestValue = latest?.[1]
  return {
    name: option.name,
    unit: option.unit,
    hint: option.hint,
    goodAt: option.goodAt,
    goodLabel: option.goodLabel,
    good: latestValue != null && latestValue <= option.goodAt,
    points,
    latestValue,
    latestTime: latest ? axisLabel(latest[0]) : '',
  }
})

const trendOption = computed(() => {
  const points = trend.value.points
  const max = Math.max(0, ...points.map((point) => point[1]))
  const tone = trend.value.good ? '#0077ee' : '#d97706'
  const area = trend.value.good ? 'rgba(0, 119, 238, 0.18)' : 'rgba(217, 119, 6, 0.16)'
  return {
    animationDuration: 400,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#17201d',
      borderWidth: 0,
      padding: [8, 12],
      textStyle: { color: '#f4f6f5', fontSize: 12 },
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(0, 119, 238, 0.45)', type: 'dashed' },
      },
      formatter: (params: unknown) => {
        const row = Array.isArray(params) ? params[0] : params
        if (!row || typeof row !== 'object') return ''
        const item = row as { axisValue?: string; data?: number }
        const value = typeof item.data === 'number' ? formatTrendValue(item.data, trend.value.unit) : '—'
        const state = typeof item.data === 'number' && item.data <= trend.value.goodAt ? '良好' : '待优化'
        return `${item.axisValue ?? ''}<br/>${trend.value.name}　${value} · ${state}<br/>良好线 ${trend.value.goodLabel}`
      },
    },
    grid: { left: 4, right: 12, top: 16, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((point) => axisLabel(point[0])),
      axisLine: { lineStyle: { color: '#dce3df' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#7b8782',
        fontSize: 11,
        margin: 12,
        interval: points.length > 36 ? Math.ceil(points.length / 8) - 1 : undefined,
      },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: axisCeiling(max, trend.value.goodAt),
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: '#7b8782',
        fontSize: 11,
        formatter: (value: number) => formatAxisTick(value, trend.value.unit, max),
      },
      splitLine: { lineStyle: { color: '#eef2f0' } },
    },
    series: [
      {
        name: trend.value.name,
        type: 'line',
        smooth: points.length > 2,
        showSymbol: points.length <= 2,
        symbol: 'circle',
        symbolSize: 9,
        clip: false,
        data: points.map((point) => point[1]),
        lineStyle: { color: tone, width: 2 },
        itemStyle: { color: tone, borderColor: '#ffffff', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: area },
              { offset: 1, color: 'rgba(0, 119, 238, 0)' },
            ],
          },
        },
        markLine: {
          symbol: 'none',
          silent: true,
          label: {
            formatter: `良好 ${trend.value.goodLabel}`,
            color: '#d97706',
            fontSize: 11,
            position: 'insideEndTop',
          },
          lineStyle: { color: '#d97706', type: 'dashed', width: 1 },
          data: [{ yAxis: trend.value.goodAt }],
        },
      },
    ],
  }
})

const usingFallback = computed(() => Boolean(overviewError.value))

function axisLabel(timestamp: string) {
  if (timeRange.value === '7d' || timeRange.value === '30d') return timestamp
  const match = timestamp.match(/(\d{2}:\d{2})/)
  return match?.[1] ?? timestamp
}

function formatTrendValue(value: number, unit: string) {
  if (unit === 'ms') {
    if (Math.abs(value) >= 1000) {
      const seconds = value / 1000
      return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`
    }
    return `${Math.round(value)}ms`
  }
  if (unit === '%') return `${value.toFixed(value >= 10 ? 1 : 2)}%`
  return `${value}${unit}`
}

function axisCeiling(max: number, goodAt: number) {
  const top = Math.max(max, goodAt) * 1.15
  if (top <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(top))
  return Math.ceil(top / magnitude) * magnitude
}

function formatAxisTick(value: number, unit: string, max: number) {
  if (unit === 'ms' && max >= 1000) {
    const seconds = value / 1000
    const digits = seconds > 0 && seconds < 10 && !Number.isInteger(seconds) ? 1 : 0
    return `${Number(seconds.toFixed(digits))}s`
  }
  if (unit === '%') return `${Number(value.toFixed(value >= 10 ? 0 : 1))}%`
  return `${Math.round(value)}`
}

function openIssue(id: string) {
  router.push({ name: 'triage', params: { kind: 'error', id } })
}
</script>

<template>
  <div class="afm-page">
    <p v-if="usingFallback" class="fallback">接口暂不可用。</p>
    <p v-else class="afm-muted scope">
      {{ windowLabel }} · 最新上报版本 {{ projectOverview.latestRelease || '—' }}
      <template v-if="projectOverview.latestReleaseAt"> · {{ projectOverview.latestReleaseAt }}</template>
    </p>

    <div class="afm-metric-grid">
      <MetricCard
        v-for="metric in coreMetrics"
        :key="metric.key"
        :label="metric.label"
        :value="metric.value"
        :delta="metric.delta === '--' || metric.delta === '—' ? undefined : metric.delta"
        :delta-dir="metric.deltaDir"
        :good="metric.good"
        :hint="metric.hint"
        :tip="metric.key"
      />
    </div>

    <div class="grid-2 section">
      <div class="afm-card trend-card">
        <div class="trend-head">
          <div class="trend-title">
            <div class="afm-section-title">趋势</div>
            <span class="afm-hint">{{ trend.hint }}</span>
          </div>
          <el-radio-group v-model="trendKey" class="trend-switch">
            <el-radio-button v-for="item in trendOptions" :key="item.key" :value="item.key">
              <el-tooltip :content="metricTip(item.tip)" placement="top" :show-after="200" popper-class="afm-metric-tip-pop">
                <span>{{ item.name }}</span>
              </el-tooltip>
            </el-radio-button>
          </el-radio-group>
        </div>
        <template v-if="trend.points.length">
          <div class="trend-readout">
            <strong :class="{ warn: !trend.good }">{{ formatTrendValue(trend.latestValue ?? 0, trend.unit) }}</strong>
            <em :class="trend.good ? 'is-good' : 'is-warn'">{{ trend.good ? '良好' : '待优化' }}</em>
            <span>{{ trend.name }} · {{ trend.latestTime }} · 良好线 {{ trend.goodLabel }}</span>
          </div>
          <div class="trend-plot">
            <EChart :option="trendOption" height="100%" />
          </div>
        </template>
        <p v-else class="afm-muted empty">{{ windowLabel }}还没有 {{ trend.name }} 样本。</p>
      </div>
      <div class="afm-card">
        <div class="afm-section-title">
          体验健康度
          <span class="afm-hint">{{ healthHint }}</span>
          <el-button class="head-link" link type="primary" @click="router.push({ name: 'pages' })">查看页面</el-button>
        </div>
        <div v-for="item in health" :key="item.name" class="health-row">
          <div class="health-label">
            <span class="health-name">{{ item.name }}<MetricTip :tip="item.name" /></span>
            <strong>{{ item.display }}</strong>
          </div>
          <div class="track"><i :style="{ width: `${item.width}%` }" :class="{ warn: item.warn }"></i></div>
          <em :class="{ warn: item.warn }">{{ item.note }}</em>
        </div>
        <p v-if="!health.length" class="afm-muted empty">还没有 Web Vitals 样本。</p>
      </div>
    </div>

    <div class="grid-2 section">
      <div class="afm-card">
        <div class="afm-section-title">
          高影响异常
          <span class="afm-hint">仍在发生的排在前面</span>
          <el-button class="head-link" link type="primary" @click="router.push({ name: 'errors' })">全部异常</el-button>
        </div>
        <p v-if="errorsError" class="afm-muted empty">异常列表暂不可用。</p>
        <el-table v-else-if="issues.length" :data="issues.slice(0, 4)" size="default" @row-click="(row: { id: string }) => openIssue(row.id)">
          <el-table-column width="120">
            <template #header><MetricHead label="状态" tip="error_status" /></template>
            <template #default="{ row }">
              <el-tag size="small" :type="errorActivity(row.lastSeen).type">{{ errorActivity(row.lastSeen).text }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="异常" min-width="220">
            <template #default="{ row }">
              <div class="issue-title">{{ row.message }}</div>
              <div class="afm-muted sub">{{ row.id }} · {{ row.route }}</div>
            </template>
          </el-table-column>
          <el-table-column width="110">
            <template #header><MetricHead label="用户" tip="error_users" /></template>
            <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column width="100">
            <template #header><MetricHead label="次数" tip="error_count" /></template>
            <template #default="{ row }">{{ row.count.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="版本" width="100">
            <template #default="{ row }">{{ row.release || '—' }}</template>
          </el-table-column>
        </el-table>
        <p v-if="!errorsError && !issues.length" class="afm-muted empty">{{ windowLabel }}没有异常。</p>
      </div>
      <div class="afm-card">
        <div class="afm-section-title">
          最近会话
          <el-button class="head-link" link type="primary" @click="router.push({ name: 'sessions' })">查看全部</el-button>
        </div>
        <p v-if="sessionsError" class="afm-muted empty">会话列表暂不可用。</p>
        <button
          v-for="item in sessions.slice(0, 4)"
          v-else
          :key="item.id"
          class="session"
          type="button"
          @click="openSession(item)"
        >
          <span>
            <strong>{{ item.route }}</strong>
            <small>{{ item.startedAt }} · {{ item.device }}</small>
          </span>
          <em :class="{ bad: item.status !== '正常' }">{{ item.status }}</em>
        </button>
        <p v-if="!sessionsError && !sessions.length" class="afm-muted empty">{{ windowLabel }}还没有会话。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section { margin-top: 16px; }
.trend-card {
  display: flex;
  flex-direction: column;
  min-height: 420px;
}
.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.trend-title { min-width: 0; }
.trend-title .afm-section-title { margin-bottom: 2px; }
.trend-title .afm-hint {
  display: block;
  max-width: 460px;
  line-height: 1.5;
}
.trend-switch { flex: none; }
.trend-switch :deep(.el-radio-button__inner) {
  min-height: 32px;
  padding: 0 14px;
  line-height: 30px;
  font-weight: 500;
  color: var(--afm-text-secondary);
  background: var(--afm-panel);
  border-color: var(--afm-border);
  box-shadow: none;
}
.trend-switch :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: var(--afm-radius-sm) 0 0 var(--afm-radius-sm);
}
.trend-switch :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 var(--afm-radius-sm) var(--afm-radius-sm) 0;
}
.trend-switch :deep(.el-radio-button__inner:hover) {
  color: var(--afm-accent);
}
.trend-switch :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--afm-accent);
  border-color: var(--afm-accent);
  color: #fff;
  box-shadow: none;
}
.trend-readout {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 14px;
}
.trend-readout strong {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.trend-readout strong.warn { color: var(--afm-warn); }
.trend-readout em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 999px;
}
.trend-readout em.is-good {
  color: var(--afm-success);
  background: var(--afm-success-soft);
}
.trend-readout em.is-warn {
  color: var(--afm-warn);
  background: var(--afm-warn-soft);
}
.trend-readout span {
  color: var(--afm-text-muted);
  font-size: 12px;
}
.trend-plot {
  position: relative;
  flex: 1;
  min-height: 220px;
  margin-top: 8px;
}
.trend-plot :deep(.afm-chart) {
  position: absolute;
  inset: 0;
  height: auto;
}
.trend-card .empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  margin: 0;
}
.scope { margin: 0 0 12px; }
.grid-2 { display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 16px; }
.head-link { margin-left: auto; }
.fallback {
  margin: 0 0 12px;
  color: var(--afm-warn);
  font-size: 13px;
}
.health-row { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; padding: 12px 0; border-top: 1px solid var(--afm-border); }
.health-label { display: flex; justify-content: space-between; align-items: center; grid-column: 1 / -1; }
.health-name { display: inline-flex; align-items: center; }
.track { height: 6px; background: var(--afm-panel-soft); border-radius: 3px; overflow: hidden; }
.track i { display: block; height: 100%; background: var(--afm-success); }
.track i.warn { background: var(--afm-warn); }
.health-row em { font-style: normal; font-size: 12px; color: var(--afm-success); }
.health-row em.warn { color: var(--afm-warn); }
.issue-title { font-size: 13px; }
.sub { font-size: 12px; margin-top: 2px; }
.empty { margin: 8px 0 0; }
.session {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  text-align: left;
  border: 0;
  border-top: 1px solid var(--afm-border);
  background: transparent;
  color: inherit;
  padding: 12px 2px;
  cursor: pointer;
}
.session:hover { background: var(--afm-panel-soft); }
.session strong, .session small { display: block; }
.session small { margin-top: 3px; color: var(--afm-text-muted); }
.session em { font-style: normal; font-size: 18px; font-weight: 700; }
.session em.bad { color: var(--afm-danger); }
:deep(.el-table__row) { cursor: pointer; }
@media (max-width: 1100px) { .grid-2 { grid-template-columns: 1fr; } }
@media (max-width: 720px) {
  .trend-head { flex-direction: column; }
  .trend-readout { flex-wrap: wrap; }
}
</style>
