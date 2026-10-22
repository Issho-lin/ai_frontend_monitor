<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { apiBucketTip } from '@/utils/metricTips'
import { useApiDetailData } from '@/composables/useApiDetailData'
import { useWindowLabel } from '@/composables/useWindowLabel'

const windowLabel = useWindowLabel()
const route = useRoute()
const router = useRouter()
const api = computed(() => String(route.query.api ?? ''))
const { summary, statuses, pages, trend, error } = useApiDetailData(api)

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 56, right: 16, top: 24, bottom: 28 },
  xAxis: { type: 'category', data: trend.value.map((point) => point.hour) },
  yAxis: { type: 'value', name: 'P95 ms' },
  series: [
    {
      name: 'P95',
      type: 'line',
      smooth: true,
      data: trend.value.map((point) => point.p95),
      itemStyle: { color: '#0077ee' },
    },
  ],
}))

function text(value: number | undefined, suffix = '') {
  return value == null ? '—' : `${value}${suffix}`
}
</script>

<template>
  <div class="afm-page">
    <div class="header">
      <el-button link :icon="ArrowLeft" @click="router.push({ name: 'apis' })">返回请求分析</el-button>
      <h2 class="mono">{{ api || '未指定接口' }}</h2>
      <p class="afm-muted">{{ windowLabel }}。P50 是耗时正中间的请求，P95 是第 95% 位，95% 的请求不慢于它。点进页面可以看到这次接口出现在哪条路由上。</p>
    </div>

    <p v-if="error" class="fallback">接口暂不可用。</p>
    <p v-else-if="api && !summary" class="afm-muted">{{ windowLabel }}没有这个接口的样本。</p>

    <template v-if="summary">
      <div class="kpis">
        <div class="afm-card kpi"><span>请求数<MetricTip tip="requests" /></span><strong>{{ summary.requests ?? '—' }}</strong></div>
        <div class="afm-card kpi"><span>P50<MetricTip tip="api_p50" /></span><strong>{{ text(summary.p50, 'ms') }}</strong></div>
        <div class="afm-card kpi"><span>P95<MetricTip tip="api_p95" /></span><strong>{{ text(summary.p95, 'ms') }}</strong></div>
        <div class="afm-card kpi"><span>错误率<MetricTip tip="error_rate" /></span><strong>{{ text(summary.errorRate, '%') }}</strong></div>
        <div class="afm-card kpi"><span>超时率<MetricTip tip="timeout_rate" /></span><strong>{{ text(summary.timeoutRate, '%') }}</strong></div>
        <div class="afm-card kpi"><span>方法</span><strong>{{ summary.method }}</strong></div>
      </div>

      <div class="grid-2 section">
        <div class="afm-card">
          <div class="afm-section-title">每小时 P95</div>
          <EChart v-if="trend.length" :option="trendOption" height="240px" />
          <p v-else class="afm-muted">还没有可以画成趋势的样本。</p>
        </div>
        <div class="afm-card">
          <div class="afm-section-title">状态分布</div>
          <el-table :data="statuses" size="default">
            <el-table-column label="结果" min-width="140">
              <template #default="{ row }">
                <span>{{ row.bucket }}<MetricTip v-if="apiBucketTip(row.bucket)" :tip="apiBucketTip(row.bucket)" /></span>
              </template>
            </el-table-column>
            <el-table-column prop="requests" width="120">
              <template #header><MetricHead label="请求数" tip="requests" /></template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="afm-card section">
        <div class="afm-section-title">出现在哪些页面</div>
        <el-table :data="pages" size="default">
          <el-table-column label="页面" min-width="220">
            <template #default="{ row }">
              <router-link class="afm-link" :to="`/pages/${encodeURIComponent(row.route)}`">{{ row.route }}</router-link>
            </template>
          </el-table-column>
          <el-table-column prop="requests" width="120">
            <template #header><MetricHead label="请求数" tip="requests" /></template>
          </el-table-column>
        </el-table>
        <p v-if="!pages.length" class="afm-muted">这些请求没有带上页面路由。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.header h2 { margin: 8px 0 4px; font-size: 20px; }
.kpis {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  margin-top: 16px;
}
.kpi span { display: block; color: var(--afm-text-muted); font-size: 12px; }
.kpi strong { display: block; margin-top: 4px; font-size: 20px; }
.section { margin-top: 16px; }
.grid-2 { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; }
.fallback { color: var(--afm-warn); }
@media (max-width: 1100px) {
  .kpis, .grid-2 { grid-template-columns: 1fr 1fr; }
}
</style>
