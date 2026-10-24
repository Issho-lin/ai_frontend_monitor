<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionsData, type SessionSummary } from '@/composables/useSessionsData'
import { rememberSession } from '@/composables/sessionNav'
import { useWindowLabel } from '@/composables/useWindowLabel'
import MetricHead from '@/components/MetricHead.vue'

const windowLabel = useWindowLabel()
const route = useRoute()
const router = useRouter()
const { rows, error } = useSessionsData()

const statusType = {
  正常: 'success',
  缓慢: 'warning',
  异常: 'danger',
} as const

function openSession(row: SessionSummary) {
  rememberSession(row)
  void router.push({
    name: 'session-detail',
    params: { id: row.id },
  })
}

onMounted(() => {
  const legacyId = String(route.query.id ?? '')
  if (legacyId) {
    void router.replace({ name: 'session-detail', params: { id: legacyId } })
  }
})
</script>

<template>
  <div class="afm-page">
    <div class="lead">
      <h2>用户会话</h2>
      <p class="afm-muted">用户会话是同一次连续访问（不是录像、也不是登录账号）。列表看每次访问的状态、页面、设备与停留；点进详情看时间线（页 → 指标 → 接口/错误）。用来判断「这一趟顺不顺」；全站健康度请看 Overview / Pages。</p>
    </div>
    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">会话列表<span class="afm-hint">{{ rows.length }} 条 · 点击行进入详情</span></div>
      <el-table
        v-if="rows.length"
        :data="rows"
        size="default"
        @row-click="(row: SessionSummary) => openSession(row)"
      >
        <el-table-column width="110">
          <template #header><MetricHead label="状态" tip="session_status" /></template>
          <template #default="{ row }">
            <el-tag size="small" :type="statusType[row.status as keyof typeof statusType]">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="页面" min-width="160">
          <template #default="{ row }">
            <div>{{ row.route }}</div>
            <div class="afm-muted sub">{{ row.startedAt }} · {{ row.user }}</div>
          </template>
        </el-table-column>
        <el-table-column label="设备" min-width="180" prop="device" />
        <el-table-column label="地区" width="100" prop="region" />
        <el-table-column label="网络" width="90">
          <template #default="{ row }">{{ row.network || '—' }}</template>
        </el-table-column>
        <el-table-column label="版本" width="110">
          <template #default="{ row }">{{ row.release || '—' }}</template>
        </el-table-column>
        <el-table-column prop="duration" width="100">
          <template #header><MetricHead label="停留" tip="session_duration" /></template>
        </el-table-column>
        <el-table-column prop="eventCount" width="96">
          <template #header><MetricHead label="事件" tip="session_events" /></template>
        </el-table-column>
      </el-table>
      <p v-else class="afm-muted empty">{{ windowLabel }}还没有会话。</p>
    </div>
  </div>
</template>

<style scoped>
.lead h2 { margin: 0; font-size: 18px; }
.lead p { margin: 4px 0 0; }
.section { margin-top: 16px; }
.empty { margin: 8px 0 0; }
.sub { font-size: 12px; margin-top: 2px; }
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
:deep(.el-table__row) { cursor: pointer; }
</style>
