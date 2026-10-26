<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { Search, Setting } from '@element-plus/icons-vue'
import { useAlertsData } from '@/composables/useAlertsData'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'
import { alertMetricTip } from '@/utils/metricTips'
import { useFiltersStore } from '@/stores/filters'
import {
  USE_ALERT_RULES_MOCK,
  formatRuleThreshold,
  listAlertRules,
  updateAlertRule,
  type AlertRule,
} from '@/api/alertRules'

const router = useRouter()
const filters = useFiltersStore()
const { currentProject, env } = storeToRefs(filters)

const keyword = ref('')
const status = ref<string>('all')
const severity = ref<string>('all')
const { rows: alertRows, loading, error } = useAlertsData()

const rules = ref<AlertRule[]>([])
const rulesLoading = ref(false)
const rulesError = ref<string | null>(null)

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

async function loadRules() {
  rulesLoading.value = true
  rulesError.value = null
  try {
    rules.value = await listAlertRules(currentProject.value, env.value)
  } catch (err) {
    rules.value = []
    rulesError.value = err instanceof Error ? err.message : '加载规则失败'
  } finally {
    rulesLoading.value = false
  }
}

onMounted(() => {
  void loadRules()
})

watch([currentProject, env], () => {
  void loadRules()
})

async function onToggleEnabled(rule: AlertRule, enabled: boolean) {
  const prev = rule.enabled
  rule.enabled = enabled
  try {
    const updated = await updateAlertRule(rule.id, { enabled }, currentProject.value, env.value)
    const idx = rules.value.findIndex((r) => r.id === rule.id)
    if (idx >= 0) rules.value[idx] = updated
    ElMessage.success(enabled ? `已启用「${rule.name}」` : `已停用「${rule.name}」`)
  } catch (err) {
    rule.enabled = prev
    ElMessage.error(err instanceof Error ? err.message : '更新失败')
  }
}

const drawer = ref(false)
const saving = ref(false)
const editing = reactive({
  id: '',
  name: '',
  metric: '' as AlertRule['metric'] | '',
  unit: 'ms' as AlertRule['unit'],
  poorThreshold: 0,
  severeThreshold: 0,
  webhookUrl: '',
  email: '',
  enabled: true,
})

function openEdit(rule: AlertRule) {
  Object.assign(editing, {
    id: rule.id,
    name: rule.name,
    metric: rule.metric,
    unit: rule.unit,
    poorThreshold: rule.poorThreshold,
    severeThreshold: rule.severeThreshold,
    webhookUrl: rule.webhookUrl,
    email: rule.email,
    enabled: rule.enabled,
  })
  drawer.value = true
}

async function saveEdit() {
  if (!(editing.poorThreshold > 0) || !(editing.severeThreshold > 0)) {
    ElMessage.warning('请填写有效的不良线与严重线')
    return
  }
  if (editing.severeThreshold < editing.poorThreshold) {
    ElMessage.warning('严重线应 ≥ 不良线')
    return
  }
  if (editing.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email.trim())) {
    ElMessage.warning('邮件地址格式不正确')
    return
  }
  if (editing.webhookUrl && !/^https?:\/\//i.test(editing.webhookUrl.trim())) {
    ElMessage.warning('Webhook URL 需以 http(s):// 开头')
    return
  }
  saving.value = true
  try {
    const updated = await updateAlertRule(
      editing.id,
      {
        poorThreshold: editing.poorThreshold,
        severeThreshold: editing.severeThreshold,
        enabled: editing.enabled,
        webhookUrl: editing.webhookUrl,
        email: editing.email,
      },
      currentProject.value,
      env.value,
    )
    const idx = rules.value.findIndex((r) => r.id === editing.id)
    if (idx >= 0) rules.value[idx] = updated
    drawer.value = false
    ElMessage.success(USE_ALERT_RULES_MOCK ? '规则已保存（本地 mock，待接后端）' : '规则已保存')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function thresholdHint(unit: AlertRule['unit']) {
  return unit === 'ms' ? '毫秒' : '%'
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
      <el-table v-else class="alerts-table" :data="filtered" size="default" stripe @row-click="onRowClick">
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

    <div class="afm-card section">
      <div class="afm-section-title">
        核心指标告警规则
        <span class="afm-hint">
          M3 最小集：可配 Overview 类指标（LCP / 错误率）不良线、严重线与启用开关；通知先占位 Webhook / 邮件。
          <template v-if="USE_ALERT_RULES_MOCK">当前为本地 mock，未写入评估服务。</template>
        </span>
      </div>
      <p v-if="rulesError" class="fallback">{{ rulesError }}</p>
      <p v-else-if="rulesLoading" class="afm-muted empty">正在读取规则…</p>
      <el-table v-else :data="rules" size="default" stripe>
        <el-table-column label="规则" min-width="200">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.name }}</div>
            <div class="afm-muted" style="font-size: 12px; margin-top: 2px">{{ row.id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="指标" prop="metric" width="140" />
        <el-table-column label="不良线" width="110">
          <template #default="{ row }">{{ formatRuleThreshold(row.poorThreshold, row.unit) }}</template>
        </el-table-column>
        <el-table-column label="严重线" width="110">
          <template #default="{ row }">{{ formatRuleThreshold(row.severeThreshold, row.unit) }}</template>
        </el-table-column>
        <el-table-column label="通知占位" min-width="220">
          <template #default="{ row }">
            <div v-if="row.webhookUrl || row.email" class="notify-cell">
              <span v-if="row.webhookUrl" class="afm-muted">Webhook · {{ row.webhookUrl }}</span>
              <span v-if="row.email" class="afm-muted">邮件 · {{ row.email }}</span>
            </div>
            <span v-else class="afm-muted">未配置</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              @change="(v: string | number | boolean) => onToggleEnabled(row, Boolean(v))"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button size="small" type="primary" link :icon="Setting" @click="openEdit(row)">配置</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawer" title="配置告警规则" size="420px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="规则">
          <div>{{ editing.name }}</div>
          <div class="afm-muted" style="font-size: 12px">{{ editing.id }} · {{ editing.metric }}</div>
        </el-form-item>
        <el-form-item :label="`不良线（${thresholdHint(editing.unit)}）`">
          <el-input-number v-model="editing.poorThreshold" :min="0" :step="editing.unit === 'ms' ? 100 : 0.5" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="`严重线（${thresholdHint(editing.unit)}）`">
          <el-input-number v-model="editing.severeThreshold" :min="0" :step="editing.unit === 'ms' ? 100 : 0.5" style="width: 100%" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editing.enabled" />
        </el-form-item>
        <el-form-item label="Webhook URL（占位）">
          <el-input v-model="editing.webhookUrl" placeholder="https://example.com/hooks/alert" clearable />
        </el-form-item>
        <el-form-item label="邮件地址（占位）">
          <el-input v-model="editing.email" placeholder="oncall@example.com" clearable />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="规则写入后端评估服务；Webhook 可走最小通知，邮件仍为占位。"
        />
      </el-form>
      <template #footer>
        <el-button @click="drawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-drawer>
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
.alerts-table :deep(.el-table__row) {
  cursor: pointer;
}
.notify-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
</style>
