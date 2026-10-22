<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useAlertsData } from '@/composables/useAlertsData'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { alertMetricTip } from '@/utils/metricTips'

const router = useRouter()
const keyword = ref('')
const status = ref<string>('all')
const severity = ref<string>('all')
const { rows: alertRows, loading, error } = useAlertsData()

const filtered = computed(() =>
  alertRows.value.filter(
    (r) =>
      r.title.toLowerCase().includes(keyword.value.trim().toLowerCase()) &&
      (status.value === 'all' || r.status === status.value) &&
      (severity.value === 'all' || r.severity === severity.value),
  ),
)

const severityMap: Record<string, 'danger' | 'warning' | 'info'> = {
  S0: 'danger',
  S1: 'danger',
  S2: 'warning',
  S3: 'info',
}
const statusMap: Record<string, { text: string; type: 'danger' | 'warning' | 'success' | 'info' }> = {
  firing: { text: '触发中', type: 'danger' },
  acknowledged: { text: '已认领', type: 'warning' },
  resolved: { text: '已恢复', type: 'success' },
  silenced: { text: '已静默', type: 'info' },
}

function go(id: string) {
  router.push({ name: 'alert-detail', params: { id } })
}

function triage(id: string) {
  router.push({ name: 'triage', params: { kind: 'alert', id } })
}

function onRowClick(row: unknown) {
  go((row as { id: string }).id)
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card toolbar">
      <el-input
        v-model="keyword"
        :prefix-icon="Search"
        placeholder="按告警标题搜索"
        style="max-width: 320px"
        clearable
      />
      <el-select v-model="severity" placeholder="严重级别" style="width: 130px">
        <el-option label="全部级别" value="all" />
        <el-option label="S0" value="S0" />
        <el-option label="S1" value="S1" />
      </el-select>
      <el-select v-model="status" placeholder="状态" style="width: 130px">
        <el-option label="全部状态" value="all" />
        <el-option label="触发中" value="firing" />
        <el-option label="已认领" value="acknowledged" />
        <el-option label="已恢复" value="resolved" />
        <el-option label="已静默" value="silenced" />
      </el-select>
      <div class="afm-muted" style="margin-left: auto">共 {{ filtered.length }} 条告警</div>
    </div>

    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">
        告警
        <span class="afm-hint">每分钟评估最近 10 分钟：LCP P75、JS 错误率和接口错误率均按各自阈值与前 24 小时基线判断。</span>
      </div>
      <p v-if="loading" class="afm-muted empty">正在读取告警…</p>
      <el-table v-else :data="filtered" size="default" stripe @row-click="onRowClick">
        <el-table-column width="100">
          <template #header><MetricHead label="级别" tip="severity" /></template>
          <template #default="{ row }">
            <el-tag size="small" :type="severityMap[row.severity]">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="告警" min-width="260">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.title }}</div>
            <div class="afm-muted" style="font-size: 12px; margin-top: 2px">
              {{ row.id }} · 首触 {{ row.firstSeen }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="页面" prop="route" width="140" />
        <el-table-column label="指标" width="160">
          <template #default="{ row }"><span>{{ row.metric }}<MetricTip :tip="alertMetricTip(row.metric)" /></span></template>
        </el-table-column>
        <el-table-column width="180">
          <template #header><MetricHead label="当前值 / 基线" tip="trigger_vs_baseline" /></template>
          <template #default="{ row }">
            <span style="color: var(--afm-danger); font-weight: 600">{{ row.triggerValue }}</span>
            <span class="afm-muted"> / {{ row.baseline }}</span>
          </template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="影响用户" tip="alert_affected" /></template>
          <template #default="{ row }">{{ row.affectedUsers.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="版本" width="110">
          <template #default="{ row }">{{ row.release || '—' }}</template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="状态" tip="alert_status" /></template>
          <template #default="{ row }">
            <el-tag size="small" :type="statusMap[row.status].type">
              {{ statusMap[row.status].text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click.stop="go(row.id)">详情</el-button>
            <el-button size="small" link @click.stop="triage(row.id)">排障</el-button>
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
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0; }
:deep(.el-table__row) {
  cursor: pointer;
}
.rule {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 16px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--afm-border);
}
.rule p {
  margin: 4px 0 0;
  color: var(--afm-text-muted);
  font-size: 12px;
}
</style>
