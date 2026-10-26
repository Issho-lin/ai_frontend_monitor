<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, TrendCharts, Right } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { usePagesData } from '@/composables/usePagesData'

const router = useRouter()
const keyword = ref('')
const { rows, loading, error } = usePagesData()

const filtered = computed(() =>
  rows.value.filter((r) => r.route.toLowerCase().includes(keyword.value.trim().toLowerCase())),
)

const CHART_LIMIT = 8

const chartRows = computed(() =>
  filtered.value
    .filter((row): row is typeof row & { lcpP75: number } => row.lcpP75 != null)
    .sort((a, b) => b.lcpP75 - a.lcpP75)
    .slice(0, CHART_LIMIT),
)

const chartHeight = computed(() => `${Math.max(180, chartRows.value.length * 40 + 64)}px`)

const distributionOption = computed(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    formatter(params: Array<{ dataIndex: number }>) {
      const row = chartRows.value[params[0]?.dataIndex ?? 0]
      if (!row) return ''
      return `${row.route}<br/>LCP P75 ${row.lcpP75}s<br/>PV ${row.pv.toLocaleString()}`
    },
  },
  grid: { left: 8, right: 56, top: 12, bottom: 24, containLabel: true },
  xAxis: {
    type: 'value',
    name: '秒',
    max: (value: { max: number }) => Math.ceil(Math.max(value.max, 2.5) * 1.2),
    axisLabel: { color: '#6b7280' },
    splitLine: { lineStyle: { color: '#eef0f3' } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: chartRows.value.map((row) => row.route),
    axisLabel: {
      color: '#374151',
      width: 180,
      overflow: 'truncate',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    },
    axisTick: { show: false },
  },
  series: [
    {
      name: 'LCP P75',
      type: 'bar',
      barMaxWidth: 16,
      data: chartRows.value.map((row) => ({
        value: row.lcpP75,
        itemStyle: {
          color: row.lcpP75 <= 2.5 ? '#10b981' : row.lcpP75 <= 4 ? '#f59e0b' : '#ef4444',
          borderRadius: [0, 4, 4, 0],
        },
      })),
      markLine: {
        symbol: 'none',
        label: { formatter: '2.5s', color: '#d97706' },
        lineStyle: { color: '#f59e0b', type: 'dashed' },
        data: [{ xAxis: 2.5 }],
      },
    },
  ],
}))

function goDetail(route: string) {
  router.push(`/pages/${encodeURIComponent(route)}`)
}

function onRowClick(row: unknown) {
  goDetail((row as { route: string }).route)
}

const vitals = computed(() => {
  const list = rows.value
  if (!list.length) {
    return [
      { name: 'LCP', tip: 'lcp_p75', value: '—', hint: '页面均值 · 良好 ≤ 2.5s' },
      { name: 'FCP', tip: 'fcp_p75', value: '—', hint: '页面均值 · 良好 ≤ 1.8s' },
      { name: 'INP', tip: 'inp_p75', value: '—', hint: '页面均值 · 良好 ≤ 200ms' },
      { name: 'CLS', tip: 'cls_p75', value: '—', hint: '页面均值 · 良好 ≤ 0.1' },
      { name: 'TTFB', tip: 'ttfb_p75', value: '—', hint: '页面均值 · 良好 ≤ 800ms' },
      { name: '达标率', tip: 'pass_rate', value: '—', hint: '各页面达标率平均' },
    ]
  }
  const avg = (pick: (row: (typeof list)[number]) => number | null) => {
    const values = list.map(pick).filter((value): value is number => value != null)
    if (!values.length) return null
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
  }
  const text = (value: number | null, unit: string, round = false) => {
    if (value == null) return '—'
    return `${round ? Math.round(value) : value}${unit}`
  }
  return [
    { name: 'LCP', tip: 'lcp_p75', value: text(avg((row) => row.lcpP75), 's'), hint: '有样本页面的均值 · 良好 ≤ 2.5s' },
    { name: 'FCP', tip: 'fcp_p75', value: text(avg((row) => row.fcpP75), 's'), hint: '有样本页面的均值 · 良好 ≤ 1.8s' },
    { name: 'INP', tip: 'inp_p75', value: text(avg((row) => row.inpP75), 'ms', true), hint: '有样本页面的均值 · 良好 ≤ 200ms' },
    { name: 'CLS', tip: 'cls_p75', value: text(avg((row) => row.clsP75), ''), hint: '有样本页面的均值 · 良好 ≤ 0.1' },
    { name: 'TTFB', tip: 'ttfb_p75', value: text(avg((row) => row.ttfbP75), 'ms', true), hint: '有样本页面的均值 · 良好 ≤ 800ms' },
    { name: '达标率', tip: 'pass_rate', value: text(avg((row) => row.passRate), '%', true), hint: '只平均有样本的页面' },
  ]
})

