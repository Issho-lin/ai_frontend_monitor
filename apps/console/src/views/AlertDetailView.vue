<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import MetricTip from '@/components/MetricTip.vue'
import { alertMetricTip } from '@/utils/metricTips'
import { useAlertDetailData } from '@/composables/useAlertDetailData'

const route = useRoute()
const router = useRouter()

const alertId = computed(() => String(route.params.id || ''))
const { alert, acting, error, loading, applyAction } = useAlertDetailData(alertId)

const ruleDescription = computed(() => {
  const metric = alert.value?.metric.toLowerCase() ?? ''
  if (metric.includes('lcp')) {
    return '最近 10 分钟按页面计算 LCP P75；至少 1 个样本。达到 4 秒记为 S0；超过 2.5 秒且高于前 24 小时基线的 1.2 倍记为 S1。'
  }
  if (metric.includes('js')) {
    return '最近 10 分钟按页面计算有错误会话占比；至少 5 个会话。达到 10% 记为 S0；超过 1% 且高于前 24 小时基线的 1.2 倍记为 S1。'
  }
  return '最近 10 分钟按接口计算失败请求占比；至少 20 次请求。达到 10% 记为 S0；超过 2% 且高于前 24 小时基线的 1.2 倍记为 S1。'
})

const severityTagType: Record<string, 'danger' | 'warning' | 'info'> = {
  S0: 'danger',
  S1: 'danger',
  S2: 'warning',
  S3: 'info',
}

async function acknowledge() {
  await applyAction('acknowledge')
  if (!error.value) ElMessage.success('已认领该告警')
}

async function silenceOneHour() {
  await applyAction('silence', 1)
  if (!error.value) ElMessage.success('已静默 1 小时')
}

async function markFalsePositive() {
  await applyAction('false_positive')
  if (!error.value) ElMessage.success('已标记为误报')
}
</script>

<template>
  <div class="afm-page">
    <p v-if="error" class="fallback">{{ String(error).includes('404') ? '没有这条告警。' : '接口暂不可用。' }}</p>
    <div v-if="loading" class="afm-card">
      <p class="afm-muted empty">正在读取告警…</p>
    </div>
    <div v-else-if="!alert" class="afm-card">
      <p class="afm-muted empty">没有这条告警。</p>
    </div>
    <template v-else>
    <div class="header afm-card">
      <div class="header-top">
        <el-button link :icon="ArrowLeft" @click="router.back()">返回告警列表</el-button>
        <span class="tag-with-tip">
          <el-tag :type="severityTagType[alert.severity]">{{ alert.severity }}</el-tag>
          <MetricTip tip="severity" />
        </span>
        <span class="tag-with-tip">
          <el-tag type="danger" v-if="alert.status === 'firing'">触发中</el-tag>
          <el-tag type="warning" v-else-if="alert.status === 'acknowledged'">已认领</el-tag>
          <el-tag type="success" v-else-if="alert.status === 'resolved'">已恢复</el-tag>
          <el-tag type="info" v-else>已静默</el-tag>
          <MetricTip tip="alert_status" />
        </span>
        <div class="afm-muted">{{ alert.id }}</div>
      </div>
      <div class="header-title">{{ alert.title }}</div>
      <div class="afm-muted header-sub">
        页面 {{ alert.route }} · 指标 {{ alert.metric }}<MetricTip :tip="alertMetricTip(alert.metric)" /> · 版本 {{ alert.release || '—' }} · 首触
        {{ alert.firstSeen }}
      </div>
      <div class="header-actions">
        <el-button type="primary" @click="router.push({ name: 'triage', params: { kind: 'alert', id: alert.id } })">
          进入排障
        </el-button>
        <el-button
          v-if="alert.status === 'firing'"
          :loading="acting"
          @click="acknowledge"
        >
          认领
        </el-button>
        <el-button
          v-if="alert.status === 'firing' || alert.status === 'acknowledged'"
          :loading="acting"
          @click="silenceOneHour"
        >
          静默 1 小时
        </el-button>
        <el-button
          v-if="alert.status !== 'resolved'"
          :loading="acting"
          @click="markFalsePositive"
        >
          标记为误报
        </el-button>
      </div>
    </div>

    <div class="afm-metric-grid section">
      <MetricCard label="当前值" tip="current_value" :value="alert.triggerValue" />
      <MetricCard label="基线" tip="baseline" :value="alert.baseline" />
      <MetricCard label="影响用户" tip="alert_affected" :value="alert.affectedUsers.toLocaleString()" />
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">触发规则</div>
      <p class="rule-description">{{ ruleDescription }}</p>
      <p class="afm-muted rule-scope">
        关联对象：{{ alert.route }} · 首次触发 {{ alert.firstSeen }} · 最近出现 {{ alert.lastSeen }}
      </p>
    </div>

    <div v-if="alert.convergence" class="section">
        <div class="afm-card">
          <div class="afm-section-title">
            告警收敛
            <span class="afm-hint">
              聚合 {{ alert.convergence.subAlerts }} 条子告警 · 来源规则
              {{ alert.convergence.sourceRules.join('、') }}
            </span>
          </div>
          <el-table :data="alert.convergence.children" size="small">
            <el-table-column label="子告警" prop="id" width="160">
              <template #default="{ row }"><code class="mono">{{ row.id }}</code></template>
            </el-table-column>
            <el-table-column label="分群" prop="segment" min-width="160" />
            <el-table-column label="首次触发" prop="firstSeen" width="180" />
          </el-table>
        </div>
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
  margin-bottom: 8px;
}
.tag-with-tip {
  display: inline-flex;
  align-items: center;
}
.header-title {
  font-size: 18px;
  font-weight: 600;
}
.header-sub {
  margin-top: 4px;
  font-size: 13px;
}
.header-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
.section {
  margin-top: 20px;
}
.rule-description {
  margin: 10px 0 0;
  line-height: 1.7;
}
.rule-scope {
  margin: 8px 0 0;
  font-size: 13px;
}
.fallback { margin: 0 0 12px; color: var(--afm-warn); font-size: 13px; }
.empty { margin: 8px 0 0; }
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
.trace-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.trace-title .el-icon {
  color: var(--afm-accent);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.comment {
  padding: 10px 0;
  border-bottom: 1px dashed var(--afm-border);
}
.comment:last-child {
  border-bottom: 0;
}
.comment-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}
.comment-header .user {
  font-weight: 600;
}
</style>
