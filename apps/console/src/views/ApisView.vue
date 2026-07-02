<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import { apiRows, trendSeries } from '@/mock/data'

const keyword = ref('')

const filtered = computed(() =>
  apiRows.filter((r) => r.api.toLowerCase().includes(keyword.value.trim().toLowerCase())),
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

const recommendTrendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 30, bottom: 30 },
  xAxis: { type: 'category', data: trendSeries.api_p95.map((p) => p[0]) },
  yAxis: { type: 'value', name: 'ms', axisLabel: { color: '#6b7280' } },
  series: [
    {
      name: 'P95',
      type: 'line',
      smooth: true,
      data: trendSeries.api_p95.map((p) => p[1]),
      lineStyle: { color: '#0077ee', width: 2 },
      itemStyle: { color: '#0077ee' },
      areaStyle: { color: 'rgba(0, 119, 238, 0.1)' },
    },
  ],
}))

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

    <div class="grid-2 section">
      <div class="afm-card">
        <div class="afm-section-title">
          接口 P50 / P95
          <span class="afm-hint">当前筛选条件</span>
        </div>
        <EChart :option="p95Option" height="260px" />
      </div>
      <div class="afm-card">
        <div class="afm-section-title">
          /api/recommend P95 趋势
          <span class="afm-hint">最近 24 小时</span>
        </div>
        <EChart :option="recommendTrendOption" height="260px" />
      </div>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        接口明细
        <span class="afm-hint">P95 · 错误率 · 超时率 · 覆盖率</span>
      </div>
      <el-table :data="filtered" size="default" stripe>
        <el-table-column label="接口" prop="api" min-width="220" />
        <el-table-column label="Method" prop="method" width="90" />
        <el-table-column label="P50 (ms)" prop="p50" width="110" />
        <el-table-column label="P95 (ms)" prop="p95" width="110" />
        <el-table-column label="错误率" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="errorTagType(row.errorRate)">{{ row.errorRate }}%</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="超时率" width="110">
          <template #default="{ row }">{{ row.timeoutRate }}%</template>
        </el-table-column>
        <el-table-column label="QPS" prop="qps" width="100" />
        <el-table-column label="Trace 覆盖率" width="160">
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