function lcpTagType(v: number) {
  if (v <= 2.5) return 'success'
  if (v <= 4) return 'warning'
  return 'danger'
}

function fcpTagType(v: number) {
  if (v <= 1.8) return 'success'
  if (v <= 3) return 'warning'
  return 'danger'
}

function ttfbTagType(v: number) {
  if (v <= 800) return 'success'
  if (v <= 1800) return 'warning'
  return 'danger'
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="搜索页面路由，例如 /home 或 /product/:id"
        style="max-width: 340px"
        clearable
      />
      <div class="afm-muted">共 {{ filtered.length }} 个页面</div>
    </div>

    <div class="vitals">
      <div v-for="item in vitals" :key="item.name" class="afm-card vital">
        <span>{{ item.name }}<MetricTip :tip="item.tip" /></span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </div>
    </div>

    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">
        <el-icon><TrendCharts /></el-icon>
        各页面 LCP P75
        <span class="afm-hint">
          越长越慢，虚线是 2.5s 良好线
          <template v-if="filtered.length > chartRows.length">
            · 只显示最慢的 {{ chartRows.length }} 个，其余在下方表格
          </template>
        </span>
      </div>
      <p v-if="loading" class="afm-muted empty">正在读取页面数据…</p>
      <EChart v-else-if="filtered.length" :option="distributionOption" :height="chartHeight" />
      <p v-else class="afm-muted empty">还没有页面访问。</p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        页面性能明细
        <span class="afm-hint">点击行进入详情</span>
      </div>
      <el-table :data="filtered" size="default" stripe @row-click="onRowClick">
        <el-table-column label="页面路由" prop="route" min-width="180">
          <template #default="{ row }">
            <span class="route-link">{{ row.route }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="pv" width="120">
          <template #header><MetricHead label="PV" tip="pv" /></template>
          <template #default="{ row }">{{ row.pv.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="affectedUsers" width="150">
          <template #header><MetricHead label="受影响用户" tip="affected_users" /></template>
          <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column width="128">
          <template #header><MetricHead label="LCP P75" tip="lcp_p75" /></template>
          <template #default="{ row }">
            <span v-if="row.lcpP75 == null">—</span>
            <el-tag v-else :type="lcpTagType(row.lcpP75)">{{ row.lcpP75 }}s</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="128">
          <template #header><MetricHead label="FCP P75" tip="fcp_p75" /></template>
          <template #default="{ row }">
            <span v-if="row.fcpP75 == null">—</span>
            <el-tag v-else :type="fcpTagType(row.fcpP75)">{{ row.fcpP75 }}s</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="128">
          <template #header><MetricHead label="INP P75" tip="inp_p75" /></template>
          <template #default="{ row }">{{ row.inpP75 == null ? '—' : `${row.inpP75}ms` }}</template>
        </el-table-column>
        <el-table-column width="124">
          <template #header><MetricHead label="CLS P75" tip="cls_p75" /></template>
          <template #default="{ row }">{{ row.clsP75 == null ? '—' : row.clsP75 }}</template>
        </el-table-column>
        <el-table-column width="136">
          <template #header><MetricHead label="TTFB P75" tip="ttfb_p75" /></template>
          <template #default="{ row }">
            <span v-if="row.ttfbP75 == null">—</span>
            <el-tag v-else :type="ttfbTagType(row.ttfbP75)">{{ row.ttfbP75 }}ms</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="JS Error" tip="js_error_rate" /></template>
          <template #default="{ row }">{{ row.jsErrorRate == null ? '—' : `${row.jsErrorRate}%` }}</template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="API P95" tip="api_p95" /></template>
          <template #default="{ row }">{{ row.apiP95 == null ? '—' : `${row.apiP95}ms` }}</template>
        </el-table-column>
        <el-table-column width="150">
          <template #header><MetricHead label="达标率" tip="pass_rate" /></template>
          <template #default="{ row }">
            <span v-if="row.passRate == null">—</span>
            <el-progress
              v-else
              :percentage="row.passRate"
              :stroke-width="8"
              :status="row.passRate >= 85 ? 'success' : row.passRate >= 70 ? 'warning' : 'exception'"
            />
          </template>
        </el-table-column>
        <el-table-column label="" width="60">
          <template #default>
            <el-icon><Right /></el-icon>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
}
.section {
  margin-top: 20px;
}
.vitals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.vital span, .vital small { display: block; color: var(--afm-text-muted); font-size: 12px; }
.vital strong { display: block; margin: 6px 0 4px; font-size: 26px; }
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0 0; }
.route-link {
  color: var(--afm-accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  font-weight: 500;
}
.route-link:hover {
  text-decoration: underline;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
