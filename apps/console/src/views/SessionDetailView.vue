<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useSessionDetailData } from '@/composables/useSessionDetailData'
import type { SessionSummary } from '@/composables/useSessionsData'
import { peekRememberedSession } from '@/composables/sessionNav'
import { useWindowLabel } from '@/composables/useWindowLabel'

const windowLabel = useWindowLabel()
const route = useRoute()
const router = useRouter()

const sessionId = computed(() => String(route.params.id ?? ''))
const { steps, loading, error } = useSessionDetailData(sessionId)

const statusType = {
  正常: 'success',
  缓慢: 'warning',
  异常: 'danger',
} as const

const session = ref<SessionSummary | null>(null)

watch(sessionId, (id) => {
  session.value = peekRememberedSession(id)
}, { immediate: true })

const headerHint = computed(() => {
  const s = session.value
  if (s) return `${s.route} · ${s.duration} · ${s.eventCount} 个事件`
  return `会话 ${sessionId.value}`
})
</script>

<template>
  <div class="afm-page">
    <div class="header">
      <el-button link :icon="ArrowLeft" @click="router.push({ name: 'sessions' })">返回会话列表</el-button>
      <div class="title-block">
        <div class="title-row">
          <h2>{{ session?.route || '这次访问' }}</h2>
          <el-tag
            v-if="session"
            size="small"
            :type="statusType[session.status as keyof typeof statusType]"
          >
            {{ session.status }}
          </el-tag>
        </div>
        <p class="afm-muted meta">{{ headerHint }}</p>
        <p v-if="session" class="afm-muted meta">
          {{ session.startedAt }} · {{ session.user }} · {{ session.device }}
          <template v-if="session.region"> · {{ session.region }}</template>
          <template v-if="session.network"> · {{ session.network }}</template>
          <template v-if="session.release"> · {{ session.release }}</template>
        </p>
        <p v-else class="afm-muted meta">{{ windowLabel }} · 直接打开的会话详情（列表摘要不可用）</p>
      </div>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        这次访问
        <span class="afm-hint">访问时间线</span>
      </div>
      <p v-if="error" class="fallback">时间线暂不可用。</p>
      <p v-else-if="loading" class="afm-muted empty">正在读取时间线…</p>
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
.header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.title-block { width: 100%; }
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.title-row h2 {
  margin: 0;
  font-size: 18px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: var(--afm-accent);
}
.meta { margin: 4px 0 0; font-size: 13px; }
.section { margin-top: 16px; }
.empty { margin: 8px 0 0; }
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
</style>
