<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useTriageData } from '@/composables/useTriageData'
import { useFiltersStore } from '@/stores/filters'
import MetricTip from '@/components/MetricTip.vue'
import MetricHead from '@/components/MetricHead.vue'

const route = useRoute()
const router = useRouter()

const kind = computed(() => String(route.params.kind))
const id = computed(() => String(route.params.id))
const { env } = storeToRefs(useFiltersStore())
const { model, loading, error } = useTriageData(kind, id)

function formatSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}
</script>

<template>
  <div v-if="loading" class="afm-page">
    <div class="afm-card">
      <p class="afm-muted empty">正在读取排障数据…</p>
    </div>
  </div>
  <div v-else-if="model" class="afm-page">
    <p v-if="error" class="fallback">{{ error }}</p>
    <div class="afm-card head">
      <el-button link :icon="ArrowLeft" @click="router.back()">返回</el-button>
      <div class="head-main">
        <div class="tags">
          <el-tag v-if="model.introducedByRelease" size="small" type="danger">
            {{ model.release }} 引入
          </el-tag>
          <el-tag v-else size="small" type="info">{{ model.release || '未标记版本' }}</el-tag>
          <el-tag size="small" type="info">{{ model.route }}</el-tag>
          <span class="afm-muted">影响 {{ model.affectedUsers.toLocaleString() }} 人</span>
        </div>
        <h1>{{ model.title }}</h1>
        <p>{{ model.summary }}</p>
      </div>
      <div class="head-links">
        <el-button v-if="model.alertId" plain @click="router.push({ name: 'alert-detail', params: { id: model.alertId } })">
          告警事件
        </el-button>
        <el-button plain @click="router.push(`/pages/${encodeURIComponent(model.route)}`)">页面资源</el-button>
        <el-button
          v-if="model.release"
          plain
          @click="router.push({ name: 'release-detail', params: { version: model.release }, query: { env } })"
        >
          版本对比
        </el-button>
      </div>
    </div>

    <div class="grid-2 section">
      <div class="afm-card">
        <div class="afm-section-title">调用栈</div>
        <pre v-if="model.stack" class="stack">{{ model.stack.join('\n') }}</pre>
        <p v-else class="afm-muted empty">这次上报没有带上调用栈。</p>
      </div>
      <div class="afm-card">
        <div class="afm-section-title">
          用户操作
          <el-button
            v-if="model.sessionId"
            class="head-link"
            link
            type="primary"
            @click="router.push({ name: 'session-detail', params: { id: model.sessionId } })"
          >
            查看会话 {{ model.sessionId }}
          </el-button>
        </div>
        <ol v-if="model.timeline.length" class="timeline">
          <li v-for="step in model.timeline" :key="step.at + step.title" :class="{ bad: step.bad }">
            <strong>{{ step.at }} {{ step.title }}</strong>
            <span>{{ step.detail }}</span>
          </li>
        </ol>
        <p v-else class="afm-muted empty">还没有关联到具体会话。</p>
      </div>
    </div>

    <div class="afm-card section" v-if="model.metrics.length">
      <div class="afm-section-title">
        发布前后
        <span class="afm-hint">{{ model.release }} 对比上一版本</span>
      </div>
      <el-table :data="model.metrics" size="default">
        <el-table-column label="指标" min-width="180">
          <template #default="{ row }"><span>{{ row.metric }}<MetricTip :tip="row.metric" /></span></template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="发布前" tip="release_before" /></template>
          <template #default="{ row }">{{ row.before }}{{ row.unit }}</template>
        </el-table-column>
        <el-table-column width="130">
          <template #header><MetricHead label="发布后" tip="release_after" /></template>
          <template #default="{ row }">{{ row.after }}{{ row.unit }}</template>
        </el-table-column>
        <el-table-column width="120">
          <template #header><MetricHead label="变化" tip="change_pct" /></template>
          <template #default="{ row }">
            <span :class="row.bad ? 'bad' : 'ok'">{{ row.changePct > 0 ? '+' : '' }}{{ row.changePct }}%</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="afm-card section">
      <div class="afm-section-title">
        资源
        <span class="afm-hint">加载耗时和体积</span>
      </div>
      <el-table :data="model.resources" size="default">
        <el-table-column label="资源" prop="url" min-width="240" />
        <el-table-column label="类型" prop="type" width="80" />
        <el-table-column width="120">
          <template #header><MetricHead label="体积" tip="resource_size" /></template>
          <template #default="{ row }">{{ formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column width="110">
          <template #header><MetricHead label="耗时" tip="resource_duration" /></template>
          <template #default="{ row }">{{ row.duration }} ms</template>
        </el-table-column>
        <el-table-column width="110">
          <template #header><MetricHead label="失败率" tip="resource_fail" /></template>
          <template #default="{ row }">{{ row.failRate }}%</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
  <div v-else class="afm-page">
    <div class="afm-card">
      <el-empty :description="error || '没有这条排障记录'" />
    </div>
  </div>
</template>

<style scoped>
.fallback {
  margin: 0 0 12px;
  color: var(--afm-warn);
  font-size: 13px;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.head-main h1 {
  margin: 8px 0 6px;
  font-size: 20px;
  line-height: 1.35;
}
.head-main p {
  margin: 0;
  color: var(--afm-text-muted);
}
.tags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.head-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.section {
  margin-top: 16px;
}
.head-link { margin-left: auto; }
.stack {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  border-radius: 6px;
  background: #111815;
  color: #dfe9e4;
  font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 16px;
  border-left: 1px solid var(--afm-border);
}
.timeline li {
  margin: 0 0 14px;
}
.timeline strong {
  display: block;
  font-size: 13px;
}
.timeline span {
  color: var(--afm-text-muted);
  font-size: 12px;
}
.timeline li.bad strong {
  color: var(--afm-danger);
}
.empty {
  margin: 0;
}
.bad {
  color: var(--afm-danger);
  font-weight: 600;
}
.ok {
  color: var(--afm-success);
  font-weight: 600;
}
</style>
