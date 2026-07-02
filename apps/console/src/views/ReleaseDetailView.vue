<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CaretTop, CaretBottom, Right } from '@element-plus/icons-vue'
import EChart from '@/components/EChart.vue'
import { alertRows, getReleaseDiff, releaseRows } from '@/mock/data'

const route = useRoute()
const router = useRouter()

const version = computed(() => String(route.params.version || 'v1.18.0'))
const releaseInfo = computed(() => releaseRows.find((r) => r.version === version.value))
const diff = computed(() => getReleaseDiff(version.value))

const metricChartOption = computed(() => {
  const d = diff.value
  if (!d) return {}
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['发布前', '发布后'] },
    grid: { left: 50, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'category', data: d.metrics.map((m) => m.metric), axisLabel: { interval: 0, rotate: 20 } },
    yAxis: { type: 'value', name: '归一化 %', axisLabel: { color: '#6b7280' } },
    series: [
      {
        name: '发布前',
        type: 'bar',
        data: d.metrics.map(() => 100),
        itemStyle: { color: '#c7d2e5' },
      },
      {
        name: '发布后',
        type: 'bar',
        data: d.metrics.map((m) => Math.round((m.after / m.before) * 100)),
        itemStyle: {
          color: (p: { dataIndex: number }) => (d.metrics[p.dataIndex].bad ? '#ef4444' : '#10b981'),
        },
      },
    ],
  }
})

function fmtSize(bytes: number) {
  if (bytes === 0) return '—'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  return `${Math.round(bytes / 1000)}KB`
}

const alertObjs = computed(() =>
  (diff.value?.alerts ?? [])
    .map((id) => alertRows.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a)),
)

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
        <span v-if="diff" class="afm-muted">对比基线 {{ diff.compareTo }}</span>
      </div>
      <div v-if="releaseInfo" class="afm-muted header-sub">
        发布于 {{ releaseInfo.releasedAt }} · {{ releaseInfo.releasedBy }} · commit
        {{ releaseInfo.commit }} · 灰度 {{ releaseInfo.grayscale }}
      </div>
    </div>

    <el-empty v-if="!diff" description="该版本暂无对比数据" />

    <template v-else>
      <div class="afm-card section">
        <div class="afm-section-title">
          指标对比
          <span class="afm-hint">发布前 24h 基线 vs 发布后至今 · 归一化到发布前 = 100%</span>
        </div>
        <EChart :option="metricChartOption" height="280px" />
        <div class="metric-cards">
          <div v-for="m in diff.metrics" :key="m.metric" class="metric-mini" :class="{ bad: m.bad }">
            <div class="mm-label">{{ m.metric }}</div>
            <div class="mm-values">
              <span class="mm-before">{{ m.before }}{{ m.unit }}</span>
              <el-icon><Right /></el-icon>
              <span class="mm-after">{{ m.after }}{{ m.unit }}</span>
            </div>
            <div class="mm-delta" :class="{ up: m.changePct > 0, down: m.changePct < 0 }">
              <el-icon><component :is="m.changePct >= 0 ? CaretTop : CaretBottom" /></el-icon>
              {{ m.changePct > 0 ? '+' : '' }}{{ m.changePct }}%
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
            <el-table-column label="指标" prop="metric" width="110" />
            <el-table-column label="变化" min-width="140">
              <template #default="{ row }">
                {{ row.before }}{{ row.unit }} → <b>{{ row.after }}{{ row.unit }}</b>
                <span class="up-text">(+{{ row.changePct }}%)</span>
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
            <el-table-column label="体积变化" width="150">
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
          <el-table :data="diff.errors" size="default">
            <el-table-column label="错误" prop="message" min-width="200" show-overflow-tooltip />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="errorKindMap[row.kind].type">
                  {{ errorKindMap[row.kind].text }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="次数" width="130">
              <template #default="{ row }">{{ row.countBefore }} → <b>{{ row.countAfter }}</b></template>
            </el-table-column>
          </el-table>
        </div>

        <div class="afm-card">
          <div class="afm-section-title">接口 diff</div>
          <el-table :data="diff.apis" size="default">
            <el-table-column label="接口" prop="api" min-width="180" />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.kind === 'new' ? 'danger' : 'warning'">
                  {{ row.kind === 'new' ? '新增' : '变化' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="P95 变化" width="150">
              <template #default="{ row }">
                {{ row.p95Before }}ms → <b>{{ row.p95After }}ms</b>
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
          <el-table-column label="级别" width="80">
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
          <el-table-column label="指标" prop="metric" width="130" />
          <el-table-column label="当前值" prop="triggerValue" width="110" />
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
:deep(.el-table__row) {
  cursor: pointer;
}
</style>
