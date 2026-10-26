<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ArrowLeft, CaretTop, CaretBottom, Right } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { alertMetricTip } from '@/utils/metricTips'
import { useReleaseDetailData } from '@/composables/useReleaseDetailData'
import { useFiltersStore } from '@/stores/filters'

const route = useRoute()
const router = useRouter()

const version = computed(() => String(route.params.version || ''))
const { env } = storeToRefs(useFiltersStore())
const { release: releaseInfo, diff } = useReleaseDetailData(version, env)

const comparable = computed(() =>
  (diff.value?.metrics ?? []).filter(
    (item): item is typeof item & { before: number; after: number } =>
      item.before != null && item.after != null && item.before !== 0,
  ),
)

const metricChartOption = computed(() => {
  const rows = comparable.value
  if (!rows.length) return {}
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['上一版本', '本版本'] },
    grid: { left: 50, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: rows.map((item) => item.metric), axisLabel: { interval: 0, rotate: 20 } },
    yAxis: { type: 'value', name: '相对上一版本 %', axisLabel: { color: '#6b7280' } },
    series: [
      {
        name: '上一版本',
        type: 'bar',
        data: rows.map(() => 100),
        itemStyle: { color: '#c7d2e5' },
      },
      {
        name: '本版本',
        type: 'bar',
        data: rows.map((item) => Math.round((item.after / item.before) * 100)),
        itemStyle: {
          color: (p: { dataIndex: number }) => (rows[p.dataIndex].bad ? '#ef4444' : '#10b981'),
        },
      },
    ],
  }
})

function metricText(value: number | null, unit: string) {
  return value == null ? '—' : `${value}${unit}`
}

