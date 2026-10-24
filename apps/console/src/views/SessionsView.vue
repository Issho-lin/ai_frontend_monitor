<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

type StatusFilter = 'problem' | 'all' | '异常' | '缓慢' | '正常'

const statusFilter = ref<StatusFilter>('problem')

const statusRank: Record<SessionSummary['status'], number> = {
  异常: 0,
  缓慢: 1,
  正常: 2,
}

const filteredRows = computed(() => {
  const list = rows.value.filter((row) => {
    if (statusFilter.value === 'all') return true
    if (statusFilter.value === 'problem') return row.status === '异常' || row.status === '缓慢'
    return row.status === statusFilter.value
  })
  return list.slice().sort((a, b) => {
    const byStatus = statusRank[a.status] - statusRank[b.status]
    if (byStatus !== 0) return byStatus
    return b.startedAt.localeCompare(a.startedAt)
  })
})

/** 筛「异常/缓慢」时空列表时，被隐藏的正常会话数（源数据为空则不展示该提示） */
const hiddenNormalCount = computed(() =>
  rows.value.filter((row) => row.status === '正常').length,
)

const showProblemEmptyHint = computed(
  () =>
    statusFilter.value === 'problem'
    && filteredRows.value.length === 0
    && rows.value.length > 0
    && hiddenNormalCount.value > 0,
)

function showAllSessions() {
  statusFilter.value = 'all'
}

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
      <p class="afm-muted">同一次连续访问的状态一览。默认只看「异常/缓慢」，有异常或缓慢再点进去看时间线；全站健康度请看 Overview / Pages。</p>
    </div>
    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="toolbar">
        <div class="afm-section-title">
          会话列表
          <span class="afm-hint">{{ filteredRows.length }} / {{ rows.length }} 条 · 点击行进入详情</span>
        </div>
        <el-radio-group v-model="statusFilter" size="small">
          <el-radio-button value="problem">异常/缓慢</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="异常">异常</el-radio-button>
          <el-radio-button value="缓慢">缓慢</el-radio-button>
          <el-radio-button value="正常">正常</el-radio-button>
        </el-radio-group>
      </div>
      <el-table
        v-if="filteredRows.length"
        :data="filteredRows"
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
      <div v-else class="empty">
        <template v-if="showProblemEmptyHint">
          <p class="afm-muted">当前没有异常/缓慢，已隐藏 {{ hiddenNormalCount }} 条正常</p>
          <button type="button" class="empty-action" @click="showAllSessions">查看全部</button>
        </template>
        <p v-else class="afm-muted">
          {{ rows.length ? '当前筛选下没有会话。' : `${windowLabel}还没有会话。` }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lead h2 { margin: 0; font-size: 18px; }
.lead p { margin: 4px 0 0; }
.section { margin-top: 16px; }
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.toolbar .afm-section-title { margin: 0; }
.empty { margin: 8px 0 0; }
.empty p { margin: 0; }
.empty-action {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--el-color-primary);
  font: inherit;
  cursor: pointer;
}
.empty-action:hover { text-decoration: underline; }
.sub { font-size: 12px; margin-top: 2px; }
.fallback { margin: 12px 0 0; color: var(--afm-warn); font-size: 13px; }
:deep(.el-table__row) { cursor: pointer; }
</style>
