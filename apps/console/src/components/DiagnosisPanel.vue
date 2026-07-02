<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, MagicStick, DocumentCopy } from '@element-plus/icons-vue'
import type { AgentReport, Confidence } from '@/mock/data'

const props = withDefaults(
  defineProps<{
    /** The full report to render. If null, an empty state is shown. */
    report: AgentReport | null
    /**
     * - `full`   (default) — render the whole report; used on alert / page detail
     * - `reference` — compact card that references a source alert's report; used on task detail
     */
    variant?: 'full' | 'reference'
    /** Optional heading override, e.g. "移动端 /home Agent 诊断". */
    title?: string
  }>(),
  { variant: 'full' },
)

const router = useRouter()

const confidenceMap: Record<Confidence, { text: string; type: 'success' | 'warning' | 'info' }> = {
  high: { text: '高置信', type: 'success' },
  medium: { text: '中置信', type: 'warning' },
  low: { text: '低置信', type: 'info' },
}

const heading = computed(() => props.title ?? 'Agent 诊断报告')

function openSourceAlert() {
  if (props.report) {
    router.push({ name: 'alert-detail', params: { id: props.report.alertId } })
  }
}
</script>

<template>
  <!-- Empty state — no diagnosis has been generated -->
  <div v-if="!report" class="afm-card diag-card diag-empty">
    <div class="diag-header">
      <div>
        <div class="diag-title">
          <el-icon><MagicStick /></el-icon>
          {{ heading }}
        </div>
        <div class="afm-muted diag-sub">当前对象暂无诊断报告</div>
      </div>
    </div>
    <el-empty
      description="Agent 未生成或未匹配到相关告警的报告"
      :image-size="72"
      style="padding: 8px 0 0"
    />
  </div>

  <!-- Compact reference — task detail links back to source alert -->
  <div v-else-if="variant === 'reference'" class="afm-card diag-card diag-reference">
    <div class="diag-header">
      <div>
        <div class="diag-title">
          <el-icon><MagicStick /></el-icon>
          Agent 诊断（来自告警）
        </div>
        <div class="afm-muted diag-sub">
          任务基于告警 {{ report.alertId }} 的诊断报告 · 生成于 {{ report.generatedAt }}
        </div>
      </div>
      <el-tag size="small" type="success">已引用</el-tag>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">结论</div>
      <div>{{ report.conclusion }}</div>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">根因候选</div>
      <div v-for="(c, idx) in report.candidates" :key="idx" class="diag-cand">
        <el-tag size="small" :type="confidenceMap[c.confidence].type">
          {{ confidenceMap[c.confidence].text }}
        </el-tag>
        <span>{{ idx + 1 }}. {{ c.text }}</span>
      </div>
    </div>

    <div class="diag-actions">
      <el-button size="small" plain :icon="DocumentCopy" @click="openSourceAlert">
        查看完整报告
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </div>
  </div>

  <!-- Full report -->
  <div v-else class="afm-card diag-card">
    <div class="diag-header">
      <div>
        <div class="diag-title">
          <el-icon><MagicStick /></el-icon>
          {{ heading }}
        </div>
        <div class="afm-muted diag-sub">
          来源告警 {{ report.alertId }} · 生成于 {{ report.generatedAt }} · 只读证据
        </div>
      </div>
      <el-tag size="small" type="success">
        {{ report.status === 'completed' ? '已完成' : report.status === 'running' ? '进行中' : '失败' }}
      </el-tag>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">结论</div>
      <div>{{ report.conclusion }}</div>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">影响面</div>
      <ul class="diag-list">
        <li>影响页面：{{ report.impact.pages.join('、') }}</li>
        <li>影响用户：约 {{ report.impact.users.toLocaleString() }} 用户</li>
        <li>影响会话：{{ report.impact.sessions }}</li>
        <li>影响版本：{{ report.impact.releases.join('、') }}</li>
      </ul>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">证据</div>
      <ul class="afm-evidence-list">
        <li v-for="ev in report.evidence" :key="ev.id">
          <span class="ev-id">{{ ev.id }}</span>
          <span>{{ ev.text }}</span>
        </li>
      </ul>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">根因候选</div>
      <div v-for="(c, idx) in report.candidates" :key="idx" class="diag-cand">
        <el-tag size="small" :type="confidenceMap[c.confidence].type">
          {{ confidenceMap[c.confidence].text }}
        </el-tag>
        <span>{{ idx + 1 }}. {{ c.text }}</span>
      </div>
    </div>

    <div class="diag-section">
      <div class="afm-section-title">建议动作</div>
      <ol class="diag-list">
        <li v-for="(a, idx) in report.actions" :key="idx">{{ a }}</li>
      </ol>
    </div>

    <div v-if="report.missing.length" class="diag-section">
      <div class="afm-section-title">缺失证据</div>
      <ul class="diag-list muted">
        <li v-for="(m, idx) in report.missing" :key="idx">{{ m }}</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.diag-card {
  padding: 16px;
  height: 100%;
}
.diag-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.diag-title {
  font-size: 15px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.diag-title .el-icon {
  color: var(--afm-accent);
}
.diag-sub {
  font-size: 12px;
  margin-top: 2px;
}
.diag-section {
  margin-top: 16px;
}
.diag-section:first-of-type {
  margin-top: 0;
}
.diag-list {
  padding-left: 18px;
  margin: 0;
  line-height: 1.7;
}
.diag-list.muted {
  color: var(--afm-text-muted);
}
.diag-cand {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.diag-empty {
  display: flex;
  flex-direction: column;
}
.diag-reference {
  background: linear-gradient(180deg, rgba(0, 119, 238, 0.02), #ffffff);
  border-color: rgba(0, 119, 238, 0.15);
}
.diag-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
