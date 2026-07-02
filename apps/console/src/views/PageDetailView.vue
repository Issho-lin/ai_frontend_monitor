<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, DocumentCopy } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import EChart from '@/components/EChart.vue'
import DiagnosisPanel from '@/components/DiagnosisPanel.vue'
import {
  apiRows,
  getReportForRoute,
  pageRows,
  resourceRows,
  trendSeries,
} from '@/mock/data'

const route = useRoute()
const router = useRouter()

const routeParam = computed(() => decodeURIComponent(String(route.params.route || '/home')))
const pageInfo = computed(
  () => pageRows.find((p) => p.route === routeParam.value) ?? pageRows[0],
)

const report = computed(() => getReportForRoute(routeParam.value))
const reportTitle = computed(() => "页面诊断")

const webVitalsOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['LCP (s)', 'INP (ms)', 'API P95 (ms)'] },
  grid: { left: 40, right: 40, top: 40, bottom: 30 },
  xAxis: { type: 'category', data: trendSeries.lcp.map((p) => p[0]) },
  yAxis: [
    { type: 'value', name: 's', axisLabel: { color: '#6b7280' } },
    { type: 'value', name: 'ms', axisLabel: { color: '#6b7280' } },
  ],
  series: [
    {
      name: 'LCP (s)',
      type: 'line',
      smooth: true,
      data: trendSeries.lcp.map((p) => p[1]),
      lineStyle: { color: '#0077ee' },
      itemStyle: { color: '#0077ee' },
      markLine: {
        symbol: 'none',
        lineStyle: { color: '#ef4444', type: 'dashed' },
        data: [{ yAxis: 2.5, label: { formatter: 'Good ≤ 2.5s', position: 'end' } }],
      },
    },
    {
      name: 'INP (ms)',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: trendSeries.inp.map((p) => p[1]),
      lineStyle: { color: '#f59e0b' },
      itemStyle: { color: '#f59e0b' },
    },
    {
      name: 'API P95 (ms)',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: trendSeries.api_p95.map((p) => p[1]),
      lineStyle: { color: '#10b981' },
      itemStyle: { color: '#10b981' },
    },
  ],
}))

const deviceDist = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [
    {
      name: '设备分布',
      type: 'pie',
      radius: ['45%', '70%'],
      label: { formatter: '{b}\n{d}%' },
      data: [
        { value: 62, name: '移动端' },
        { value: 30, name: '桌面端' },
        { value: 8, name: '平板' },
      ],
    },
  ],
}))

const regionDist = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 20, top: 20, bottom: 30 },
  xAxis: { type: 'value', axisLabel: { color: '#6b7280' } },
  yAxis: {
    type: 'category',
    data: ['华东', '华北', '华南', '西南', '海外'],
    axisLabel: { color: '#6b7280' },
  },
  series: [
    {
      type: 'bar',
      data: [42, 28, 18, 8, 4],
      itemStyle: { color: '#0077ee' },
      label: { show: true, position: 'right', formatter: '{c}%' },
    },
  ],
}))

const resources = computed(() =>
  resourceRows.slice(0, 5).map((r) => ({
    ...r,
    sizeKb: Math.round(r.size / 1024),
  })),
)

const apiPreview = apiRows.slice(0, 4)

function copyRoute() {
  navigator.clipboard.writeText(routeParam.value)
  ElMessage.success('已复制页面路由')
}
</script>

<template>
  <div class="afm-page">
    <div class="header">
      <el-button link :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <div class="page-title">
        <span class="route">{{ routeParam }}</span>
        <el-button link :icon="DocumentCopy" @click="copyRoute">复制</el-button>
      </div>
      <div class="afm-muted">PV {{ pageInfo.pv.toLocaleString() }} · 受影响用户 {{ pageInfo.affectedUsers.toLocaleString() }}</div>
    </div>

    <div class="afm-metric-grid section">
      <MetricCard label="LCP P75" :value="`${pageInfo.lcpP75}s`" delta="+70.8%" delta-dir="up" />
      <MetricCard label="INP P75" :value="`${pageInfo.inpP75}ms`" delta="+40%" delta-dir="up" />
      <MetricCard label="CLS P75" :value="`${pageInfo.clsP75}`" delta="+0.02" delta-dir="up" />
      <MetricCard label="JS Error Rate" :value="`${pageInfo.jsErrorRate}%`" delta="+0.6pp" delta-dir="up" />
      <MetricCard label="API P95" :value="`${pageInfo.apiP95}ms`" delta="+200ms" delta-dir="up" />
      <MetricCard label="达标率" :value="`${pageInfo.passRate}%`" delta="-15pp" delta-dir="up" />
    </div>

    <div class="split section">
      <div class="split-main">
        <div class="afm-card">
          <div class="afm-section-title">
            Web Vitals 与关联接口趋势
            <span class="afm-hint">观察窗口 24 小时</span>
          </div>
          <EChart :option="webVitalsOption" height="320px" />
        </div>

        <div class="grid-2 section">
          <div class="afm-card">
            <div class="afm-section-title">设备分布</div>
            <EChart :option="deviceDist" height="240px" />
          </div>
          <div class="afm-card">
            <div class="afm-section-title">地区分布</div>
            <EChart :option="regionDist" height="240px" />
          </div>
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">
            首屏资源瀑布
            <span class="afm-hint">按加载耗时排序</span>
          </div>
          <el-table :data="resources" size="default">
            <el-table-column label="资源" prop="url" min-width="260" />
            <el-table-column label="类型" prop="type" width="80" />
            <el-table-column label="体积 (KB)" prop="sizeKb" width="120" />
            <el-table-column label="加载耗时 (ms)" prop="duration" width="140" />
            <el-table-column label="缓存命中" width="120">
              <template #default="{ row }">{{ row.cacheHitRate }}%</template>
            </el-table-column>
            <el-table-column label="失败率" width="100">
              <template #default="{ row }">{{ row.failRate }}%</template>
            </el-table-column>
          </el-table>
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">
            关联接口
            <span class="afm-hint">页面维度前 4</span>
          </div>
          <el-table :data="apiPreview" size="default">
            <el-table-column label="接口" prop="api" min-width="200" />
            <el-table-column label="Method" prop="method" width="90" />
            <el-table-column label="P50 (ms)" prop="p50" width="110" />
            <el-table-column label="P95 (ms)" prop="p95" width="110" />
            <el-table-column label="错误率" width="110">
              <template #default="{ row }">{{ row.errorRate }}%</template>
            </el-table-column>
            <el-table-column label="超时率" width="110">
              <template #default="{ row }">{{ row.timeoutRate }}%</template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="split-side">
        <DiagnosisPanel :report="report" :title="reportTitle" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  font-weight: 600;
}
.page-title .route {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--afm-accent);
}
.section {
  margin-top: 20px;
}
.split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
}
@media (max-width: 1280px) {
  .split {
    grid-template-columns: 1fr;
  }
}
.split-main {
  min-width: 0;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 800px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
