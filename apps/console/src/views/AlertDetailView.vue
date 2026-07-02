<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ChatDotSquare, MagicStick, Right, Link } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import EChart from '@/components/EChart.vue'
import DiagnosisPanel from '@/components/DiagnosisPanel.vue'
import { alertRows, getReportByAlert, releaseTimeline, taskRows, trendSeries } from '@/mock/data'

const route = useRoute()
const router = useRouter()

const alert = computed(() => alertRows.find((a) => a.id === route.params.id) ?? alertRows[0])
const report = computed(() => getReportByAlert(alert.value.id))
const linkedTask = computed(() =>
  alert.value.linkedTaskId ? taskRows.find((t) => t.id === alert.value.linkedTaskId) : undefined,
)

const severityTagType: Record<string, 'danger' | 'warning' | 'info'> = {
  S0: 'danger',
  S1: 'danger',
  S2: 'warning',
  S3: 'info',
}

const trendOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 30, bottom: 30 },
  xAxis: { type: 'category', data: trendSeries.lcp.map((p) => p[0]) },
  yAxis: { type: 'value', name: 's', axisLabel: { color: '#6b7280' } },
  series: [
    {
      type: 'line',
      smooth: true,
      data: trendSeries.lcp.map((p) => p[1]),
      lineStyle: { color: '#0077ee' },
      itemStyle: { color: '#0077ee' },
      areaStyle: { color: 'rgba(0, 119, 238, 0.1)' },
      markLine: {
        symbol: 'none',
        lineStyle: { color: '#ef4444', type: 'dashed' },
        data: [{ yAxis: 3, label: { formatter: '阈值 3s', position: 'end' } }],
      },
    },
  ],
}))

const timelineIconMap: Record<string, string> = {
  release: 'primary',
  anomaly: 'warning',
  alert: 'danger',
  agent: 'success',
  task: 'info',
}

const comments = ref([
  { user: '林琦彬', at: '2026-07-01 10:36', body: '已认领，正在联系资源组确认 banner 图片替换。' },
  { user: 'Agent', at: '2026-07-01 10:34', body: '生成诊断报告 v1，包含 4 项证据与 2 个根因候选。' },
])
const draft = ref('')

function submitComment() {
  if (!draft.value.trim()) return
  comments.value.unshift({
    user: '我',
    at: new Date().toISOString().slice(0, 16).replace('T', ' '),
    body: draft.value,
  })
  draft.value = ''
}

/* ---- create-task dialog, prefilled from the Agent report ---- */
const taskDialog = ref(false)
const taskForm = reactive({
  title: '',
  owner: '',
  priority: 'P1',
  acceptance: '',
  dueDate: '',
  evidenceIds: [] as string[],
})

function openTaskDialog() {
  const r = report.value
  taskForm.title = r ? r.conclusion.slice(0, 30) + '…' : `${alert.value.title} 治理`
  taskForm.owner = ''
  taskForm.priority = alert.value.severity === 'S0' || alert.value.severity === 'S1' ? 'P0' : 'P1'
  taskForm.acceptance = r?.actions[r.actions.length - 1] ?? ''
  taskForm.dueDate = ''
  taskForm.evidenceIds = r ? r.evidence.map((e) => e.id) : []
  taskDialog.value = true
}

function confirmTask() {
  taskDialog.value = false
  ElMessage.success('已创建治理任务 task-2001（示例），可在治理任务中查看')
  router.push({ name: 'task-detail', params: { id: 'task-2001' } })
}

function openLinkedTask() {
  if (linkedTask.value) router.push({ name: 'task-detail', params: { id: linkedTask.value.id } })
}
</script>

