<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useFiltersStore } from '@/stores/filters'
import { useWindowLabel } from '@/composables/useWindowLabel'
import {
  USE_ISSUES_MOCK,
  issueKindLabel,
  issueStatusLabel,
  listIssues,
  patchIssueAction,
  type Issue,
  type IssueAction,
  type IssueKind,
  type IssueWorkflowStatus,
} from '@/api/issues'

const router = useRouter()
const filters = useFiltersStore()
const { currentProject, env } = storeToRefs(filters)
const windowLabel = useWindowLabel()

const rows = ref<Issue[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actingId = ref<string | null>(null)

const kindFilter = ref<IssueKind | 'all'>('all')
const statusFilter = ref<IssueWorkflowStatus | 'all'>('all')

const kindTagType: Record<IssueKind, 'danger' | 'warning'> = {
  abnormal: 'danger',
  slow: 'warning',
}

const statusTagType: Record<IssueWorkflowStatus, 'danger' | 'warning' | 'success'> = {
  open: 'danger',
  acked: 'warning',
  resolved: 'success',
}

const filteredCount = computed(() => rows.value.length)

async function loadIssues() {
  loading.value = true
  error.value = null
  try {
    rows.value = await listIssues({
      projectId: currentProject.value,
      env: env.value,
      kind: kindFilter.value,
      workflowStatus: statusFilter.value,
      // mock 不强制按 window 过滤，避免筛空；真 API 可带 window
      window: USE_ISSUES_MOCK ? undefined : windowLabel.value,
    })
  } catch (err) {
    rows.value = []
    error.value = err instanceof Error ? err.message : '加载问题失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadIssues()
})

watch([currentProject, env, kindFilter, statusFilter, windowLabel], () => {
  void loadIssues()
})

function actionsFor(row: Issue): { action: IssueAction; label: string; type?: 'primary' | 'success' | 'warning' }[] {
  if (row.workflowStatus === 'open') {
    return [
      { action: 'ack', label: '确认', type: 'primary' },
      { action: 'resolve', label: '处理', type: 'success' },
    ]
  }
  if (row.workflowStatus === 'acked') {
    return [
      { action: 'resolve', label: '处理', type: 'success' },
      { action: 'reopen', label: '重开', type: 'warning' },
    ]
  }
  return [{ action: 'reopen', label: '重开', type: 'warning' }]
}

async function onAction(row: Issue, action: IssueAction) {
  actingId.value = row.id
  try {
    const updated = await patchIssueAction(row.id, action, currentProject.value, env.value)
    const idx = rows.value.findIndex((r) => r.id === row.id)
    if (idx >= 0) {
      // 当前筛选项下若已不符，从列表移除
      const kindOk = kindFilter.value === 'all' || updated.kind === kindFilter.value
      const statusOk = statusFilter.value === 'all' || updated.workflowStatus === statusFilter.value
      if (kindOk && statusOk) {
        rows.value[idx] = updated
        // 保持未关闭优先排序
        rows.value = [...rows.value].sort((a, b) => {
          const sr: Record<IssueWorkflowStatus, number> = { open: 0, acked: 1, resolved: 2 }
          const kr: Record<IssueKind, number> = { abnormal: 0, slow: 1 }
          const byS = sr[a.workflowStatus] - sr[b.workflowStatus]
          if (byS !== 0) return byS
          const byK = kr[a.kind] - kr[b.kind]
          if (byK !== 0) return byK
          return b.updatedAt.localeCompare(a.updatedAt)
        })
      } else {
        rows.value.splice(idx, 1)
      }
    }
    const tip =
      action === 'ack' ? '已确认，进入跟进中' : action === 'resolve' ? '已处理' : '已重开为待处理'
    ElMessage.success(USE_ISSUES_MOCK ? `${tip}（本地 mock，待接后端）` : tip)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '操作失败')
  } finally {
    actingId.value = null
  }
}

function goSessions(row: Issue) {
  const status = issueKindLabel(row.kind)
  void router.push({ name: 'sessions', query: { route: row.route, status } })
}

function goPage(row: Issue) {
  void router.push(`/pages/${encodeURIComponent(row.route)}`)
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="afm-page">
    <div class="lead">
      <h2>待处理</h2>
      <p class="afm-muted">
        与用户会话同一口径：路由现算为异常 / 缓慢后可在此确认、处理或重开。不混入告警工单。
        <template v-if="USE_ISSUES_MOCK">当前为本地 mock，未写入后端。</template>
      </p>
    </div>

    <div class="afm-card toolbar">
      <el-select v-model="kindFilter" placeholder="类型" style="width: 130px">
        <el-option label="全部类型" value="all" />
        <el-option label="异常" value="abnormal" />
        <el-option label="缓慢" value="slow" />
      </el-select>
      <el-select v-model="statusFilter" placeholder="状态" style="width: 140px">
        <el-option label="全部状态" value="all" />
        <el-option label="待处理" value="open" />
        <el-option label="跟进中" value="acked" />
        <el-option label="已处理" value="resolved" />
      </el-select>
      <div class="afm-muted" style="margin-left: auto">
        {{ windowLabel }} · 共 {{ filteredCount }} 条
      </div>
    </div>

    <p v-if="error" class="fallback">{{ error }}</p>

    <div class="afm-card section">
      <div class="afm-section-title">
        问题列表
        <span class="afm-hint">未关闭优先；异常、缓慢置顶对齐 Sessions</span>
      </div>
      <p v-if="loading" class="afm-muted empty">正在读取问题…</p>
      <el-table v-else-if="rows.length" :data="rows" size="default" stripe>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="kindTagType[row.kind as IssueKind]">
              {{ issueKindLabel(row.kind) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="问题" min-width="220">
          <template #default="{ row }">
            <div style="font-weight: 500">{{ row.route }}</div>
            <div class="afm-muted sub">{{ row.id }} · {{ row.window || windowLabel }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTagType[row.workflowStatus as IssueWorkflowStatus]">
              {{ issueStatusLabel(row.workflowStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="受影响会话" width="120">
          <template #default="{ row }">
            {{ row.affectedSessions != null ? row.affectedSessions.toLocaleString() : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button
              v-for="item in actionsFor(row)"
              :key="item.action"
              size="small"
              link
              :type="item.type"
              :loading="actingId === row.id"
              @click="onAction(row, item.action)"
            >
              {{ item.label }}
            </el-button>
            <el-button size="small" link @click="goSessions(row)">会话</el-button>
            <el-button size="small" link @click="goPage(row)">页面</el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-else class="afm-muted empty">
        {{ error ? '加载失败。' : '当前筛选下没有问题。' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.lead h2 {
  margin: 0;
  font-size: 18px;
}
.lead p {
  margin: 4px 0 0;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}
.section {
  margin-top: 16px;
}
.sub {
  font-size: 12px;
  margin-top: 2px;
}
.empty {
  margin: 8px 0 0;
}
.fallback {
  margin: 12px 0 0;
  color: var(--afm-warn);
  font-size: 13px;
}
</style>
