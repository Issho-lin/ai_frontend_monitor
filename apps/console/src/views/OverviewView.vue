<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight,
  WarningFilled,
  User,
  Promotion,
  Document,
  Connection,
  Box,
  Aim,
  MagicStick,
} from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import EChart from '@/components/EChart.vue'
import {
  agentSummary,
  coreMetrics,
  projectOverview,
  topProblems,
  trendSeries,
} from '@/mock/data'

const router = useRouter()

const statusMap = {
  healthy: { label: '健康', type: 'success' as const },
  warning: { label: '需要关注', type: 'warning' as const },
  critical: { label: '严重', type: 'danger' as const },
}

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['LCP P75 (s)', 'INP P75 (ms)', 'API P95 (ms)', 'JS Error Rate (%)'] },
  grid: { left: 40, right: 40, top: 40, bottom: 30 },
  xAxis: { type: 'category', data: trendSeries.lcp.map((p) => p[0]) },
  yAxis: [
    { type: 'value', name: 'LCP / Error', axisLabel: { color: '#6b7280' } },
    { type: 'value', name: 'ms', axisLabel: { color: '#6b7280' } },
  ],
  series: [
    {
      name: 'LCP P75 (s)',
      type: 'line',
      smooth: true,
      data: trendSeries.lcp.map((p) => p[1]),
      lineStyle: { color: '#0077ee', width: 2.5 },
      itemStyle: { color: '#0077ee' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(0, 119, 238, 0.15)' },
            { offset: 1, color: 'rgba(0, 119, 238, 0.01)' },
          ],
        },
      },
    },
    {
      name: 'INP P75 (ms)',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: trendSeries.inp.map((p) => p[1]),
      lineStyle: { color: '#f59e0b', width: 2 },
      itemStyle: { color: '#f59e0b' },
    },
    {
      name: 'API P95 (ms)',
      type: 'line',
      smooth: true,
      yAxisIndex: 1,
      data: trendSeries.api_p95.map((p) => p[1]),
      lineStyle: { color: '#10b981', width: 2 },
      itemStyle: { color: '#10b981' },
    },
    {
      name: 'JS Error Rate (%)',
      type: 'line',
      smooth: true,
      data: trendSeries.js_error.map((p) => p[1]),
      lineStyle: { color: '#ef4444', width: 2 },
      itemStyle: { color: '#ef4444' },
    },
  ],
}))

const problemIcon = (kind: string) => {
  if (kind === 'page') return Document
  if (kind === 'api') return Connection
  if (kind === 'resource') return Box
  return Aim
}

const kindLabel: Record<string, string> = {
  page: '页面',
  api: '接口',
  resource: '资源',
}
</script>

<template>
  <div class="afm-page">
    <!-- Health strip: gradient hero banner -->
    <div class="afm-card health" :data-status="projectOverview.status">
      <div class="health-bg-glow"></div>
      <div class="health-item health-item--status">
        <div class="health-dot" :class="`is-${projectOverview.status}`"></div>
        <div>
          <div class="label">项目健康度</div>
          <div class="value">{{ statusMap[projectOverview.status].label }}</div>
        </div>
      </div>
      <el-divider direction="vertical" class="health-divider" />
      <div class="health-item">
        <div class="health-icon danger"><el-icon><WarningFilled /></el-icon></div>
        <div>
          <div class="label">当前活跃告警</div>
          <div class="value">{{ projectOverview.activeAlerts }} <span class="unit">条</span></div>
        </div>
      </div>
      <el-divider direction="vertical" class="health-divider" />
      <div class="health-item">
        <div class="health-icon warning"><el-icon><User /></el-icon></div>
        <div>
          <div class="label">受影响用户</div>
          <div class="value">{{ projectOverview.affectedUsers.toLocaleString() }}</div>
        </div>
      </div>
      <el-divider direction="vertical" class="health-divider" />
      <div class="health-item">
        <div class="health-icon info"><el-icon><Promotion /></el-icon></div>
        <div>
          <div class="label">最近一次发布</div>
          <div class="value">
            {{ projectOverview.latestRelease }}
            <span class="afm-muted"> · {{ projectOverview.latestReleaseAt }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Core metrics -->
    <div class="afm-metric-grid section">
      <MetricCard
        v-for="m in coreMetrics"
        :key="m.key"
        :label="m.label"
        :value="m.value"
        :delta="m.delta"
        :delta-dir="m.deltaDir"
        :good="m.good"
      />
    </div>

    <!-- Trend + Agent summary -->
    <div class="grid-2 section">
      <div class="afm-card">
        <div class="afm-section-title">
          核心指标趋势
          <span class="afm-hint">最近 24 小时 · 按项目筛选</span>
        </div>
        <EChart :option="trendOption" height="320px" />
      </div>
      <div class="afm-card agent-card">
        <div class="afm-section-title">
          <el-icon class="section-icon"><MagicStick /></el-icon>
          Agent 摘要
          <span class="afm-hint">更新于 {{ agentSummary.updatedAt }}</span>
        </div>
        <div class="agent-headline">{{ agentSummary.headline }}</div>
        <div class="afm-muted agent-detail">{{ agentSummary.detail }}</div>
        <el-tag class="agent-conf" type="success" effect="light">高置信</el-tag>
        <div class="agent-action">
          <el-button type="primary" plain @click="router.push({ name: 'alerts' })">
            查看告警
            <el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
          <el-button plain @click="router.push({ name: 'pages' })">分析页面</el-button>
        </div>
      </div>
    </div>

    <!-- Top problems -->
    <div class="afm-card section">
      <div class="afm-section-title">
        TOP 问题
        <span class="afm-hint">按影响面排序</span>
      </div>
      <el-table :data="topProblems" size="default" stripe>
        <el-table-column label="#" prop="rank" width="60" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <span class="kind-cell">
              <el-icon class="kind-icon"><component :is="problemIcon(row.kind)" /></el-icon>
              <span class="afm-muted">{{ kindLabel[row.kind] }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="对象" prop="label" min-width="220">
          <template #default="{ row }">
            <router-link
              v-if="row.kind === 'page'"
              class="afm-link"
              :to="`/pages/${encodeURIComponent(row.label)}`"
              >{{ row.label }}</router-link
            >
            <span v-else>{{ row.label }}</span>
          </template>
        </el-table-column>
        <el-table-column label="指标" prop="metric" width="120" />
        <el-table-column label="当前值" prop="value" width="140" />
      </el-table>
    </div>
  </div>
</template>

<style scoped>
/* ── Health strip ── */
.health {
  display: flex;
  align-items: stretch;
  gap: 20px;
  padding: 18px 24px;
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f5faff 60%, #f0f7ff 100%);
  border: 1px solid var(--afm-border);
}

/* Ambient glow behind health status */
.health-bg-glow {
  position: absolute;
  top: -40px;
  left: -20px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%);
  pointer-events: none;
  transition: background 0.4s ease;
}

.health[data-status='healthy'] .health-bg-glow {
  background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, transparent 70%);
}

