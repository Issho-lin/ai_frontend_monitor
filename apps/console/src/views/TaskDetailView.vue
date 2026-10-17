<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Right } from '@element-plus/icons-vue'
import MetricCard from '@/components/MetricCard.vue'
import EChart from '@/components/EChart.vue'
import DiagnosisPanel from '@/components/DiagnosisPanel.vue'
import { getReportByAlert } from '@/mock/data'
import { useTaskDetailData } from '@/composables/useTaskDetailData'

const route = useRoute()
const router = useRouter()

const taskId = computed(() => String(route.params.id || ''))
const { task, acting, applyAction } = useTaskDetailData(taskId)
const spec = computed(() => task.value.acceptanceSpec)
const verification = computed(() => task.value.verification)
const meetingTarget = computed(
  () => spec.value.current <= spec.value.target,
)

const referencedReport = computed(() => getReportByAlert(task.value.sourceAlertId))

const statusMap: Record<
  string,
  { text: string; type: 'primary' | 'warning' | 'success' | 'danger' | 'info' }
> = {
  Open: { text: '待认领', type: 'info' },
  InProgress: { text: '修复中', type: 'primary' },
  Verifying: { text: '验证中', type: 'warning' },
  Resolved: { text: '已关闭', type: 'success' },
  Reopened: { text: '再次触发', type: 'danger' },
}

const verifyOption = computed(() => {
  const s = spec.value
  const points = verification.value?.series?.length
    ? verification.value.series.map((point) => [point.timestamp, point.value] as [string, number])
    : []
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['LCP P75', '目标线'] },
    grid: { left: 48, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: points.map((p) => p[0]) },
    yAxis: { type: 'value', name: s.unit, axisLabel: { color: '#6b7280' } },
    series: [
      {
        name: 'LCP P75',
        type: 'line',
        smooth: true,
        data: points.map((p) => p[1]),
        lineStyle: { color: meetingTarget.value ? '#10b981' : '#ef4444' },
        itemStyle: { color: meetingTarget.value ? '#10b981' : '#ef4444' },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#0077ee', type: 'dashed' },
          data: [{ yAxis: s.target, label: { formatter: `目标 ${s.target}${s.unit}`, position: 'end' } }],
        },
      },
    ],
  }
})

const activity = ref([
  { at: '2026-07-02 09:20', type: 'verify', text: '观察窗口进行中 · LCP P75 当前 2.4s（目标 <= 2.5s）' },
  { at: '2026-07-02 08:05', type: 'commit', text: '关联 commit 3f9a12e：banner 图片改为 WebP，体积 240KB' },
  { at: '2026-07-02 07:55', type: 'release', text: 'v1.18.1 发布至生产环境' },
  { at: '2026-07-01 14:12', type: 'comment', text: '推荐接口已加入超时降级与骨架屏策略' },
  { at: '2026-07-01 11:05', type: 'created', text: '基于告警 alrt-1001 创建任务并指派负责人' },
])

function verifyState() {
  const s = task.value.status
  if (s === 'Resolved') return { text: 'passed', type: 'success' as const }
  if (s === 'Reopened') return { text: 'failed', type: 'danger' as const }
  if (s === 'Verifying' && meetingTarget.value) return { text: 'meeting', type: 'success' as const }
  if (s === 'Verifying') return { text: 'observing', type: 'warning' as const }
  return { text: 'pending', type: 'info' as const }
}

function openSourceAlert() {
  router.push({ name: 'alert-detail', params: { id: task.value.sourceAlertId } })
}

function openFixRelease() {
  router.push({ name: 'release-detail', params: { version: task.value.fixRelease } })
}

async function startFix() {
  await applyAction('start')
  ElMessage.success('任务已进入修复中')
}

async function submitFix() {
  try {
    const { value } = await ElMessageBox.prompt('请输入本次修复发布的版本号（需与 SDK release 一致）', '提交修复版本', {
      confirmButtonText: '进入观察窗口',
      cancelButtonText: '取消',
      inputPlaceholder: '例如 1.18.1 或 v1.18.1',
      inputValue: task.value.fixRelease || '',
      inputValidator: (val) => Boolean(val?.trim()) || '版本号不能为空',
    })
    await applyAction('submit_fix', { release: String(value).trim() })
    ElMessage.success(`已关联版本 ${String(value).trim()}，进入观察窗口`)
  } catch {
    // cancelled
  }
}

async function resolveTask() {
  await applyAction('resolve')
  ElMessage.success('任务已关闭')
}

async function reopenTask() {
  await applyAction('reopen')
  ElMessage.warning('任务已标记为再次触发')
}
</script>

