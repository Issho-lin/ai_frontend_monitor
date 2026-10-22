<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useErrorsData } from '@/composables/useErrorsData'
import { errorActivity } from '@/utils/errorActivity'
import { useWindowLabel } from '@/composables/useWindowLabel'
import MetricHead from '@/components/MetricHead.vue'
import MetricTip from '@/components/MetricTip.vue'
import { metricTip } from '@/utils/metricTips'
import { storeToRefs } from 'pinia'
import { useFiltersStore } from '@/stores/filters'

const router = useRouter()
const windowLabel = useWindowLabel()
const { timeRange } = storeToRefs(useFiltersStore())
const keyword = ref('')
const typeFilter = ref<'all' | 'js' | 'promise' | 'resource'>('all')
const { rows, loading, error } = useErrorsData()

const filtered = computed(() =>
  rows.value
    .filter(
      (row) =>
        row.message.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
        (typeFilter.value === 'all' || row.type === typeFilter.value),
    )
    .slice()
    .sort((a, b) => b.affectedUsers - a.affectedUsers),
)

const eventTotal = computed(() => filtered.value.reduce((sum, row) => sum + row.count, 0))
const userTotal = computed(() => filtered.value.reduce((sum, row) => sum + row.affectedUsers, 0))
const ongoing = computed(() => filtered.value.filter((row) => errorActivity(row.lastSeen).text === '仍在发生'))
const quiet = computed(() => filtered.value.filter((row) => errorActivity(row.lastSeen).text === '已停歇'))

function spark(values: number[] = []) {
  const series = values.length ? values : [0]
  const max = Math.max(...series, 1)
  return series
    .map((value, index) => {
      const x = series.length === 1 ? 43 : 1 + (index / (series.length - 1)) * 84
      const y = 23 - (value / max) * 20
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function openIssue(id: string) {
  router.push({ name: 'triage', params: { kind: 'error', id } })
}
</script>

<template>
  <div class="afm-page">
    <div class="lead">
      <div>
        <h2>{{ filtered.length }} 个异常</h2>
        <p class="afm-muted">{{ windowLabel }}，按受影响用户排序。趋势是{{ timeRange === '24h' ? '每小时' : '每天' }}的上报次数。</p>
      </div>
    </div>
    <p v-if="error" class="fallback">异常数据暂不可用。</p>

    <div class="kpis">
      <div class="afm-card kpi"><span>仍在发生<MetricTip tip="ongoing" /></span><strong>{{ ongoing.length }}</strong><small>最近 1 小时还有上报</small></div>
      <div class="afm-card kpi"><span>已停歇<MetricTip tip="quiet" /></span><strong>{{ quiet.length }}</strong><small>最近 1 小时没有上报</small></div>
      <div class="afm-card kpi"><span>错误事件<MetricTip tip="error_events" /></span><strong>{{ eventTotal.toLocaleString() }}</strong><small>各组次数相加</small></div>
      <div class="afm-card kpi"><span>影响用户<MetricTip tip="error_users_sum" /></span><strong>{{ userTotal.toLocaleString() }}</strong><small>各组相加，用户可能重复</small></div>
    </div>

    <div class="afm-card section">
      <div class="toolbar">
        <el-input v-model="keyword" :prefix-icon="Search" placeholder="筛选异常或路由" style="max-width: 320px" clearable />
        <el-radio-group v-model="typeFilter">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="js">
            <el-tooltip :content="metricTip('error_type_js')" placement="top" :show-after="200" popper-class="afm-metric-tip-pop"><span>JS</span></el-tooltip>
          </el-radio-button>
          <el-radio-button value="promise">
            <el-tooltip :content="metricTip('error_type_promise')" placement="top" :show-after="200" popper-class="afm-metric-tip-pop"><span>Promise</span></el-tooltip>
          </el-radio-button>
          <el-radio-button value="resource">
            <el-tooltip :content="metricTip('error_type_resource')" placement="top" :show-after="200" popper-class="afm-metric-tip-pop"><span>资源</span></el-tooltip>
          </el-radio-button>
        </el-radio-group>
      </div>
      <p v-if="loading" class="afm-muted empty">正在读取异常数据…</p>
      <el-table v-else :data="filtered" size="default" @row-click="(row: { id: string }) => openIssue(row.id)">
        <el-table-column width="120">
          <template #header><MetricHead label="状态" tip="error_status" /></template>
          <template #default="{ row }">
            <el-tag size="small" :type="errorActivity(row.lastSeen).type">{{ errorActivity(row.lastSeen).text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="异常" min-width="320">
          <template #default="{ row }">
            <div class="mono">{{ row.message }}</div>
            <div class="afm-muted sub">{{ row.id }} · {{ row.route }} · 最近 {{ row.lastSeen }}</div>
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
        <el-table-column label="版本" width="110">
          <template #default="{ row }">{{ row.release || '—' }}</template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="趋势" tip="error_trend" /></template>
          <template #default="{ row }">
            <svg class="spark" viewBox="0 0 86 26" aria-hidden="true"><polyline :points="spark(row.trend)" /></svg>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.lead h2 { margin: 0; font-size: 18px; }
.lead p { margin: 4px 0 0; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
.kpi span, .kpi small { display: block; color: var(--afm-text-muted); font-size: 12px; }
.kpi strong { display: block; margin: 4px 0; font-size: 22px; }
.section { margin-top: 16px; }
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0; }
.toolbar { display: flex; gap: 12px; align-items: center; padding-bottom: 12px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.sub { font-size: 12px; margin-top: 2px; }
.spark { width: 86px; height: 26px; }
.spark polyline { fill: none; stroke: var(--afm-danger); stroke-width: 2; }
:deep(.el-table__row) { cursor: pointer; }
@media (max-width: 900px) { .kpis { grid-template-columns: 1fr 1fr; } }
</style>