<template>
  <div class="afm-page">
    <div class="header afm-card">
      <div class="header-top">
        <el-button link :icon="ArrowLeft" @click="router.back()">返回告警列表</el-button>
        <el-tag :type="severityTagType[alert.severity]">{{ alert.severity }}</el-tag>
        <el-tag type="danger" v-if="alert.status === 'firing'">触发中</el-tag>
        <el-tag type="warning" v-else-if="alert.status === 'acknowledged'">已认领</el-tag>
        <el-tag type="success" v-else-if="alert.status === 'resolved'">已恢复</el-tag>
        <el-tag type="info" v-else>已静默</el-tag>
        <div class="afm-muted">{{ alert.id }}</div>
      </div>
      <div class="header-title">{{ alert.title }}</div>
      <div class="afm-muted header-sub">
        页面 {{ alert.route }} · 指标 {{ alert.metric }} · 版本 {{ alert.release }} · 首触
        {{ alert.firstSeen }}
      </div>
      <div class="header-actions">
        <el-button v-if="!linkedTask" type="primary" @click="openTaskDialog">创建治理任务</el-button>
        <el-button>认领</el-button>
        <el-button>静默 1 小时</el-button>
        <el-button>标记为误报</el-button>
      </div>

      <!-- Linked task banner -->
      <div v-if="linkedTask" class="linked-task" @click="openLinkedTask">
        <el-icon><Link /></el-icon>
        <span>已生成治理任务 <b>{{ linkedTask.id }}</b> · {{ linkedTask.title }}</span>
        <el-tag size="small" style="margin-left: auto">{{ linkedTask.status }}</el-tag>
        <el-icon><Right /></el-icon>
      </div>
    </div>

    <div class="afm-metric-grid section">
      <MetricCard label="当前值" :value="alert.triggerValue" delta="超阈值" delta-dir="up" :good="false" />
      <MetricCard label="基线" :value="alert.baseline" hint="过去 7 天 P75" />
      <MetricCard label="变化幅度" value="+70.8%" delta="持续 103 分钟" delta-dir="up" :good="false" />
      <MetricCard
        label="影响用户"
        :value="alert.affectedUsers.toLocaleString()"
        delta="~18.7% 移动端会话"
        delta-dir="up"
        :good="false"
      />
    </div>

    <div class="split section">
      <div class="split-main">
        <div class="afm-card">
          <div class="afm-section-title">
            指标趋势
            <span class="afm-hint">最近 24 小时 · {{ alert.metric }}</span>
          </div>
          <EChart :option="trendOption" height="280px" />
        </div>

        <!-- Convergence info -->
        <div v-if="alert.convergence" class="afm-card section">
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

        <div class="afm-card section">
          <div class="afm-section-title">时间线</div>
          <el-timeline>
            <el-timeline-item
              v-for="(item, idx) in releaseTimeline"
              :key="idx"
              :timestamp="item.time"
              :type="timelineIconMap[item.kind] as never"
              placement="top"
            >
              {{ item.label }}
            </el-timeline-item>
          </el-timeline>
        </div>

        <!-- Agent tool-call trace (collapsible, audit) -->
        <div v-if="report && report.toolCalls.length" class="afm-card section">
          <el-collapse>
            <el-collapse-item name="trace">
              <template #title>
                <div class="trace-title">
                  <el-icon><MagicStick /></el-icon>
                  Agent 工具调用轨迹
                  <span class="afm-hint">{{ report.toolCalls.length }} 次只读调用 · 审计用</span>
                </div>
              </template>
              <el-table :data="report.toolCalls" size="small">
                <el-table-column label="#" width="50">
                  <template #default="{ $index }">t{{ $index + 1 }}</template>
                </el-table-column>
                <el-table-column label="工具" width="150">
                  <template #default="{ row }"><code class="mono">{{ row.tool }}</code></template>
                </el-table-column>
                <el-table-column label="入参" min-width="220">
                  <template #default="{ row }"><span class="afm-muted mono">{{ row.input }}</span></template>
                </el-table-column>
                <el-table-column label="耗时" width="80">
                  <template #default="{ row }">{{ row.durationMs }}ms</template>
                </el-table-column>
                <el-table-column label="输出摘要" min-width="200" prop="output" />
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">
            <el-icon><ChatDotSquare /></el-icon>
            协作
          </div>
          <el-input v-model="draft" type="textarea" :rows="2" placeholder="添加评论或处理记录" />
          <div style="margin-top: 8px; text-align: right">
            <el-button type="primary" @click="submitComment">发送</el-button>
          </div>
          <el-divider />
          <div v-for="(c, idx) in comments" :key="idx" class="comment">
            <div class="comment-header">
              <span class="user">{{ c.user }}</span>
              <span class="afm-muted">{{ c.at }}</span>
            </div>
            <div>{{ c.body }}</div>
          </div>
        </div>
      </div>
      <div class="split-side">
        <DiagnosisPanel :report="report" />
      </div>
    </div>

    <!-- Create-task dialog prefilled from Agent report -->
    <el-dialog v-model="taskDialog" title="创建治理任务" width="560px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="以下字段已根据 Agent 诊断报告预填，可修改后提交"
        style="margin-bottom: 16px"
      />
      <el-form :model="taskForm" label-width="96px" label-position="left">
        <el-form-item label="任务标题">
          <el-input v-model="taskForm.title" />
        </el-form-item>
        <el-form-item label="负责人">
          <el-select v-model="taskForm.owner" placeholder="选择负责人" style="width: 100%">
            <el-option label="林琦彬" value="林琦彬" />
            <el-option label="王小星" value="王小星" />
            <el-option label="陈开" value="陈开" />
            <el-option label="李默" value="李默" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="taskForm.priority">
            <el-radio-button value="P0">P0</el-radio-button>
            <el-radio-button value="P1">P1</el-radio-button>
            <el-radio-button value="P2">P2</el-radio-button>
            <el-radio-button value="P3">P3</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="验收指标">
          <el-input v-model="taskForm.acceptance" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="截止时间">
          <el-date-picker v-model="taskForm.dueDate" type="date" placeholder="选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="关联证据">
          <el-tag v-for="id in taskForm.evidenceIds" :key="id" size="small" style="margin-right: 6px">
            {{ id }}
          </el-tag>
          <span v-if="!taskForm.evidenceIds.length" class="afm-muted">无</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmTask">创建任务</el-button>
      </template>
    </el-dialog>
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
.linked-task {
  margin-top: 14px;
  padding: 10px 14px;
  border: 1px solid rgba(0, 119, 238, 0.15);
  background: var(--afm-accent-soft);
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color var(--afm-motion-fast) var(--afm-ease);
}
.linked-task:hover {
  background: rgba(0, 119, 238, 0.1);
}
.section {
  margin-top: 20px;
}
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