<template>
  <div class="afm-page">
    <div class="afm-card header">
      <div class="header-top">
        <el-button link :icon="ArrowLeft" @click="router.back()">返回任务列表</el-button>
        <el-tag :type="statusMap[task.status].type">{{ statusMap[task.status].text }}</el-tag>
        <el-tag>{{ task.priority }}</el-tag>
        <div class="afm-muted">{{ task.id }}</div>
      </div>
      <div class="header-title">{{ task.title }}</div>
      <div class="afm-muted header-sub">
        页面 {{ task.route }} · 负责人 {{ task.owner }} · 来源
        <a class="alert-link" @click="openSourceAlert">
          {{ task.sourceAlertId }}
          <el-icon><Right /></el-icon>
        </a>
        · 截止 {{ task.dueDate }}
        <template v-if="task.fixRelease">
          · 修复版本
          <a class="alert-link" @click="openFixRelease">{{ task.fixRelease }}</a>
        </template>
      </div>
      <div class="header-actions">
        <el-button
          v-if="task.status === 'Open' || task.status === 'Reopened'"
          type="primary"
          :loading="acting"
          @click="startFix"
        >
          开始修复
        </el-button>
        <el-button
          v-if="task.status === 'InProgress'"
          :loading="acting"
          @click="submitFix"
        >
          提交修复版本
        </el-button>
        <el-button
          v-if="task.status === 'Verifying'"
          :loading="acting"
          @click="resolveTask"
        >
          关闭为已修复
        </el-button>
        <el-button
          v-if="task.status !== 'Resolved' && task.status !== 'Reopened'"
          type="danger"
          plain
          :loading="acting"
          @click="reopenTask"
        >
          标记再次触发
        </el-button>
      </div>
    </div>

    <div class="afm-metric-grid section">
      <MetricCard label="验收指标" :value="spec.label" hint="修复目标" />
      <MetricCard label="观察窗口" :value="`${spec.windowHours} 小时`" hint="修复后连续观察" />
      <MetricCard
        label="当前值 / 目标"
        :value="`${spec.current}${spec.unit} / ${spec.target}${spec.unit}`"
        :delta="`基线 ${spec.baseline}${spec.unit}`"
        :delta-dir="meetingTarget ? 'down' : 'up'"
        :good="meetingTarget"
      />
      <div class="afm-metric">
        <div class="label">
          <span>验证状态</span>
          <span class="afm-muted">修复验证 Worker</span>
        </div>
        <div class="value">
          <el-tag size="large" :type="verifyState().type">{{ verifyState().text }}</el-tag>
        </div>
        <div class="delta">
          {{
            verifyState().text === 'passed'
              ? '验收指标已连续达标'
              : verifyState().text === 'meeting'
                ? '观察窗口内已低于目标'
                : verifyState().text === 'observing'
                  ? '观察窗口进行中，尚未达标'
                  : verifyState().text === 'failed'
                    ? '指标再次劣化'
                    : '等待验证'
          }}
        </div>
      </div>
    </div>

    <div class="split section">
      <div class="split-main">
        <div class="afm-card">
          <div class="afm-section-title">
            修复验证
            <span class="afm-hint">最近 {{ spec.windowHours }} 小时 · {{ spec.label }} 真实 P75</span>
          </div>
          <EChart :option="verifyOption" height="300px" />
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">修复记录</div>
          <el-timeline>
            <el-timeline-item
              v-for="(a, idx) in activity"
              :key="idx"
              :timestamp="a.at"
              placement="top"
            >
              {{ a.text }}
            </el-timeline-item>
          </el-timeline>
        </div>

        <div class="afm-card section">
          <div class="afm-section-title">复盘沉淀</div>
          <el-form label-width="120px" label-position="left">
            <el-form-item label="最终根因">
              <el-input
                type="textarea"
                :rows="3"
                placeholder="示例：v1.18.0 上线的 banner 图片未走 CDN 压缩流水线"
              />
            </el-form-item>
            <el-form-item label="修复方式">
              <el-input
                type="textarea"
                :rows="3"
                placeholder="示例：改为 WebP 并接入 CDN 压缩；推荐接口增加超时降级和骨架屏"
              />
            </el-form-item>
            <el-form-item label="防复发措施">
              <el-input
                type="textarea"
                :rows="3"
                placeholder="示例：CI 增加静态资源体积阈值检查；推荐接口纳入 SLO 观察"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary">保存复盘</el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>

      <div class="split-side">
        <DiagnosisPanel :report="referencedReport" variant="reference" />
      </div>
    </div>
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
.alert-link {
  color: var(--afm-accent);
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.alert-link:hover {
  text-decoration: underline;
}
.header-actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
.section {
  margin-top: 16px;
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
</style>
