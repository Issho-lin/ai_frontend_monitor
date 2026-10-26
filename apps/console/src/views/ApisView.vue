<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { useApisData } from '@/composables/useApisData'
import { useWindowLabel } from '@/composables/useWindowLabel'

const windowLabel = useWindowLabel()
const route = useRoute()
const router = useRouter()
const keyword = ref(String(route.query.q ?? ''))
watch(() => route.query.q, (value) => {
  keyword.value = String(value ?? '')
})
const { rows, error } = useApisData()

const filtered = computed(() =>
  rows.value.filter((r) => r.api.toLowerCase().includes(keyword.value.trim().toLowerCase())),
)

const p95Option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 20, top: 40, bottom: 30 },
  legend: { data: ['P95 (ms)', 'P50 (ms)'] },
  xAxis: { type: 'category', data: filtered.value.map((r) => r.api) },
  yAxis: { type: 'value', axisLabel: { color: '#6b7280' } },
  series: [
    {
      name: 'P95 (ms)',
      type: 'bar',
      data: filtered.value.map((r) => r.p95),
      itemStyle: { color: '#0077ee', borderRadius: [4, 4, 0, 0] },
    },
    {
      name: 'P50 (ms)',
      type: 'bar',
      data: filtered.value.map((r) => r.p50),
      itemStyle: { color: '#93c5fd', borderRadius: [4, 4, 0, 0] },
    },
  ],
}))

const traffic = computed(() => rows.value.reduce((sum, row) => sum + row.qps, 0))
const failed = computed(() =>
  rows.value.reduce((sum, row) => sum + (row.failedQps ?? row.qps * (row.errorRate / 100)), 0),
)
const timedOut = computed(() =>
  rows.value.reduce((sum, row) => sum + (row.timeoutQps ?? row.qps * (row.timeoutRate / 100)), 0),
)
const successRate = computed(() => {
  const total = rows.value.reduce((sum, row) => sum + (row.requests ?? 0), 0)
  if (!total) return '—'
  const failedCount = rows.value.reduce((sum, row) => sum + (row.requests ?? 0) * (row.errorRate / 100), 0)
  return (100 - (failedCount / total) * 100).toFixed(2)
})

const failurePie = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      name: '失败请求',
      type: 'pie',
      radius: ['48%', '70%'],
      data: [
        { name: '超时', value: Number(timedOut.value.toFixed(1)), itemStyle: { color: '#f59e0b' } },
        { name: '错误', value: Number(Math.max(failed.value - timedOut.value, 0).toFixed(1)), itemStyle: { color: '#ef4444' } },
      ],
    },
  ],
}))

function openApi(api: string) {
  void router.push({ name: 'api-detail', query: { api } })
}

function errorTagType(v: number) {
  if (v < 0.5) return 'success'
  if (v < 2) return 'warning'
  return 'danger'
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="按接口路径搜索"
        style="max-width: 320px"
        clearable
      />
      <div class="afm-muted" style="margin-left: auto">共 {{ filtered.length }} 个接口</div>
    </div>

    <div class="kpis">
      <div class="afm-card kpi"><span>请求 QPS<MetricTip tip="qps" /></span><strong>{{ traffic.toFixed(2) }}</strong><small>近 5 分钟合计</small></div>
      <div class="afm-card kpi"><span>成功率<MetricTip tip="api_success" /></span><strong>{{ successRate === '—' ? '—' : `${successRate}%` }}</strong><small>{{ windowLabel }}，按请求数加权</small></div>
      <div class="afm-card kpi"><span>失败 QPS<MetricTip tip="failed_qps" /></span><strong>{{ failed.toFixed(2) }}</strong><small>近 5 分钟</small></div>
      <div class="afm-card kpi"><span>超时 QPS<MetricTip tip="timeout_qps" /></span><strong>{{ timedOut.toFixed(2) }}</strong><small>近 5 分钟</small></div>
    </div>

    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">失败原因<span class="afm-hint">超时和其他错误</span></div>
      <EChart v-if="rows.length && (failed || timedOut)" :option="failurePie" height="260px" />
      <p v-else-if="rows.length" class="afm-muted empty">近 5 分钟没有失败请求。</p>
      <p v-else class="afm-muted empty">还没有接口请求。</p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        接口 P50 / P95
        <span class="afm-hint">按耗时从快到慢排。P50 是正中间，接近典型用户；P95 是第 95% 位，95% 的请求不慢于它</span>
      </div>
      <EChart v-if="filtered.length" :option="p95Option" height="260px" />
      <p v-else class="afm-muted empty">还没有接口请求。</p>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        接口明细
        <span class="afm-hint">P95 · 错误率 · 超时率 · 覆盖率</span>
      </div>
      <el-table :data="filtered" size="default" stripe class="api-table" @row-click="(row: { api: string }) => openApi(row.api)">
        <el-table-column label="接口" min-width="220">
          <template #default="{ row }">
            <button type="button" class="afm-link api-link" @click.stop="openApi(row.api)">{{ row.api }}</button>
          </template>
        </el-table-column>
        <el-table-column label="Method" prop="method" width="90" />
        <el-table-column prop="p50" width="124">
          <template #header><MetricHead label="P50 (ms)" tip="api_p50" /></template>
        </el-table-column>
        <el-table-column prop="p95" width="124">
          <template #header><MetricHead label="P95 (ms)" tip="api_p95" /></template>
        </el-table-column>
        <el-table-column width="120">
          <template #header><MetricHead label="错误率" tip="error_rate" /></template>
          <template #default="{ row }">
            <el-tag size="small" :type="errorTagType(row.errorRate)">{{ row.errorRate }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column width="110">
          <template #header><MetricHead label="超时率" tip="timeout_rate" /></template>
          <template #default="{ row }">{{ row.timeoutRate }}%</template>
        </el-table-column>
        <el-table-column prop="qps" width="156">
          <template #header><MetricHead label="近 5 分钟 QPS" tip="qps" /></template>
        </el-table-column>
        <el-table-column width="168">
          <template #header><MetricHead label="Trace 覆盖率" tip="trace_coverage" /></template>
          <template #default="{ row }">
            <el-progress :percentage="row.traceCoverage" :stroke-width="6" />
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
}
.section {
  margin-top: 20px;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 16px;
}
.kpi span, .kpi small { display: block; color: var(--afm-text-muted); font-size: 12px; }
.kpi strong { display: block; margin: 4px 0; font-size: 22px; }
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0 0; }
.api-table :deep(.el-table__row) { cursor: pointer; }
.api-link { background: none; border: 0; padding: 0; cursor: pointer; font: inherit; }
@media (max-width: 900px) {
  .kpis { grid-template-columns: 1fr 1fr; }
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
@media (max-width: 1024px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