.health[data-status='critical'] .health-bg-glow {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.1) 0%, transparent 70%);
}

.health::before {
  content: '';
  position: absolute;
  inset: 0 0 0 auto;
  width: 3px;
  background: linear-gradient(180deg, var(--afm-warn), #fbbf24);
  border-radius: 0 2px 2px 0;
}
.health[data-status='healthy']::before {
  background: linear-gradient(180deg, var(--afm-success), #34d399);
}
.health[data-status='critical']::before {
  background: linear-gradient(180deg, var(--afm-danger), #f87171);
}

.health-item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  position: relative;
  z-index: 1;
}
.health-item .label {
  font-size: 12px;
  color: var(--afm-text-muted);
  letter-spacing: 0.02em;
  font-weight: 500;
}
.health-item .value {
  font-size: 20px;
  font-weight: 700;
  color: var(--afm-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.health-item .value .unit {
  font-size: 13px;
  font-weight: 500;
  color: var(--afm-text-muted);
  margin-left: 2px;
}
.health-divider {
  height: auto !important;
  align-self: stretch;
  margin: 0 2px !important;
  border-color: var(--afm-border);
}
.health-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--afm-warn);
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.12), 0 0 12px rgba(245, 158, 11, 0.2);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.health-dot.is-healthy {
  background: var(--afm-success);
  box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.12), 0 0 12px rgba(16, 185, 129, 0.2);
}
.health-dot.is-critical {
  background: var(--afm-danger);
  box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.12), 0 0 12px rgba(239, 68, 68, 0.2);
}
.health-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--afm-text-secondary);
  font-size: 18px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}
.health-icon.danger {
  background: var(--afm-danger-soft);
  color: var(--afm-danger);
}
.health-icon.warning {
  background: var(--afm-warn-soft);
  color: var(--afm-warn);
}
.health-icon.info {
  background: var(--afm-accent-soft);
  color: var(--afm-accent);
}
.section {
  margin-top: 20px;
}
.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 20px;
}
@media (max-width: 1180px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
.agent-card {
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #fafcff 0%, #ffffff 100%);
  border: 1px solid var(--afm-border);
}
.agent-headline {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--afm-text);
  letter-spacing: -0.005em;
}
.agent-detail {
  margin-top: 10px;
  line-height: 1.7;
  font-size: 13px;
}
.agent-conf {
  margin-top: 14px;
  align-self: flex-start;
  border-radius: 6px;
}
.agent-action {
  margin-top: auto;
  padding-top: 18px;
  display: flex;
  gap: 10px;
}
.afm-link {
  color: var(--afm-accent);
  font-weight: 500;
}
.afm-link:hover {
  text-decoration: underline;
}
.kind-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.kind-icon {
  color: var(--afm-accent);
  font-size: 14px;
}
.section-icon {
  color: var(--afm-accent);
  font-size: 14px;
}
</style>
