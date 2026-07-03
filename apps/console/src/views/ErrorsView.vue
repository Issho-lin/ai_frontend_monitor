<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import { useErrorsData } from '@/composables/useErrorsData'

const keyword = ref('')
const typeFilter = ref<'all' | 'js' | 'promise' | 'resource'>('all')
const { rows, trendSeries } = useErrorsData()

const filtered = computed(() =>
  rows.value.filter(
    (r) =>
      r.message.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
      (typeFilter.value === 'all' || r.type === typeFilter.value),
  ),
)

const errorTrendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['JS Error', 'Promise Rejection', 'Resource Error'] },
  grid: { left: 40, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category', data: trendSeries.js_error.map((p) => p[0]) },
  yAxis: { type: 'value' },
  series: [
    {
      name: 'JS Error',
      type: 'bar',
      stack: 'error',
      data: trendSeries.js_error.map((p) => Math.round(p[1] * 100)),
      itemStyle: { color: '#0077ee', borderRadius: [0, 0, 0, 0] },
    },
    {
      name: 'Promise Rejection',
      type: 'bar',
      stack: 'error',
      data: trendSeries.js_error.map((p) => Math.round(p[1] * 60)),
      itemStyle: { color: '#f59e0b', borderRadius: 0 },
    },
    {
      name: 'Resource Error',
      type: 'bar',
      stack: 'error',
      data: trendSeries.js_error.map((p) => Math.round(p[1] * 30)),
      itemStyle: { color: '#a5b4c4', borderRadius: [4, 4, 0, 0] },
    },
  ],
}))

const typeMap: Record<string, string> = { js: 'JS Error', promise: 'Promise', resource: '资源' }
const statusMap: Record<string, { label: string; type: 'danger' | 'warning' | 'success' }> = {
  unresolved: { label: '未处理', type: 'danger' },
  watching: { label: '观察中', type: 'warning' },
  resolved: { label: '已处理', type: 'success' },
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="按错误信息搜索"
        style="max-width: 320px"
        clearable
      />
      <el-radio-group v-model="typeFilter">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="js">JS</el-radio-button>
        <el-radio-button value="promise">Promise</el-radio-button>
        <el-radio-button value="resource">资源</el-radio-button>
      </el-radio-group>
      <div class="afm-muted" style="margin-left: auto">共 {{ filtered.length }} 组</div>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">错误事件趋势</div>
      <EChart :option="errorTrendOption" height="260px" />
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">错误分组</div>
      <el-table :data="filtered" size="default">
        <el-table-column label="错误信息" min-width="360">
          <template #default="{ row }">
            <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace">
              {{ row.message }}
            </div>
            <div class="afm-muted" style="font-size: 12px; margin-top: 2px">
              {{ row.id }} · 首次 {{ row.firstSeen }} · 最近 {{ row.lastSeen }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ typeMap[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="页面" prop="route" width="150" />
        <el-table-column label="版本" prop="release" width="120" />
        <el-table-column label="次数" width="100">
          <template #default="{ row }">{{ row.count.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="受影响用户" width="130">
          <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status].type">
              {{ statusMap[row.status].label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default>
            <el-button size="small" link type="primary">查看堆栈</el-button>
            <el-button size="small" link type="primary">创建任务</el-button>
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
</style>
