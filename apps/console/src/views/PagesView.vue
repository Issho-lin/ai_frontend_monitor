<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search, TrendCharts, CaretTop, CaretBottom, Right } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import { pageRows, trendSeries } from '@/mock/data'

const router = useRouter()
const keyword = ref('')

const filtered = computed(() =>
  pageRows.filter((r) => r.route.toLowerCase().includes(keyword.value.trim().toLowerCase())),
)

const distributionOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 20, top: 30, bottom: 30 },
  xAxis: { type: 'category', data: filtered.value.map((p) => p.route) },
  yAxis: [
    { type: 'value', name: 'LCP (s)', axisLabel: { color: '#6b7280' } },
    { type: 'value', name: 'PV', axisLabel: { color: '#6b7280' } },
  ],
  series: [
    {
      name: 'LCP P75 (s)',
      type: 'bar',
      barWidth: 22,
      data: filtered.value.map((p) => p.lcpP75),
      itemStyle: { color: '#0077ee', borderRadius: [4, 4, 0, 0] },
    },
    {
      name: 'PV',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: filtered.value.map((p) => p.pv),
      lineStyle: { color: '#f59e0b', width: 2 },
      itemStyle: { color: '#f59e0b' },
    },
  ],
}))

const sparklineOption = (base: number) => ({
  grid: { left: 0, right: 0, top: 0, bottom: 0 },
  xAxis: { type: 'category', show: false, data: trendSeries.lcp.map((p) => p[0]) },
  yAxis: { type: 'value', show: false },
  series: [
    {
      type: 'line',
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#0077ee', width: 1.5 },
      areaStyle: { color: 'rgba(0, 119, 238, 0.1)' },
      data: trendSeries.lcp.map((p) => (p[1] / 2.4) * base),
    },
  ],
})

function goDetail(route: string) {
  router.push(`/pages/${encodeURIComponent(route)}`)
}

function onRowClick(row: unknown) {
  goDetail((row as { route: string }).route)
}

function lcpTagType(v: number) {
  if (v <= 2.5) return 'success'
  if (v <= 4) return 'warning'
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

    <div class="afm-card section">
      <div class="afm-section-title">
        <el-icon><TrendCharts /></el-icon>
        页面 LCP 与流量分布
        <span class="afm-hint">P75 · 当前筛选条件</span>
      </div>
      <EChart :option="distributionOption" height="240px" />
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
        <el-table-column label="PV" prop="pv" width="120">
          <template #default="{ row }">{{ row.pv.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="受影响用户" prop="affectedUsers" width="130">
          <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="LCP P75" width="120">
          <template #default="{ row }">
            <el-tag :type="lcpTagType(row.lcpP75)">{{ row.lcpP75 }}s</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="INP P75" width="110">
          <template #default="{ row }">{{ row.inpP75 }}ms</template>
        </el-table-column>
        <el-table-column label="CLS P75" width="100">
          <template #default="{ row }">{{ row.clsP75 }}</template>
        </el-table-column>
        <el-table-column label="JS Error" width="120">
          <template #default="{ row }">{{ row.jsErrorRate }}%</template>
        </el-table-column>
        <el-table-column label="API P95" width="120">
          <template #default="{ row }">{{ row.apiP95 }}ms</template>
        </el-table-column>
        <el-table-column label="达标率" width="140">
          <template #default="{ row }">
            <el-progress
              :percentage="row.passRate"
              :stroke-width="8"
              :status="row.passRate >= 85 ? 'success' : row.passRate >= 70 ? 'warning' : 'exception'"
            />
          </template>
        </el-table-column>
        <el-table-column label="趋势" width="150">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px">
              <div style="width: 90px; height: 26px">
                <EChart :option="sparklineOption(row.lcpP75)" height="26px" />
              </div>
              <el-icon v-if="row.trend === 'up'" style="color: var(--afm-danger)">
                <CaretTop />
              </el-icon>
              <el-icon v-else-if="row.trend === 'down'" style="color: var(--afm-success)">
                <CaretBottom />
              </el-icon>
            </div>
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