function changeText(value: number | null) {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value}%`
}

function fmtSize(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  return `${Math.round(bytes / 1000)}KB`
}

const alertObjs = computed(() => diff.value?.alerts ?? [])

const resourceKindMap: Record<string, { text: string; type: 'success' | 'danger' | 'warning' }> = {
  added: { text: '新增', type: 'success' },
  removed: { text: '删除', type: 'danger' },
  changed: { text: '变化', type: 'warning' },
}
const errorKindMap: Record<string, { text: string; type: 'danger' | 'success' | 'warning' }> = {
  new: { text: '新出现', type: 'danger' },
  gone: { text: '已消失', type: 'success' },
  changed: { text: '变化', type: 'warning' },
}

function openPage(r: string) {
  router.push(`/pages/${encodeURIComponent(r)}`)
}
function openAlert(id: string) {
  router.push({ name: 'alert-detail', params: { id } })
}
function openError(id: string) {
  router.push({ name: 'triage', params: { kind: 'error', id } })
}
function openApi(api: string) {
  router.push({ name: 'api-detail', query: { api } })
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card header">
      <div class="header-top">
        <el-button link :icon="ArrowLeft" @click="router.push({ name: 'releases' })">
          返回版本列表
        </el-button>
        <span class="version">{{ version }}</span>
        <el-tag v-if="releaseInfo" size="small" :type="releaseInfo.env === 'production' ? 'danger' : 'warning'" effect="light">
          {{ releaseInfo.env === 'production' ? '生产' : '预发' }}
        </el-tag>
        <span v-if="diff" class="afm-muted">
          {{ diff.compareTo && diff.compareTo !== '—' ? `对比 ${diff.compareTo}` : '没有上一版本' }}
        </span>
      </div>
      <div v-if="releaseInfo" class="afm-muted header-sub">
        首次上报 {{ releaseInfo.releasedAt }} · {{ releaseInfo.releasedBy }}
        <template v-if="releaseInfo.commit && releaseInfo.commit !== '—'"> · commit {{ releaseInfo.commit }}</template>
      </div>
    </div>

    <el-empty v-if="!diff" description="该版本暂无对比数据" />

    <template v-else>
      <div class="afm-card section">
        <div class="afm-section-title">
          指标对比
          <span class="afm-hint">同一环境里，上一版本的全部上报对比本版本。缺样本或没有上一版本时不计算涨跌。</span>
        </div>
        <EChart v-if="comparable.length" :option="metricChartOption" height="280px" />
        <p v-else class="afm-muted empty">还没有可以对比的上一版本样本。</p>
        <div class="metric-cards">
          <div v-for="m in diff.metrics" :key="m.metric" class="metric-mini" :class="{ bad: m.bad }">
            <div class="mm-label">{{ m.metric }}<MetricTip :tip="m.metric" /></div>
            <div class="mm-values">
              <span class="mm-before">{{ metricText(m.before, m.unit) }}</span>
              <el-icon><Right /></el-icon>
              <span class="mm-after">{{ metricText(m.after, m.unit) }}</span>
            </div>
            <div class="mm-delta" :class="{ up: (m.changePct ?? 0) > 0, down: (m.changePct ?? 0) < 0 }">
              <el-icon v-if="m.changePct != null"><component :is="m.changePct >= 0 ? CaretTop : CaretBottom" /></el-icon>
              {{ changeText(m.changePct) }}
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="afm-card">
          <div class="afm-section-title">页面差异</div>
          <el-table :data="diff.pages" size="default" @row-click="(r: { route: string }) => openPage(r.route)">
            <el-table-column label="页面" prop="route" min-width="130">
              <template #default="{ row }"><span class="link">{{ row.route }}</span></template>
            </el-table-column>
            <el-table-column label="指标" width="150">
              <template #default="{ row }"><span>{{ row.metric }}<MetricTip :tip="row.metric" /></span></template>
            </el-table-column>
            <el-table-column min-width="160">
              <template #header><MetricHead label="变化" tip="change_pct" /></template>
              <template #default="{ row }">
                {{ metricText(row.before, row.unit) }} → <b>{{ metricText(row.after, row.unit) }}</b>
                <span v-if="row.changePct != null" :class="row.changePct > 0 ? 'up-text' : 'down-text'">
                  ({{ changeText(row.changePct) }})
                </span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div class="afm-card">
          <div class="afm-section-title">资源 diff</div>
          <el-table :data="diff.resources" size="default">
            <el-table-column label="资源" prop="url" min-width="180" show-overflow-tooltip />
            <el-table-column label="类型" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="resourceKindMap[row.kind].type">
                  {{ resourceKindMap[row.kind].text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column width="160">
              <template #header><MetricHead label="体积变化" tip="resource_size" /></template>
              <template #default="{ row }">
                {{ fmtSize(row.sizeBefore) }} → <b>{{ fmtSize(row.sizeAfter) }}</b>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="grid-2 section">
        <div class="afm-card">
          <div class="afm-section-title">错误 diff</div>
          <el-table :data="diff.errors" size="default" @row-click="(row: { id: string }) => openError(row.id)">
            <el-table-column label="错误" min-width="200" show-overflow-tooltip>
              <template #default="{ row }"><span class="link">{{ row.message }}</span></template>
            </el-table-column>
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="errorKindMap[row.kind].type">
                  {{ errorKindMap[row.kind].text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column width="150">
              <template #header><MetricHead label="次数" tip="error_count" /></template>
              <template #default="{ row }">{{ row.countBefore }} → <b>{{ row.countAfter }}</b></template>
            </el-table-column>
          </el-table>
        </div>

        <div class="afm-card">
          <div class="afm-section-title">接口 diff</div>
          <el-table :data="diff.apis" size="default" @row-click="(row: { api: string }) => openApi(row.api)">
            <el-table-column label="接口" min-width="180">
              <template #default="{ row }"><span class="link">{{ row.api }}</span></template>
            </el-table-column>
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.kind === 'new' ? 'danger' : 'warning'">
                  {{ row.kind === 'new' ? '新增' : '变化' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column width="160">
              <template #header><MetricHead label="P95 变化" tip="p95_change" /></template>
              <template #default="{ row }">
                {{ row.p95Before == null ? '—' : `${row.p95Before}ms` }} → <b>{{ row.p95After == null ? '—' : `${row.p95After}ms` }}</b>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <div class="afm-card section">
        <div class="afm-section-title">
          关联告警
          <span class="afm-hint">本次发布至今触发的告警</span>
        </div>
        <el-table :data="alertObjs" size="default" @row-click="(a: { id: string }) => openAlert(a.id)">
          <el-table-column width="100">
            <template #header><MetricHead label="级别" tip="severity" /></template>
            <template #default="{ row }">
              <el-tag size="small" :type="row.severity === 'S3' ? 'info' : row.severity === 'S2' ? 'warning' : 'danger'">
                {{ row.severity }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="告警" prop="title" min-width="220">
            <template #default="{ row }"><span class="link">{{ row.title }}</span></template>
          </el-table-column>
          <el-table-column label="页面" prop="route" width="140" />
          <el-table-column label="指标" width="160">
            <template #default="{ row }"><span>{{ row.metric }}<MetricTip :tip="alertMetricTip(row.metric)" /></span></template>
          </el-table-column>
          <el-table-column width="120">
            <template #header><MetricHead label="当前值" tip="current_value" /></template>
            <template #default="{ row }">{{ row.triggerValue }}</template>
          </el-table-column>
        </el-table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.header {
  padding: 16px 20px;
}
.header-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.version {
  font-size: 18px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--afm-accent);
}
.header-sub {
  margin-top: 6px;
  font-size: 13px;
}
.empty { margin: 8px 0 0; }
.section {
  margin-top: 16px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 1024px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
.metric-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 16px;
}
.metric-mini {
  border: 1px solid var(--afm-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--afm-panel-soft);
}
.metric-mini.bad {
  border-color: rgba(229, 72, 77, 0.35);
}
.mm-label {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: var(--afm-text-muted);
}
.mm-values {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.mm-before {
  color: var(--afm-text-muted);
  font-weight: 500;
}
.mm-delta {
  font-size: 12px;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.mm-delta.up {
  color: var(--afm-danger);
}
.mm-delta.down {
  color: var(--afm-success);
}
.link {
  color: var(--afm-accent);
}
.up-text {
  color: var(--afm-danger);
  margin-left: 4px;
  font-size: 12px;
}
.down-text {
  color: var(--afm-success);
  margin-left: 4px;
  font-size: 12px;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
