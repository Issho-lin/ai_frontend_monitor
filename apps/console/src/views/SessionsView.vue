<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionsData } from '@/composables/useSessionsData'
import { useWindowLabel } from '@/composables/useWindowLabel'
import MetricHead from '@/components/MetricHead.vue'

const windowLabel = useWindowLabel()
const route = useRoute()
const router = useRouter()
const { rows, steps, error, detailError, fetchDetail } = useSessionsData()
const selectedId = computed(() => String(route.query.id ?? ''))
const selected = computed(() => rows.value.find((item) => item.id === selectedId.value))

const statusType = {
  正常: 'success',
  缓慢: 'warning',
  异常: 'danger',
} as const

function openSession(id: string) {
  void router.replace({ name: 'sessions', query: { id } })
}

watch(selectedId, (id) => {
  void fetchDetail(id)
}, { immediate: true })
</script>

<template>
  <div class="afm-page">
    <div class="lead">
      <h2>用户会话</h2>
      <p class="afm-muted">{{ windowLabel }}的一次访问。点开后看打开了哪个页面、体验指标、接口和错误。这里没有会话回放。</p>
    </div>
    <p v-if="error" class="fallback">接口暂不可用。</p>

    <div class="afm-card section">
      <div class="afm-section-title">会话列表<span class="afm-hint">{{ rows.length }} 条</span></div>
      <el-table
        v-if="rows.length"
        :data="rows"
        size="default"
        highlight-current-row
        @row-click="(row: { id: string }) => openSession(row.id)"
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

    <div v-if="selectedId" class="afm-card section">
      <div class="afm-section-title">
        这次访问
        <span class="afm-hint">
          <template v-if="selected">{{ selected.route }} · {{ selected.duration }} · {{ selected.eventCount }} 个事件</template>
          <template v-else>会话 {{ selectedId }} · 当前列表之外的直接访问</template>
        </span>
      </div>
      <p v-if="detailError" class="fallback">时间线暂不可用。</p>
      <ol v-else-if="steps.length" class="timeline">
        <li v-for="step in steps" :key="step.at + step.title + step.detail" :class="{ bad: step.bad }">
          <strong>{{ step.at }} {{ step.title }}</strong>
          <span>{{ step.detail }}</span>
        </li>
      </ol>
      <p v-else class="afm-muted empty">这次访问没有可展示的页面、指标或错误。</p>
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
.timeline { margin: 0; padding: 0; list-style: none; }
.timeline li {
  display: grid;
  gap: 2px;
  padding: 10px 0;
  border-top: 1px solid var(--afm-border);
}
.timeline strong { font-size: 13px; }
.timeline span { color: var(--afm-text-muted); font-size: 12px; }
.timeline li.bad strong { color: var(--afm-danger); }
:deep(.el-table__row) { cursor: pointer; }
</style>
